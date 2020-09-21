import { Text as AutomergeText } from "automerge";
import {
  Editor,
  InsertNodeOperation,
  InsertTextOperation,
  MergeNodeOperation,
  MoveNodeOperation,
  Node,
  Operation,
  Path,
  RemoveNodeOperation,
  RemoveTextOperation,
  SetNodeOperation,
  SplitNodeOperation,
} from "slate";
import { cloneObject } from "./bridge/toSlateEditor";
import { SyncEditorChildren, SyncNode, toSyncNode } from "./toSyncEditor";

const cloneSyncNode = (object: SyncNode): SyncNode => {
  return toSyncNode(cloneObject(object));
};

const getAutomergeObject = (doc: SyncEditorChildren, path: Path): SyncNode => {
  return Node.get({ children: doc } as Editor, path) as SyncNode;
};

const getParentAutomergeObject = (
  doc: SyncEditorChildren,
  path: Path
): SyncNode => {
  return Node.parent({ children: doc } as Editor, path) as SyncNode;
};

const insertNode = ({
  doc,
  operation,
}: {
  doc: SyncEditorChildren;
  operation: InsertNodeOperation;
}) => {
  const { path, node } = operation;
  const parent = getParentAutomergeObject(doc, path);
  const index = path[path.length - 1];
  parent.children.insertAt(index, toSyncNode(node));
};

const insertText = ({
  doc,
  operation,
}: {
  doc: SyncEditorChildren;
  operation: InsertTextOperation;
}) => {
  const { path, offset, text } = operation;
  const object = getAutomergeObject(doc, path);
  const automergeText = new AutomergeText(text);
  object.text.insertAt(offset, ...automergeText);
};

const mergeNode = ({
  doc,
  operation,
}: {
  doc: SyncEditorChildren;
  operation: MergeNodeOperation;
}) => {
  const { path } = operation;
  const object = getAutomergeObject(doc, path);
  const prevPath = Path.previous(path);
  const prevObject = getAutomergeObject(doc, prevPath);
  const parent = getParentAutomergeObject(doc, path);
  const index = path[path.length - 1];

  if (object.text && prevObject.text) {
    prevObject.text.insertAt(
      prevObject.text.length,
      ...cloneObject(object.text).split("")
    ); // TODO : splitしなくて良さそう？
  } else if (!object.text && !prevObject.text) {
    object.children.forEach((o: SyncNode) =>
      prevObject.children.push(cloneSyncNode(o))
    );
  } else {
    throw new Error(
      `Cannot apply a "merge_node" operation at path [${path}] to nodes of different interfaces: ${object} ${prevObject}`
    );
  }

  parent.children.deleteAt(index);
};

const moveNode = ({
  doc,
  operation,
}: {
  doc: SyncEditorChildren;
  operation: MoveNodeOperation;
}) => {
  const { path } = operation;

  // pathの位置からnodeを取り除く
  const object = getAutomergeObject(doc, path);
  const parent = getParentAutomergeObject(doc, path);
  const index = path[path.length - 1];
  parent.children.splice(index, 1);

  // newPathはoperationから取り出さない
  // list-itemをインデントするなどケースでは、newPathが元あったpathを加味してoperationを送ってくるものの、ここで処理する時点ではnewPathは存在しなくなる。
  // 例えばpath:[0, 1] から [0, 1, 0]に移動すると、operation.newPathは[0, 2, 0]が入っている。Slateが一度[0, 2, 0]に移動してから[0, 1]を削除しているため。
  // よって、Path.transformを使ってpathが移動した現在のpath（newPath）を取得する
  const newPath = Path.transform(path, operation);
  if (!newPath) {
    throw new Error("Cannot transform path");
  }

  const newParent = getAutomergeObject(doc, Path.parent(newPath));
  const newIndex = newPath[newPath.length - 1];

  // nodeを移動するとAutomergeのバグでundoできなくなる可能性があるので、そのまま入れずに別のオブジェクトに変換してから入れる
  // https://github.com/automerge/automerge/issues/247
  newParent.children.insertAt(newIndex, cloneSyncNode(object));
};

const removeNode = ({
  doc,
  operation,
}: {
  doc: SyncEditorChildren;
  operation: RemoveNodeOperation;
}) => {
  const { path } = operation;
  const index = path[path.length - 1];
  const parent = getParentAutomergeObject(doc, path);
  parent.children.deleteAt(index, 1);
};

const removeText = ({
  doc,
  operation,
}: {
  doc: SyncEditorChildren;
  operation: RemoveTextOperation;
}) => {
  const { path, offset, text } = operation;
  const object = getAutomergeObject(doc, path);
  if (text && text !== "") {
    object.text.deleteAt(offset, text.length);
  }
};

const setNode = ({
  doc,
  operation,
}: {
  doc: SyncEditorChildren;
  operation: SetNodeOperation;
}) => {
  const { path, newProperties } = operation;

  if (path.length === 0) {
    throw new Error(`Cannot set properties on the root node!`);
  }

  const object = getAutomergeObject(doc, path);

  for (const key in newProperties) {
    if (key === "children" || key === "text") {
      throw new Error(`Cannot set the "${key}" property of nodes!`);
    }

    const value = newProperties[key];

    if (value == null) {
      delete object[key];
    } else {
      object[key] = value;
    }
  }
};

const splitNode = ({
  doc,
  operation,
}: {
  doc: SyncEditorChildren;
  operation: SplitNodeOperation;
}) => {
  const { path, position } = operation;

  if (path.length === 0) {
    throw new Error(
      `Cannot apply a "split_node" operation at path [${path}] because the root node cannot be split.`
    );
  }

  const object = getAutomergeObject(doc, path);
  const parent = getParentAutomergeObject(doc, path);
  const index = path[path.length - 1];
  const newNode = cloneSyncNode(object);

  if (object.text) {
    // objectがtextの時は、上のobjectに2つのtextをぶら下げる（その後に別のoperationで2つのパラグラフに分けられる）
    const after = object.text.slice(position);
    if (after.length > 0) {
      object.text.deleteAt(position, after.length);
    }
    newNode.text.deleteAt(0, position);
  } else {
    const after = object.children.slice(position); // position以降のchildrenを後ろのobjectにする
    if (after.length > 0) {
      object.children.deleteAt(position, after.length);
    }
    newNode.children.splice(0, position);
  }

  parent.children.insertAt(index + 1, newNode);
};

export const applySlateOperation = (
  doc: SyncEditorChildren,
  operation: Operation
): void => {
  switch (operation.type) {
    case "insert_node": {
      insertNode({ doc, operation });
      break;
    }
    case "insert_text": {
      insertText({ doc, operation });
      break;
    }
    case "merge_node": {
      mergeNode({ doc, operation });
      break;
    }
    case "move_node": {
      moveNode({ doc, operation });
      break;
    }
    case "remove_node": {
      removeNode({ doc, operation });
      break;
    }
    case "remove_text": {
      removeText({ doc, operation });
      break;
    }
    case "set_node": {
      setNode({ doc, operation });
      break;
    }
    case "split_node": {
      splitNode({ doc, operation });
      break;
    }
    default: {
      // set_selection など
      break;
    }
  }
};

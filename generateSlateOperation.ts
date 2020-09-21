import { Diff, FreezeObject } from "automerge";
import { Operation } from "slate";
import { Path } from "slate/dist/interfaces/path";
import { convertSlateNode } from "./bridge/toSlateEditor";
import { SyncEditorChildren } from "./toSyncEditor";

type MaybeOperation = Operation | undefined;

const convertSlatePath = (path: (string | number)[] | undefined): Path =>
  path ? path.map((d) => Number(d)).filter((d) => Number.isInteger(d)) : [];

const generateOperationBySetAction = (
  diff: Diff,
  currentDoc: FreezeObject<SyncEditorChildren>,
  newDoc: FreezeObject<SyncEditorChildren>
): MaybeOperation => {
  const { value, path, key, obj } = diff;
  const currentNode = convertSlateNode(currentDoc, obj);
  const newNode = convertSlateNode(newDoc, obj);
  if (!currentNode || !newNode) {
    // ノードがこれからinsertされるか、または新しいドキュメントから消えた
    return undefined;
  }

  if (!key || key === "children") {
    return undefined;
  }

  return {
    type: "set_node",
    path: convertSlatePath(path),
    properties: {},
    newProperties: { [key]: value },
  };
};

const generateInsertTextOperation = (
  diff: Diff,
  _currentDoc: FreezeObject<SyncEditorChildren>,
  newDoc: FreezeObject<SyncEditorChildren>
): MaybeOperation => {
  const { index, path, value, obj } = diff;
  const newNode = convertSlateNode(newDoc, obj);
  if (!newNode && typeof newNode !== "string") {
    return undefined;
  }

  if (!path || (!index && index !== 0)) {
    return undefined;
  }

  return {
    type: "insert_text",
    path: convertSlatePath(path),
    offset: index,
    text: value,
  };
};

const generateInsertNodeOperation = (
  diff: Diff,
  currentDoc: FreezeObject<SyncEditorChildren>,
  newDoc: FreezeObject<SyncEditorChildren>
): MaybeOperation => {
  const { path, obj, index, value } = diff;
  if (!value) {
    return undefined;
  }

  const newNode = convertSlateNode(newDoc, value);
  const currentParentNode = convertSlateNode(currentDoc, obj);
  if (!currentParentNode || !newNode || typeof newNode === "string") {
    // currentParentNodeがなければ、親でinsertされるのでやらなくて良い
    return undefined;
  }

  if (!path || (!index && index !== 0)) {
    return undefined;
  }

  return {
    type: "insert_node",
    path: convertSlatePath(path.concat([index.toString()])),
    node: newNode,
  };
};

const generateOperationByInsertAction = (
  diff: Diff,
  currentDoc: FreezeObject<SyncEditorChildren>,
  newDoc: FreezeObject<SyncEditorChildren>
): MaybeOperation => {
  const { type } = diff;

  switch (type) {
    case "text": {
      return generateInsertTextOperation(diff, currentDoc, newDoc);
    }
    case "list": {
      return generateInsertNodeOperation(diff, currentDoc, newDoc);
    }
    default:
      return undefined;
  }
};

const generateRemoveTextOperation = (
  diff: Diff,
  currentDoc: FreezeObject<SyncEditorChildren>,
  _newDoc: FreezeObject<SyncEditorChildren>
): MaybeOperation => {
  const { index, path, obj } = diff;
  const currentNode = convertSlateNode(currentDoc, obj);
  if (!currentNode && typeof currentNode !== "string") {
    return undefined;
  }

  if (!path || (!index && index !== 0)) {
    return undefined;
  }

  return {
    type: "remove_text",
    path: convertSlatePath(path),
    offset: index,
    text: "*",
  };
};

const generateRemoveNodeOperation = (
  diff: Diff,
  currentDoc: FreezeObject<SyncEditorChildren>,
  _newDoc: FreezeObject<SyncEditorChildren>
): MaybeOperation => {
  const { path, index, obj } = diff;
  const currentNode = convertSlateNode(currentDoc, obj);
  if (!currentNode) {
    // 消したいノードが存在していない、または新しいドキュメントにまだある
    return undefined;
  }

  if (!path || (!index && index !== 0)) {
    return undefined;
  }

  return {
    type: "remove_node",
    path: convertSlatePath(path.concat([index.toString()])),
    node: { text: "*" }, // 空のノード
  };
};

const generateRemovePropertyOperation = (
  diff: Diff,
  currentDoc: FreezeObject<SyncEditorChildren>,
  _newDoc: FreezeObject<SyncEditorChildren>
): MaybeOperation => {
  const { path, key, obj } = diff;
  const currentNode = convertSlateNode(currentDoc, obj);
  if (!currentNode || typeof currentNode === "string") {
    return undefined;
  }

  if (!key) {
    return undefined;
  }

  return {
    type: "set_node",
    path: convertSlatePath(path),
    properties: { [key]: currentNode[key] },
    newProperties: { [key]: undefined },
  };
};

const generateOperationByRemoveAction = (
  diff: Diff,
  currentDoc: FreezeObject<SyncEditorChildren>,
  newDoc: FreezeObject<SyncEditorChildren>
): MaybeOperation => {
  const { type } = diff;

  switch (type) {
    case "text": {
      return generateRemoveTextOperation(diff, currentDoc, newDoc);
    }
    case "list": {
      return generateRemoveNodeOperation(diff, currentDoc, newDoc);
    }
    case "map": {
      return generateRemovePropertyOperation(diff, currentDoc, newDoc);
    }
    default:
      return undefined;
  }
};

export const generateSlateOperations = (
  diffs: Diff[],
  currentDoc: FreezeObject<SyncEditorChildren>,
  newDoc: FreezeObject<SyncEditorChildren>
): Operation[] => {
  return diffs
    .map(
      (diff: Diff): MaybeOperation => {
        let operation: MaybeOperation = undefined;
        switch (diff.action) {
          case "remove": {
            operation = generateOperationByRemoveAction(
              diff,
              currentDoc,
              newDoc
            );
            break;
          }
          case "set": {
            operation = generateOperationBySetAction(diff, currentDoc, newDoc);
            break;
          }
          case "insert": {
            operation = generateOperationByInsertAction(
              diff,
              currentDoc,
              newDoc
            );
            break;
          }
          default:
            operation = undefined;
        }
        return operation;
      }
    )
    .filter((value: MaybeOperation): value is Operation => !!value);
};

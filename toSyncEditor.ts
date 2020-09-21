import { Text as AutomergeText } from 'automerge';
import { Node, Text as SlateText } from 'slate';

export type SyncText = {
  text: AutomergeText;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export type SyncElement = {
  children: SyncNode[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

// root type
export type SyncEditorChildren = Array<{
  children: SyncNode[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}>;

export type SyncNode = SyncElement | SyncText;

export const toSyncNode = (node: Node): SyncNode => {
  if (SlateText.isText(node)) {
    return {
      ...node,
      text: new AutomergeText(node.text),
    };
  } else if (node.children) {
    return {
      ...node,
      children: node.children.map(toSyncNode),
    };
  }

  return node as SyncNode;
};

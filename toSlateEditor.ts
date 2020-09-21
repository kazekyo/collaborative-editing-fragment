import { FreezeObject, getObjectById } from 'automerge';
import { Node } from 'slate';
import { SyncEditorChildren, SyncNode } from './toSyncEditor';

// eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/explicit-module-boundary-types
export const cloneObject = (value: any): any => {
  return JSON.parse(JSON.stringify(value));
};

const toSlateNode = (object: SyncNode) => {
  if (object.text) {
    const properties = typeof object.text === 'string' ? {} : { text: object.text.join('') };
    return {
      ...object,
      ...properties,
    };
  } else if (object.children) {
    return {
      ...object,
      children: object.children.map(toSlateNode),
    };
  }
  return object;
};

export const toSlateEditor = (doc: FreezeObject<SyncEditorChildren>): Node[] => {
  return [{ children: doc[0].children.map(toSlateNode) }];
};

// textのobjectIdを指定するとstringになる
export const convertSlateNode = (
  doc: FreezeObject<SyncEditorChildren>,
  objectId: string,
): Node | string | undefined => {
  const object = getObjectById(doc, objectId);
  if (!object) {
    return undefined;
  }
  return toSlateNode(cloneObject(object));
};

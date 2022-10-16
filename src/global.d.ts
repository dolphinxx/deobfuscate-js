import * as ESTree from 'estree';

declare module 'estree' {
  interface BaseNodeWithoutComments {
    $parent:ESTree.Node | null;
  }
}

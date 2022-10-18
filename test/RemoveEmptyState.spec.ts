import * as ESTree from 'estree';
import {describe} from 'mocha';
import { assert } from 'chai';
import {loadCodeTree, loadText} from "./utils";
import {removeEmptyState, serializeAst} from "../src/traverse";


describe('removeEmptyState', () => {
  describe('Variant #1', () => {
    let code: ESTree.Node;
    let expected: string;

    before(() => {
      code = loadCodeTree('RemoveEmptyState.test.txt');
      expected = loadText('RemoveEmptyState.expected.txt');
    });

    it('should removeEmptyState', () => {
      removeEmptyState(code);
      const actual = serializeAst(code);
      assert.equal(actual, expected);
    });
  });
});
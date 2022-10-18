import * as ESTree from 'estree';
import {describe} from 'mocha';
import { assert } from 'chai';
import {loadCodeTree, loadText} from "./utils";
import {flattenWrappedBlock, serializeAst} from "../src/traverse";


describe('flattenWrappedBlock', () => {
  describe('Variant #1', () => {
    let code: ESTree.Node;
    let expected: string;

    before(() => {
      code = loadCodeTree('FlattenWrappedBlock.test.txt');
      expected = loadText('FlattenWrappedBlock.expected.txt');
    });

    it('should flattenWrappedBlock', () => {
      flattenWrappedBlock(code);
      const actual = serializeAst(code);
      assert.equal(actual, expected);
    });
  });
});
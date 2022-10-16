import * as ESTree from 'estree';
import {describe} from 'mocha';
import { assert } from 'chai';
import {loadCodeTree, loadText} from "./utils";
import {flattenHashedCall, serializeAst} from "../src/traverse";


describe('flattenHashedCall', () => {
  describe('Variant #1', () => {
    let code: ESTree.Node;
    let expected: string;

    before(() => {
      code = loadCodeTree('FlattenHashedCall.test.txt');
      expected = loadText('FlattenHashedCall.expected.txt');
    });

    it('should flatten hashed call', () => {
      flattenHashedCall(code);
      flattenHashedCall(code);
      const actual = serializeAst(code);
      assert.equal(actual, expected);
    });
  });
});
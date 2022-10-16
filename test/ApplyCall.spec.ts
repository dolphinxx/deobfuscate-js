import * as ESTree from 'estree';
import {describe} from 'mocha';
import { assert } from 'chai';
import {loadCodeTree, loadText} from "./utils";
import {removeApplyCall, serializeAst} from "../src/traverse";


describe('removeApplyCall', () => {
  describe('Variant #1', () => {
    let code: ESTree.Node;
    let expected: string;

    before(() => {
      code = loadCodeTree('ApplyCall.test.txt');
      expected = loadText('ApplyCall.expected.txt');
    });

    it('should removeApplyCall', () => {
      removeApplyCall(code);
      const actual = serializeAst(code);
      assert.equal(actual, expected);
    });
  });
});
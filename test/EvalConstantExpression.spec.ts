import * as ESTree from 'estree';
import {describe} from 'mocha';
import { assert } from 'chai';
import {loadCodeTree, loadText} from "./utils";
import {evalConstantExpression, serializeAst} from "../src/traverse";


describe('evalConstantExpression', () => {
  describe('Variant #1', () => {
    let code: ESTree.Node;
    let expected: string;

    before(() => {
      code = loadCodeTree('EvalConstantExpression.test.txt');
      expected = loadText('EvalConstantExpression.expected.txt');
    });

    it('should evalConstantExpression', () => {
      evalConstantExpression(code);
      const actual = serializeAst(code);
      assert.equal(actual, expected);
    });
  });
});
// @ts-ignore
import {VisitorOption, traverse, replace} from '@javascript-obfuscator/estraverse';
import * as ESTree from 'estree';
// @ts-ignore
import * as esprima from 'esprima';
// @ts-ignore
import * as escodegen from '@javascript-obfuscator/escodegen';
import Syntax from './syntax';

export function createConstantNode(value:any, parent: ESTree.Node|null):ESTree.Node {
  if(value === undefined) {
    return {
      $parent: parent,
      type: Syntax.Identifier,
      name: 'undefined'
    }
  }
  if(value === null) {
    return {
      $parent: parent,
      type: Syntax.Literal,
      value: null,
      raw: 'null'
    }
  }
  if(typeof value === 'number') {
    if(isNaN(value)) {
      return {
        type: Syntax.Identifier,
        name: 'NaN',
        $parent: parent
      }
    }
    if(value === Infinity) {
      return {
        type: Syntax.Identifier,
        name: 'Infinity',
        $parent: parent
      }
    }
    if(value < 0) {
      const simpleLiteral:ESTree.Literal = {
        $parent: null,
        type: Syntax.Literal,
        value: Math.abs(value)
      };
      const _:ESTree.UnaryExpression = {
        type: Syntax.UnaryExpression,
        operator: '-',
        argument: simpleLiteral,
        prefix: true,
        $parent: parent
      }
      simpleLiteral.$parent = _;
      return _;
    }
  }
  return {
    "$parent": parent,
    "type": Syntax.Literal,
    "value": value,
    "raw": `${JSON.stringify(value)}`
  }
}

export function isConstantValue(node:ESTree.Node):boolean {
  if(node.type === Syntax.Identifier) {
    const name = (node as ESTree.Identifier).name;
    return ['undefined', 'NaN', 'Infinity'].indexOf(name) !== -1;
  }
  if(node.type === Syntax.Literal) {
    return true;
  }
  if(node.type === Syntax.UnaryExpression) {
    return isConstantValue((node as ESTree.UnaryExpression).argument);
  }
  return false;
}

export function closest<T extends ESTree.Node>(node:ESTree.Node|null, type:string|string[]):T|null {
  if(node == null) {
    return null;
  }
  if(!node.hasOwnProperty('$parent') || node.$parent == null) {
    return null;
  }
  if(type instanceof Array && type.indexOf(node.$parent.type) !== -1) {
    return node.$parent as T;
  }
  if(node.$parent.type === type) {
    return node.$parent as T;
  }
  return closest(node.$parent, type);
}

export function nearest<T extends ESTree.Node>(node:ESTree.Node|null, type:string|string[]):T|null {
  if(node == null) {
    return null;
  }
  let found:T|null = null;
  traverse(node, {
    enter(n:ESTree.Node) {
      if((type instanceof Array)) {
        if(type.indexOf(n.type) !== -1) {
          found = n as T;
          this.break();
        }
      } else if(n.type === type) {
        found = n as T;
        this.break();
      }
    }
  });
  return found;
}

/**
 * 从树或父节点移除节点
 */
export function removeNodeFromTree(node:ESTree.Node, tree?:ESTree.Node) {
  let done = false;
  replace(tree||node.$parent, {
    enter(n:ESTree.Node) {
      if(done) {
        this.break();
        return;
      }
      if(n === node) {
        this.remove();
        done = true;
      }
    }
  })
}

/**
 * 为节点添加对父节点的引用，方便向上查找
 */
export function applyParent(ast:ESTree.Node) {
  traverse(ast, {
    enter(node:ESTree.Node, parent:ESTree.Node | null) {
      node.$parent = parent;
    }
  });
  return ast;
}

/**
 * 通过序列化反序列化克隆
 */
export function cloneNode(node:ESTree.Node):ESTree.Node {
  let result = (parseAst(serializeAst(node)) as ESTree.Program).body[0];
  if(result.type === Syntax.ExpressionStatement) {
    return (result as ESTree.ExpressionStatement).expression;
  }
  return result;
}

export function replaceNode(find:ESTree.Node, replacement: ESTree.Node, tree:ESTree.Node) {
  let done = false;
  replace(tree, {
    enter(node:ESTree.Node, parent: ESTree.Node|null) {
      if(done) {
        this.break;
        return;
      }
      if(node === find) {
        done = true;
        replacement.$parent = parent;
        return replacement;
      }
    }
  })
}

/**
 * 从最近的块开始查找，是否有使用
 */
export function isIdentifierUsed(node:ESTree.Identifier): boolean {
  const root = closest(node, [Syntax.BlockStatement, Syntax.Program]);
  if(!root) {
    throw new Error(`closest block not found for ${node}`);
  }
  const name = node.name;
  let found = false;
  traverse(root, {
    enter(n:ESTree.Node) {
      if(n !== node && n.type === Syntax.Identifier && (n as ESTree.Identifier).name === name) {
        found = true;
        this.break();
      }
    }
  });
  return found;
}

export function parseAst(source:string):ESTree.Node {
  return applyParent(esprima.parse(source));
}

export function serializeAst(ast:ESTree.Node):string {
  return escodegen.generate(ast);
}
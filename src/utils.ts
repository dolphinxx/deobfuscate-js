// @ts-ignore
import {VisitorOption, traverse, replace} from '@javascript-obfuscator/estraverse';
import * as ESTree from 'estree';
// @ts-ignore
import * as esprima from 'esprima';
// @ts-ignore
import * as escodegen from '@javascript-obfuscator/escodegen';
import Syntax from './syntax';

export function toBooleanValue(value:any):boolean {
  return Boolean(value);
}

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

/**
 * find the closest parent that matches type
 * @param node
 * @param type
 */
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

/**
 * find the nearest descendent that matches type
 * @param node
 * @param type
 */
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
 * find a declaration whose name is the same as name.
 * @param root
 * @param name
 */
export function findIdentifierDeclaration(root: ESTree.Node, name:string):ESTree.Node|undefined {
  let found:ESTree.Node|undefined;
  traverse(root, {
    enter(n:ESTree.Node) {
      if(n.type === Syntax.VariableDeclarator && n.id.type === Syntax.Identifier && n.id.name === name) {
        found = n;
        this.break();
        return;
      }
      if(n.type === Syntax.FunctionDeclaration && n.id?.name === name) {
        found = n;
        this.break();
        return;
      }
    }
  });
  return found;
}

/**
 * ????????????????????????
 */
export function removeNodeFromTree(node:ESTree.Node) {
  let done = false;
  replace(node.$parent, {
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
 * ?????????????????????????????????????????????????????????
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
 * ?????????????????????????????????
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
 * ?????????????????????`root`????????????????????????
 * @param name ?????????
 * @param root ????????????
 */
export function isIdentifierPresent(name:string, root:ESTree.Node): boolean {
  let found = false;
  traverse(root, {
    enter(node: ESTree.Node) {
      if(node.type === Syntax.Identifier && node.name === name) {
        found = true;
        this.break();
      }
    }
  });
  return found;
}

/**
 * ?????????????????????????????????????????????
 */
export function isIdentifierUsed(node:ESTree.Identifier, ignoreScope?:boolean): boolean {
  const root = closest(node, [Syntax.BlockStatement, Syntax.Program]);
  if(!root) {
    throw new Error(`closest block not found for ${node}`);
  }
  const name = node.name;
  let found = false;
  // ????????????????????????????????????????????????????????????????????????????????????????????????
  let start = ignoreScope === true;
  traverse(root, {
    enter(n:ESTree.Node) {
      if(!start) {
        if(n === node) {
          start = true;
        }
        return;
      }
      if(n !== node && n.type === Syntax.Identifier && (n as ESTree.Identifier).name === name) {
        found = true;
        this.break();
      }
    }
  });
  return found;
}

/**
 * ????????????????????????????????????
 */
export function isInUpdateStatement(node:ESTree.Node):boolean {
  // ????????????????????????
  if(node.$parent?.type === Syntax.UpdateExpression) {
    return true;
  }
  // ???????????????????????????
  return (node.$parent?.type === Syntax.AssignmentExpression
    && (node.$parent as ESTree.AssignmentExpression).left === node);
}

/**
 * ?????????????????????????????????????????????????????????
 */
export function isEmptyBlock(node?:ESTree.Node):boolean {
  if(!node) {
    return true;
  }
  if(node.type !== Syntax.BlockStatement) {
    return false;
  }
  if(!node.body) {
    return true;
  }
  return !!node.body.every(_ => isEmptyBlock(_));
}

/**
 * ??????node???????????????????????????????????????testFn
 */
export function test(node:ESTree.Node, testFn: (node:ESTree.Node)=>boolean): boolean {
  let result = true;
  traverse(node, {
    enter(n:ESTree.Node) {
      if(!testFn(n)) {
        result = false;
        this.break();
      }
    }
  });
  return result;
}

export function parseAst(source:string):ESTree.Node {
  return applyParent(esprima.parse(source));
}

export function serializeAst(ast:ESTree.Node):string {
  return escodegen.generate(ast);
}
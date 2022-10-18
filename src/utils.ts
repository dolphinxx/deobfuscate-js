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
 * 从父节点移除节点
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
 * 检查名称是否在`root`中出现（被用到）
 * @param name 变量名
 * @param root 查找位置
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
 * 从最近的块开始查找，是否有使用
 */
export function isIdentifierUsed(node:ESTree.Identifier, ignoreScope?:boolean): boolean {
  const root = closest(node, [Syntax.BlockStatement, Syntax.Program]);
  if(!root) {
    throw new Error(`closest block not found for ${node}`);
  }
  const name = node.name;
  let found = false;
  // 如果忽略作用域则，立即开始查找，否则需要从节点出现之后才开始查找
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
 * 检查变量是否处于更新状态
 */
export function isInUpdateStatement(node:ESTree.Node):boolean {
  // 处于自更新节点下
  if(node.$parent?.type === Syntax.UpdateExpression) {
    return true;
  }
  // 处于赋值节点的左侧
  return (node.$parent?.type === Syntax.AssignmentExpression
    && (node.$parent as ESTree.AssignmentExpression).left === node);
}

/**
 * 是否为空块，即没有内容或内容也全是空块
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
 * 遍历node中的所有节点，判断是否符合testFn
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
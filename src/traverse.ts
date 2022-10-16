// @ts-ignore
import {traverse, replace} from '@javascript-obfuscator/estraverse';
// @ts-ignore
import * as esprima from 'esprima';
// @ts-ignore
import * as escodegen from '@javascript-obfuscator/escodegen';
import * as ESTree from 'estree';
import * as utils from './utils';
import Syntax from './syntax';
import atobSource from './atob';
import {isIdentifierUsed, serializeAst} from "./utils";

/**
 * 对于`removeApplyCall`注释中的代码片段，本方法查找`_0x5caa47`（apply方法的变量名）和它所在的声明节点，然后返回[`_0x5caa47`, 声明节点]
 */
export function getApplyCall(node:ESTree.Node):[string, ESTree.Node]|null {
  let n:ESTree.Node|null = node;
  if(
    (n = n.$parent)?.type !== Syntax.MemberExpression
    || (n = n!.$parent)?.type !== Syntax.CallExpression
    || (n = n!.$parent)?.type !== Syntax.VariableDeclarator
    || (n = n!.$parent)?.type !== Syntax.VariableDeclaration
    || (n = n!.$parent)?.type !== Syntax.BlockStatement
    || (n = n!.$parent)?.type !== Syntax.IfStatement
    || (n = n!.$parent)?.type !== Syntax.BlockStatement
    || (n = n!.$parent)?.type !== Syntax.FunctionExpression
    || (n = n!.$parent)?.type !== Syntax.ConditionalExpression
    || (n = n!.$parent)?.type !== Syntax.VariableDeclarator
    || (n = n!.$parent)?.type !== Syntax.VariableDeclaration
    || (n = n!.$parent)?.type !== Syntax.BlockStatement
    || (n = n!.$parent)?.type !== Syntax.FunctionExpression
    || (n = n!.$parent)?.type !== Syntax.ReturnStatement
    || (n = n!.$parent)?.type !== Syntax.BlockStatement
    || (n = n!.$parent)?.type !== Syntax.FunctionExpression
    || (n = n!.$parent)?.type !== Syntax.CallExpression
    || (n = n!.$parent)?.type !== Syntax.VariableDeclarator
  ) {
    return null;
  }
  const name = ((n as ESTree.VariableDeclarator).id as ESTree.Identifier).name;
  return [name, n!.$parent!];
}

/**
 * 简化通过apply来调用方法的混淆代码，移除apply部分。如下代码片段中，需要提取出实际有效的方法
 *
 * 对于以下代码片段
 * ```javascript
 * var _0x5caa47 = function (_0x188b1d) {
 *   var _0x523ef0 = !![];
 *   return function (_0x394551, _0x18654f) {
 *     var _0x5abaaa = '\u202e';
 *     var _0x2b0a0f = _0x523ef0 ? function () {
 *       if (_0x5abaaa === '\u202e' && _0x18654f) {
 *         var _0x36e3e5 = _0x18654f['apply'](_0x394551, arguments);
 *         _0x18654f = null;
 *         return _0x36e3e5;
 *       }
 *     } : function (_0x188b1d) {
 *     };
 *     _0x523ef0 = ![];
 *     var _0x188b1d = '\u202e';
 *     return _0x2b0a0f;
 *   };
 * }();
 * var _0x13eaa1 = _0x5caa47(this, function () {console.log('这是实际需要的方法')});
 * _0x13eaa1();
 * ```
 * 最后需要替换成
 * ```javascript
 * (function () {console.log('这是实际需要的方法')}())
 * ```
 */
function removeApplyCall(ast:ESTree.Node) {
  const keys:string[] = [];
  const nodes:ESTree.Node[] = [];
  // 先找到声明的变量名称和声明节点
  traverse(ast, {
    enter: function(node:ESTree.Node) {
      if(node.type == Syntax.Literal && (node as ESTree.Literal).value === 'apply') {
        const n = getApplyCall(node);
        if(n) {
          keys.push(n[0]);
          nodes.push(n[1]);
        }
      }
    }
  });

  if(keys.length === 0) {
    console.log('info: applyCall nothing found.');
    return;
  }
  const names:string[] = [];
  const fns:ESTree.FunctionExpression[] = [];
  replace(ast, {
    enter: function(node:ESTree.Node, parent:ESTree.Node|null) {
      // 移除apply方法的声明节点
      if(nodes.indexOf(node) !== -1) {
        this.remove();
        return;
      }
      // 通过apply方法变量名找到调用了apply方法的节点
      if(node.type === Syntax.CallExpression
        && (node as ESTree.CallExpression).callee.type === Syntax.Identifier
        && keys.indexOf(((node as ESTree.CallExpression).callee as ESTree.Identifier).name) !== -1
        && (node as ESTree.CallExpression).arguments.length === 2
        && (node as ESTree.CallExpression).arguments[0].type === Syntax.ThisExpression
        && (node as ESTree.CallExpression).arguments[1].type === Syntax.FunctionExpression
        && node.$parent?.type === Syntax.VariableDeclarator
        && node.$parent?.$parent?.type === Syntax.VariableDeclaration
      ) {
        let fn = (node as ESTree.CallExpression).arguments[1];
        // 相当于注释代码片段中的`_0x13eaa1`
        names.push(((node.$parent! as ESTree.VariableDeclarator).id as ESTree.Identifier).name);
        // 实际需要的方法节点
        fns.push(fn as ESTree.FunctionExpression);
        this.skip();
      }
    }
  });
  // 使用实际需要的方法节点的自调用来替换通过apply所在方法的调用
  replace(ast, {
    enter: function(node:ESTree.Node, parent:ESTree.Node|null) {
      if(node.type === Syntax.VariableDeclaration
        && (node as ESTree.VariableDeclaration).declarations.length === 1
        && (node as ESTree.VariableDeclaration).declarations[0].id.type === Syntax.Identifier
      ) {
        const name = ((node as ESTree.VariableDeclaration).declarations[0].id as ESTree.Identifier).name;
        const i = names.indexOf(name);
        if(i !== -1) {
          const fn = fns[i];
          const replacement:ESTree.ExpressionStatement = {
            $parent: parent,
            "type": "ExpressionStatement",
            "expression": {
              $parent: null,
              "type": "CallExpression",
              "callee": fn,
              "arguments": [],
              optional: false
            }
          };
          fn.$parent = replacement.expression;
          replacement.expression.$parent = replacement;
          return replacement;
        }
        this.skip();
      }
      if(node.type === Syntax.ExpressionStatement
        && (node as ESTree.ExpressionStatement).expression.type === Syntax.CallExpression
        && ((node as ESTree.ExpressionStatement).expression as ESTree.CallExpression).callee.type === Syntax.Identifier
      ) {
        const name = (((node as ESTree.ExpressionStatement).expression as ESTree.CallExpression).callee as ESTree.Identifier).name;
        if(names.indexOf(name) !== -1) {
          this.remove();
        }
      }
    }
  });
  console.log(`info: applyCall ${names.join(',')}`);
}

/**
 * 去掉空代码段，如body中的`;;;`，暂时无效！！！
 */
function removeEmptyState(ast:ESTree.Node) {
  replace(ast, {
    enter: function(node:ESTree.Node) {
      if(node.type === Syntax.EmptyStatement) {
        this.remove();
      }
    }
  })
}



/**
 * 将常量表达式直接替换成常量
 */
function evalConstantExpression(ast:ESTree.Node) {
  replace(ast, {
    leave: function(node:ESTree.Node, parent:ESTree.Node|null) {
      // 检查所有二元运算表达式节点
      if(node.type === Syntax.BinaryExpression
      ) {
        const n = node as ESTree.BinaryExpression;
        // 左运算节点与右运算节点都是常量表达式
        if(utils.isConstantValue(n.left) && utils.isConstantValue(n.right)) {
          const code = utils.serializeAst(n);
          // 使用eval算出常量结果
          const value = eval(code);
          console.log(`constant: ${code} = ${value}`);
          // 使用结果替换常量表达式
          return utils.createConstantNode(value, parent);
        }
      }
    }
  });
}

/**
 * 移除格式化检测，使用查找特定正则来定位
 */
function removeFormatCheck(ast:ESTree.Node) {
  // var _0x32a93e = function () {
  //   var _0x461908 = new RegExp('\\w+ *\\(\\) *{\\w+ *[\'|"].+[\'|"];? *}');
  //   return !_0x461908['test'](_0x5065bc['toString']());
  // };
  // var _0x4ad626 = function () {
  //   var _0x2a300c = new RegExp('\x28\x5c\x5c\x5b\x78\x7c\x75\x5d\x28\x5c\x77\x29\x7b\x32\x2c\x34\x7d\x29\x2b');
  //   return _0x2a300c['\x74\x65\x73\x74'](_0x31c6da['\x74\x6f\x53\x74\x72\x69\x6e\x67']());
  // };
  const names:string[] = [];
  const nodes:ESTree.Node[] = [];
  traverse(ast, {
    enter: function(node:ESTree.Node) {
      if(node.type === Syntax.NewExpression
        && (node as ESTree.NewExpression).callee.type == Syntax.Identifier
        && ((node as ESTree.NewExpression).callee as ESTree.Identifier).name === 'RegExp'
        && (node as ESTree.NewExpression).arguments.length === 1
        && (node as ESTree.NewExpression).arguments[0].type === Syntax.Literal
      ) {
        const regex = ((node as ESTree.NewExpression).arguments[0] as ESTree.Literal).value;
        if(regex === "\\w+ *\\(\\) *{\\w+ *['|\"].+['|\"];? *}" || regex === "(\\\\[x|u](\\w){2,4})+") {
          // VariableDeclarator<VariableDeclaration<BlockStatement<FunctionExpression<VariableDeclarator
          const declarator = node.$parent!.$parent!.$parent!.$parent!.$parent as ESTree.VariableDeclarator;
          names.push((declarator.id as ESTree.Identifier).name);
          nodes.push(declarator.$parent!);
          return;
        }
      }
    }
  });
  if(names.length === 0) {
    console.log('info: formatCheck not found');
    return;
  }
  replace(ast, {
    enter: function(node:ESTree.Node, parent:ESTree.Node|null) {
      if(nodes.indexOf(node) !== -1) {
        this.remove();
        return;
      }
      if(node.type ===  Syntax.CallExpression
        && (node  as ESTree.CallExpression).callee.type === Syntax.Identifier
      ) {
        const name = ((node  as ESTree.CallExpression).callee as ESTree.Identifier).name;
        if(names.indexOf(name) !== -1) {
          return {
            $parent: parent,
            "type": "Literal",
            "value": true,
            "raw": "true"
          }
        }
      }
    }
  });
  console.log(`info: formatCheck ${names.join(',')}`);
  // 移除格式化检查后可能剩下的垃圾代码
  // 此方法存在缺陷，假定了剩下的代码中不包含有效代码
  const cleanNodes:ESTree.Node[] = [];
  traverse(ast, {
    enter: function(node:ESTree.Node) {
      if(node.type === Syntax.ReturnStatement && (node as ESTree.ReturnStatement).argument != null && (node as ESTree.ReturnStatement).argument!.type === Syntax.Literal && ((node as ESTree.ReturnStatement).argument as ESTree.Literal).value === 'window') {
        // BlockStatement<FunctionExpression<VariableDeclarator<VariableDeclaration
        const declaration = node.$parent!.$parent!.$parent!.$parent!;
        let found = false;
        traverse(declaration, {
          enter: function(n:ESTree.Node) {
            if(n.type === Syntax.ReturnStatement && (n as ESTree.ReturnStatement).argument != null && (n as ESTree.ReturnStatement).argument!.type === Syntax.Literal && ((n as ESTree.ReturnStatement).argument as ESTree.Literal)!.value === 'dev') {
              found = true;
              this.break();
            }
          }
        });
        if(found) {
          let n = declaration;
          while(n.$parent != null && n.$parent?.type !== Syntax.Program) {
            n = n.$parent;
          }
          cleanNodes.push(n);
        }
        return;
      }
    }
  });
  replace(ast, {
    enter: function(node:ESTree.Node) {
      if(cleanNodes.indexOf(node) !== -1) {
        this.remove();
      }
    }
  });
  console.log(`info: formatCheck cleaned ${cleanNodes.length}`);
}

/**
 * 数组元素大于3个，且最多只有一个变量，其它全是字符常量
 * @param array
 */
function _isObfuscateHashArray(array:ESTree.ArrayExpression):boolean {
  if(array.elements.length < 3) {
    return false;
  }
  let identifierCount = 0;
  for(let node of array.elements) {
    // 解析代码时不会出现，但是修改语法树时可能会出现
    if(node === null) {
      return false;
    }
    if(node.type === Syntax.Identifier) {
      // 超过一个变量
      if(identifierCount++ > 1) {
        return false;
      }
      continue;
    }
    // 非常量
    if(node.type !== Syntax.Literal) {
      return false;
    }
    // 字符常量
    if(typeof (node as ESTree.Literal).value !== 'string') {
      return false;
    }
  }
  return true;
}

/**
 * 移除hash decode方法中对代码格式化的检测
 *
 * `'\\w+ *\\(\\) *{\\w+ *'`和`'[\'|"].+[\'|"];? *}'`
 */
function _removeFormatDefenceInDecodeFunction(fn:ESTree.FunctionDeclaration) {
  let done = false;
  let found = 0;
  traverse(fn, {
    enter(node:ESTree.Node) {
      if(node.type === Syntax.AssignmentExpression
        && (node as ESTree.AssignmentExpression).right.type === Syntax.Literal
        && (['\\w+ *\\(\\) *{\\w+ *', '[\'|"].+[\'|"];? *}'] as any[]).indexOf(((node as ESTree.AssignmentExpression).right as ESTree.Literal).value) !== -1
      ) {
        if(found === 2) {
          this.break();
          return;
        }
        // 两个都找到
        if(found++ === 1) {
          const ifStatement = utils.closest(node, Syntax.IfStatement);
          if(ifStatement == null) {
            console.log('warn: format defence if statement in decode function not found');
            return;
          }
          utils.removeNodeFromTree(ifStatement, fn);
          done = true;
        }
      }
    }
  });
  if(!done) {
    console.log('warn: format defence in decode function not found');
  }
}

/**
 * 解码字符串
 */
function decodeHashArray(ast:ESTree.Node) {
  let hashNode:ESTree.VariableDeclarator|null = null;
  let hashName:string|null = null;
  traverse(ast, {
    enter(node:ESTree.Node) {
      // 先找到字典数组
      if(node.type == Syntax.VariableDeclarator
        && node.$parent?.type === Syntax.VariableDeclaration
        // 顶级的声明
        && node.$parent?.$parent?.type === Syntax.Program
        // 数组表达式
        && (node as ESTree.VariableDeclarator).init?.type === Syntax.ArrayExpression
        // 数组元素大于3个，且最多有一个变量，其它都是字符串常量
        && _isObfuscateHashArray(((node as ESTree.VariableDeclarator).init! as ESTree.ArrayExpression))
      ) {
        hashNode = node as ESTree.VariableDeclarator;
        hashName = ((node as ESTree.VariableDeclarator).id as ESTree.Identifier).name;
        this.break();
        return;
      }
    }
  });
  if(hashNode == null) {
    console.log('warn: hash array not found.');
    console.log(((ast as ESTree.Program).body[0] as ESTree.VariableDeclaration).declarations[2]);
    return;
  }
  let decodeFunction:ESTree.FunctionDeclaration|null = null;
  let decodeFunctionName:string|null = null;
  traverse(ast, {
    enter(node:ESTree.Node) {
      if(node.type === Syntax.MemberExpression
        && (node as ESTree.MemberExpression).computed === true
        && (node as ESTree.MemberExpression).object.type === Syntax.Identifier
        && ((node as ESTree.MemberExpression).object as ESTree.Identifier).name === hashName
      ) {
        const functionDeclaration = utils.closest<ESTree.FunctionDeclaration>(node, Syntax.FunctionDeclaration);
        if(functionDeclaration != null) {
          if(functionDeclaration.params.length !== 2 || functionDeclaration.params[0].type !== Syntax.Identifier) {
            this.break();
            console.log('warn: hash decode function params not match');
            return;
          }

          const firstArgName = (functionDeclaration.params[0] as ESTree.Identifier).name;
          if((node as ESTree.MemberExpression).property.type !== Syntax.Identifier || ((node as ESTree.MemberExpression).property as ESTree.Identifier).name !== firstArgName) {
            this.break();
            console.log('warn: hash decode function param name not match');
            return;
          }
          decodeFunction = functionDeclaration;
          decodeFunctionName = functionDeclaration.id!.name;
          this.break();
        }
      }
    }
  });
  if(decodeFunction == null) {
    console.log('warn: hash decode function not found');
    return;
  }

  // 移除decodeFunction中对格式化的检测
  _removeFormatDefenceInDecodeFunction(decodeFunction);

  // null check后hashNode类型变为never
  // https://github.com/microsoft/TypeScript/issues/9998
  // https://github.com/microsoft/TypeScript/issues/44025
  const _hashNode = hashNode as ESTree.VariableDeclarator;

  // 用于eval的基础代码
  const evalBaseCode = utils.serializeAst({
    $parent: null,
    "type": Syntax.Program as any,
    "body": [
      _hashNode!.$parent as ESTree.VariableDeclaration,
      decodeFunction,
    ]
  });
  // 通过闭包只暴露decode方法，避免变量污染外部环境
  const evalFn = eval(`(function(){
  ${atobSource}
  ${evalBaseCode};
  return ${decodeFunctionName};
}())`);

  // 移除hash array节点
  utils.removeNodeFromTree(_hashNode, ast);
  // (_hashNode!.$parent as ESTree.VariableDeclaration).declarations.splice((_hashNode!.$parent as ESTree.VariableDeclaration).declarations.indexOf(_hashNode), 1);
  utils.removeNodeFromTree(decodeFunction, ast);
  let count = 0;
  // 开始decode和替换
  replace(ast, {
    leave(node:ESTree.Node, parent: ESTree.Node|null) {
      if(node.type === Syntax.CallExpression
        && (node as ESTree.CallExpression).callee.type === Syntax.Identifier
        && ((node as ESTree.CallExpression).callee as ESTree.Identifier).name === decodeFunctionName
      ) {
        if((node as ESTree.CallExpression).arguments.length !== 2
          || (node as ESTree.CallExpression).arguments[0].type !== Syntax.Literal
          || (node as ESTree.CallExpression).arguments[1].type !== Syntax.Literal
        ) {
          console.log(`warn: decode hash call wrong argument ${utils.serializeAst(node)}`);
          return;
        }
        const value = evalFn(((node as ESTree.CallExpression).arguments[0] as ESTree.Literal).value, ((node as ESTree.CallExpression).arguments[1] as ESTree.Literal).value);
        count++;
        return utils.createConstantNode(value, parent);
      }
    }
  });
  console.log(`info: decode hash count ${count}`);
}

/**
 * 混淆中有对hash字符串数组进行重排序的代码，将其直接替换成重排序后的结果
 */
function evalHashArrayReordering(ast: ESTree.Node) {
  // 先找到hash array
  let hashNode:ESTree.VariableDeclarator|null = null;
  let hashName:string|null = null;
  let reorderDone = false;
  traverse(ast, {
    enter(node:ESTree.Node) {
      // 先找到字典数组
      if(node.type == Syntax.VariableDeclarator
        && node.$parent?.type === Syntax.VariableDeclaration
        // 顶级的声明
        && node.$parent?.$parent?.type === Syntax.Program
        // 数组表达式
        && (node as ESTree.VariableDeclarator).init?.type === Syntax.ArrayExpression
        // 数组元素大于3个，且最多有一个变量，其它都是字符串常量
        && _isObfuscateHashArray(((node as ESTree.VariableDeclarator).init! as ESTree.ArrayExpression))
      ) {
        hashNode = node as ESTree.VariableDeclarator;
        hashName = ((node as ESTree.VariableDeclarator).id as ESTree.Identifier).name;
        this.skip();
        return;
      }
      if(!hashNode) {
        return;
      }
      // 找到以下代码，主要通过hash array的名称(_0x15ba)查找
      // `if (function(_0x427172, _0x15aaab, _0x1d6684){...}(_0x15ba, 0x169, 0x16900), _0x15ba) {
      //   _0xodz_ = _0x15ba['length'] ^ 0x169;
      // }`
      if(node.type === Syntax.SequenceExpression
        && (node as ESTree.SequenceExpression).expressions.length === 2
        && (node as ESTree.SequenceExpression).expressions[0].type === Syntax.CallExpression
        && (node as ESTree.SequenceExpression).expressions[1].type === Syntax.Identifier
        && ((node as ESTree.SequenceExpression).expressions[1] as ESTree.Identifier).name === hashName
        && ((node as ESTree.SequenceExpression).expressions[0] as ESTree.CallExpression).arguments.length === 3
        && ((node as ESTree.SequenceExpression).expressions[0] as ESTree.CallExpression).arguments[0].type == Syntax.Identifier
        && (((node as ESTree.SequenceExpression).expressions[0] as ESTree.CallExpression).arguments[0] as ESTree.Identifier).name === hashName
        && ((node as ESTree.SequenceExpression).expressions[0] as ESTree.CallExpression).arguments[1].type == Syntax.Literal
        && ((node as ESTree.SequenceExpression).expressions[0] as ESTree.CallExpression).arguments[2].type == Syntax.Literal
      ) {
        const ifState = utils.closest(node, Syntax.IfStatement);
        const hashDeclaration:ESTree.VariableDeclaration = utils.closest(hashNode!, Syntax.VariableDeclaration)!;
        // 需要的变量名列表
        const variables = hashDeclaration.declarations.map(_ => (_.id as ESTree.Identifier).name);
        const result = eval(`
${utils.serializeAst(hashDeclaration)}
${utils.serializeAst(ifState!)}
[${variables.join(', ')}]
`);
        let newDeclaration = utils.parseAst('var ' + variables.map((_, i) => `${_} = ${JSON.stringify(result[i])}`).join(',') + ';');
        if(newDeclaration.type === Syntax.Program) {
          newDeclaration = (newDeclaration as ESTree.Program).body[0];
        }
        let done = 0;
        replace(ast, {
          enter(n:ESTree.Node, parent: ESTree.Node|null) {
            if(done === 2) {
              this.break();
              return;
            }
            // 替换declaration块
            if(n === hashDeclaration) {
              done++;
              newDeclaration.$parent = parent;
              return newDeclaration;
            }
            // 移除if块
            if(n === ifState) {
              done++;
              this.remove();
            }
          }
        });
        reorderDone = true;
        this.break();
      }
    }
  });
  if(reorderDone) {
    console.log('info: hash array reordered');
  } else {
    console.log('warn: hash array reordering not found');
  }
}

/**
 * 混淆代码会将运算或字符串封装成方法调用，再把方法隐藏在hash对象中，需要将其扁平化，去掉hash
 */
function flattenHashedCall(ast: ESTree.Node) {
  let objects:ESTree.VariableDeclaration[] = [];
  // 先找到hash的定义
  traverse(ast, {
    enter(node: ESTree.Node) {
      if(node.type === Syntax.VariableDeclarator
        // 单独声明
        && node.$parent?.type === Syntax.VariableDeclaration
        && (node.$parent! as ESTree.VariableDeclaration).declarations.length === 1
        && (node as ESTree.VariableDeclarator).id.type === Syntax.Identifier
        // 对象表达式
        && (node as ESTree.VariableDeclarator).init?.type === Syntax.ObjectExpression
        // 属性数量大于0
        && ((node as ESTree.VariableDeclarator).init as ESTree.ObjectExpression).properties.length > 0
        // 每个属性名都是字符串类型的常量
        && ((node as ESTree.VariableDeclarator).init as ESTree.ObjectExpression).properties.every(_ =>
          _.type === Syntax.Property
          && (_ as ESTree.Property).key.type === Syntax.Literal
          && typeof ((_ as ESTree.Property).key as ESTree.Literal).value === 'string'
        )
      ) {
        objects.push(node.$parent as ESTree.VariableDeclaration);
        // 可能存在嵌套的情况，所以不能跳过
        // this.skip();
      }
    }
  });
  if(objects.length === 0) {
    console.log('warn: hash objects not found');
    return;
  }
  // 需要符合：1.非顶级声明；2.不能有赋值操作
  objects = objects.filter(obj => {
    if(obj.$parent?.type !== Syntax.BlockStatement) {
      return false;
    }
    const name = (obj.declarations[0].id as ESTree.Identifier).name;
    let qualified = true;

    traverse(obj.$parent, {
      enter(node: ESTree.Node) {
        if(node.type === Syntax.MemberExpression &&
          (node as ESTree.MemberExpression).object.type === Syntax.Identifier
          && ((node as ESTree.MemberExpression).object as ESTree.Identifier).name === name
        ) {
          // 属性名必须是常量字符串
          if((node as ESTree.MemberExpression).property.type !== Syntax.Literal || typeof ((node as ESTree.MemberExpression).property as ESTree.Literal).value !== 'string') {
            qualified = false;
            this.break();
            return;
          }
          if(Syntax.UpdateExpression === node.$parent?.type || (Syntax.AssignmentExpression === node.$parent?.type && (node.$parent as ESTree.AssignmentExpression).left === node)) {
            qualified = false;
            this.break();
          }
        }
      }
    });
    return qualified;
  });
  objects.forEach((obj) => {
    const name = (obj.declarations[0].id as ESTree.Identifier).name as string;
    const properties:{[x:string]:ESTree.Node} = {};
    (obj.declarations[0].init as ESTree.ObjectExpression).properties.forEach(_ => {
      const prop = _ as ESTree.Property;
      properties[(prop.key as ESTree.Literal).value as string] = prop.value;
    });
    let count = 0;
    replace(obj.$parent, {
      leave(node:ESTree.Node, parent: ESTree.Node|null) {
        if(node.type === Syntax.MemberExpression
          && (node as ESTree.MemberExpression).object.type === Syntax.Identifier
          && ((node as ESTree.MemberExpression).object as ESTree.Identifier).name === name
        ) {
          const key = ((node as ESTree.MemberExpression).property as ESTree.Literal).value as string;
          if(!properties[key]) {
            console.log(`warn: hashed key not found ${key}`);
            return;
          }
          const value = properties[key];
          if(!node.$parent) {
            console.log('>>> no parent', node, serializeAst(node));
          }
          // 调用方法，用方法体直接替换
          if(node.$parent!.type === Syntax.CallExpression && (node.$parent as ESTree.CallExpression).callee === node) {
            // 应该是只有一行return块作为方法体，且入参数量应该与调用方一致
            if(value.type !== Syntax.FunctionExpression
              || (value as ESTree.FunctionExpression).body.body.length !== 1
              || (value as ESTree.FunctionExpression).body.body[0].type !== Syntax.ReturnStatement
              || (value as ESTree.FunctionExpression).params.length !== (node.$parent as ESTree.CallExpression).arguments.length
            ) {
              console.log(`warn: hashed function not match ${key}`);
              return;
            }
            // 用于替换的节点
            const statement = utils.cloneNode(((value as ESTree.FunctionExpression).body.body[0] as ESTree.ReturnStatement).argument!);
            statement.$parent = parent;
            // 入参变量名列表
            const params = (value as ESTree.FunctionExpression).params.map(_ => (_ as ESTree.Identifier).name);
            // 调用方变量列表
            const args = (node.$parent as ESTree.CallExpression).arguments;
            replace(statement, {
              enter(n:ESTree.Node, parent:ESTree.Node|null) {
                if(n.type === Syntax.Identifier) {
                  const name = (n as ESTree.Identifier).name;
                  const index = params.indexOf(name);
                  if(index !== -1) {
                    const replacement = args[index];
                    replacement.$parent = parent;
                    return replacement;
                  }
                }
              }
            });
            // console.log(serializeAst(statement), statement.$parent !== null);
            count++;
            utils.replaceNode(node.$parent!, statement, node.$parent!.$parent!);
            return;
          }

          // if(value.type === Syntax.Literal || value.type === Syntax.Identifier) {
          //   // 常量值和变量直接克隆替换
          //   const newNode = utils.cloneNode(value);
          //   newNode.$parent = parent;
          //   count++;
          //   // console.log(newNode);
          //   return newNode;
          // }

          // // 作为其它对象的属性、成员访问、new、表达式、二元运算
          // if(([Syntax.Property, Syntax.MemberExpression, Syntax.NewExpression, Syntax.ExpressionStatement, Syntax.BinaryExpression, Syntax.UnaryExpression] as any[]).indexOf(node.$parent!.type) !== -1) {

          // 其它情况直接替换
            const newNode = utils.cloneNode(value);
            newNode.$parent = parent;
            count++;
            // console.log(newNode);
            return newNode;
          // }
          // if(([Syntax.Property, Syntax.MemberExpression, Syntax.NewExpression, Syntax.ExpressionStatement, Syntax.BinaryExpression, Syntax.UnaryExpression] as any[]).indexOf(node.$parent!.type) !== -1
          //   || (node.$parent!.type === Syntax.CallExpression && (node.$parent as ESTree.CallExpression).callee !== node)) {
          //
          // }

          // console.log(`warn: hashed call unknown parent type ${name} ${key} ${node.$parent?.type}`);
        }
      }
    });
    // utils.removeNodeFromTree(obj);
    console.log(`info: flattened hashed call ${name} ${count}`);
  });
  objects.forEach(obj => {
    if(!utils.isIdentifierUsed(obj.declarations[0].id as ESTree.Identifier)) {
      utils.removeNodeFromTree(obj);
    }
  });
}

/**
 * 可能将代码逻辑混淆成用一个字符串控制switch的流程
 *
 * ```javascript
 * function xx() {
 *     if ('iyLgo' === 'YqLTo') {
 *         var _0x1668f0 = '1|0|3|4|2'['split']('|'),
 *         _0x3f9437 = 0;
 *         while (true) {
 *             switch (_0x1668f0[_0x3f9437++]) {
 *             case '0':
 *                 $('#loading')['show']();
 *                 continue;
 *             case '1':
 *                 if (_0x476565 != null) {
 *                     _0x476565['video']()['pause']();
 *                 }
 *                 continue;
 *             case '2':
 *                 return;
 *             case '3':
 *                 $('#error')['hide']();
 *                 continue;
 *             case '4':
 *                 $('.app')['hide']();
 *                 continue;
 *             }
 *             break;
 *         }
 *     }
 * }
 * ```
 */
export function flattenSplitWhileSwitch(ast: ESTree.Node) {
  const toRemove:ESTree.Node[] = [];
  replace(ast, {
    enter(node:ESTree.Node) {
      // 找到while(true)
      if(node.type === Syntax.WhileStatement
        && (node as ESTree.WhileStatement).test.type === Syntax.Literal
        && ((node as ESTree.WhileStatement).test as ESTree.Literal).value === true
        && node.$parent?.type === Syntax.BlockStatement
      ) {
        // 应该存在一个switch块
        const switchStatement = utils.nearest<ESTree.SwitchStatement>(node, Syntax.SwitchStatement);
        if(!switchStatement) {
          return;
        }
        if(switchStatement.discriminant.type !== Syntax.MemberExpression
          || (switchStatement.discriminant as ESTree.MemberExpression).property.type !== Syntax.UpdateExpression
          || ((switchStatement.discriminant as ESTree.MemberExpression).property as ESTree.UpdateExpression).operator !== '++'
        ) {
          return;
        }
        // case判断必须全是数字字符串
        if(!switchStatement.cases.every(_ => _.test?.type === Syntax.Literal
          && typeof (_.test as ESTree.Literal).value === 'string'
          && /^\d+$/.test((_.test as ESTree.Literal).value as string))) {
          return;
        }
        const prev = (node.$parent as ESTree.BlockStatement).body[(node.$parent as ESTree.BlockStatement).body.indexOf(node) - 1];
        if(!prev || prev.type !== Syntax.VariableDeclaration || prev.declarations.length != 2) {
          return;
        }
        // 找到字符串节点
        const strNode = (prev as ESTree.VariableDeclaration).declarations.find(_ =>
          _.init?.type === Syntax.CallExpression
          && (_.init as ESTree.CallExpression).callee.type === Syntax.MemberExpression
          && ((_.init as ESTree.CallExpression).callee as ESTree.MemberExpression).object.type === Syntax.Literal
          && /(\d+\|)+\d+/.test((((_.init as ESTree.CallExpression).callee as ESTree.MemberExpression).object as ESTree.Literal).value as string)
          && ((_.init as ESTree.CallExpression).callee as ESTree.MemberExpression).property.type === Syntax.Literal
          && (((_.init as ESTree.CallExpression).callee as ESTree.MemberExpression).property as ESTree.Literal).value === 'split'
        );
        if(!strNode) {
          return;
        }
        const str = (((strNode.init as ESTree.CallExpression).callee as ESTree.MemberExpression).object as ESTree.Literal).value as string;
        const orders = str.split('|');
        const statements:ESTree.Statement[] = switchStatement.cases.map<[string, ESTree.Statement[]]>(_ => [(_.test as ESTree.Literal).value as string, _.consequent.filter(_ => _.type !== Syntax.ContinueStatement)])
          .sort((a,b) => orders.indexOf(a[0]) - orders.indexOf(b[0]))
          .map(_ => _[1])
          .flat();
        const block:ESTree.BlockStatement = {
          $parent: null,
          type: Syntax.BlockStatement,
          body: statements
        }
        statements.forEach(_ => _.$parent = block);
        toRemove.push(prev);
        return block;
      }
    }
  });
  toRemove.forEach(_ => {
    utils.removeNodeFromTree(_);
  });
}

function _evalComparation(operator: string, left: any, right: any): boolean {
  switch (operator) {
    case '==':
      return left == right;
    case '===':
      return left === right;
    case '!=':
      return left != right;
    case '!==':
      return left !== right;
    default:
      throw new Error('never occur');
  }
}

/**
 * 将常量值的比较替换为true/false
 */
export function replaceLiteralComparation(ast: ESTree.Node) {
  replace(ast, {
    enter(node: ESTree.Node, parent: ESTree.Node|null) {
      if (node.type === Syntax.BinaryExpression
        && ['==', '===', '!=', '!=='].indexOf((node as ESTree.BinaryExpression).operator) !== -1
        && (
          ((node as ESTree.BinaryExpression).left.type === Syntax.Literal
            && (node as ESTree.BinaryExpression).right.type === Syntax.Literal)
          // || ((node as ESTree.BinaryExpression).left.type === Syntax.Identifier
          //   && (node as ESTree.BinaryExpression).right.type === Syntax.Identifier)
        )
      ) {
        const left = ((node as ESTree.BinaryExpression).left as ESTree.Literal).value;
        const right = ((node as ESTree.BinaryExpression).right as ESTree.Literal).value;
        const value = _evalComparation((node as ESTree.BinaryExpression).operator, left, right);
        return {
          $parent: parent,
          type: Syntax.Literal,
          value,
          raw: String(value)
        };
      }
    }
  })
}

/**
 * 移除无法到达的if/else块
 */
export function removeIfElseUnreachableStatements(ast:ESTree.Node) {
  replace(ast, {
    enter(node:ESTree.Node, parent: ESTree.Node|null) {
      if(node.type === Syntax.IfStatement
        && (node as ESTree.IfStatement).test.type === Syntax.Literal
        && typeof ((node as ESTree.IfStatement).test as ESTree.Literal).value === 'boolean'
      ) {
        const test = ((node as ESTree.IfStatement).test as ESTree.Literal).value as boolean;
        if(test) {
          const consequent = (node as ESTree.IfStatement).consequent;
          consequent.$parent = parent;
          return consequent;
        }
        // 有else
        if((node as ESTree.IfStatement).alternate != null) {
          const alternate = (node as ESTree.IfStatement).alternate!;
          alternate.$parent = parent;
          return alternate;
        }
        this.remove();
      }
    }
  });
}

/**
 * 将无意义的多层块扁平化成一层
 */
export function flattenWrappedBlock(ast:ESTree.Node) {
  replace(ast, {
    enter(node:ESTree.Node, parent:ESTree.Node|null) {
      if(node.type === Syntax.BlockStatement
        && (node as ESTree.BlockStatement).body.length === 1
        && (node as ESTree.BlockStatement).body[0].type === Syntax.BlockStatement
      ) {
        const statements = ((node as ESTree.BlockStatement).body[0] as ESTree.BlockStatement).body;
        (node as ESTree.BlockStatement).body.splice(0, 1, ...statements);
        statements.forEach(_ => _.$parent = parent);
      }
    }
  });
}

export {parseAst, serializeAst} from './utils';

export {
  removeApplyCall,
  removeEmptyState,
  evalConstantExpression,
  removeFormatCheck,
  decodeHashArray,
  evalHashArrayReordering,
  flattenHashedCall,
}
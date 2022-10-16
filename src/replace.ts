/**
 * 将十六进制书写格式的数字替换成十进制
 * @deprecated 通过estraverse解析后的代码十六进制数字会自动转成十进制
 */
function convertNumber(source:string):string {
  return source.replace(/([^_])0x([\da-f]+)/g, (str, prefix, num) => {
    return `${prefix}${parseInt(num, 16)}`;
  });
}

/**
 * 移除atob polyfill，使用自己提供的版本
 */
function removeAtob(source:string):string {
  let found = false;
  source = source.replace(/\(function\s*\(\)\s*{\s*var \w+\s*=\s*typeof window[^;]+;\s*var \w+\s*=\s*['"][A-Za-z\d+\/=]+['"];\s*\w+\[['"]atob['"]][\S\s]+?}\(\)\);/, () => {
    found = true;
    return '';
  });
  if(!found) {
    console.log(`warn: atob not found`);
  }
  return source;
}

/**
 * 使用`\uxx`的格式书写通用标点符号（包含标点符号、间距和格式字符的 Unicode 块）
 *
 * 如`RLE`符号会让代码段以从右向左的顺序显示，影响阅读
 */
function useHexForGeneralPunctuation(source:string):string {
  return source.replace(/[\u2020-\u206f]/g, (s) => `\\u${s.charCodeAt(0).toString(16)}`);
}

/**
 * 移除通过`setCookie`进行的防格式化检测
 *
 * TODO: 换成estraverse实现?
 */
function removeSetCookieDefence(source:string):string {
  let found = false;
  source = source.replace(/function \w+\(\)\s*{\s*var \w+\s*=\s*{\s*'data'\s*:\s*{'key'\s*:\s*'cookie',\s*'value'\s*:\s*'timeout'},\s*'setCookie':\s*[\S\s]+?'getCookie':\s*(function\s*\([\S\s]+?})\s*};\s*function \w+\s*\(\)[\S\s]+?'getCookie']\(([^)]*)\);\s*}\s*else\s*{[^;]+;\s*}\s*};\w+\(\);?/, (str, body, args) => {
    found = true;
    return `(${body}(${args}))`;
  });
  if(!found) {
    console.log(`warn: setCookie defence not found`);
  }
  return source;
}

/**
 * 将列表重新排列
 * @param {String} source
 */
function orderShuffle(source:string):string {
  const matcher = /{\s*(\w+)\s*=\s*(\w+)\['length']\s*\^\s*\d+;\s*}/.exec(source);
  if(!matcher) {
    console.log('warn: orderShuffle not found');
    return source;
  }
  const numVar = matcher[1];
  const arrayVar = matcher[2];
  const index = matcher.index + matcher[0].length;
  const s = source.substring(0, index) + `;[${numVar}, ${arrayVar}]`;
  const [num, array] = eval(s);
  return `${source.substring(0, source.indexOf(','))};\nvar ${numVar} = ${num};\nvar ${arrayVar} = ${JSON.stringify(array)};\n${source.substring(index)}`;
}

/**
 * 简单地将`!![]`替换成`true`，将`![]`替换成`false`
 * TODO: 换成estraverse实现?
 */
function replaceRawBoolean(source:string):string {
  return source.replace(/!!\[]/g, 'true').replace(/!\[]/g, 'false');
}

export {
  useHexForGeneralPunctuation,
  removeAtob,
  removeSetCookieDefence,
  orderShuffle,
  replaceRawBoolean,
}
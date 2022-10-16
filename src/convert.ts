import * as fs from 'fs';
import {removeAtob, removeSetCookieDefence, useHexForGeneralPunctuation, replaceRawBoolean} from "./replace";
import {
  parseAst,
  serializeAst,
  removeApplyCall,
  removeEmptyState,
  evalConstantExpression,
  removeFormatCheck,
  decodeHashArray,
  evalHashArrayReordering,
  flattenHashedCall,
  flattenSplitWhileSwitch,
  replaceLiteralComparation,
  removeIfElseUnreachableStatements,
  flattenWrappedBlock
} from "./traverse";

(function() {
  const filename = process.argv[2];
  if(!filename) {
    console.error('filename must be specified.');
    return;
  }
  if(!fs.existsSync(filename)) {
    console.error(filename + ' not exists.');
    return;
  }

  let dest = process.argv.length > 3 ? process.argv[3] : filename.replace(/\.js$/, '_de.js');

  const source = fs.readFileSync(filename, {encoding: 'utf-8'});

  let result = source;
  result = useHexForGeneralPunctuation(result);
  // result = convertNumber(result);
  result = replaceRawBoolean(result);
  result = removeAtob(result);
  result = removeSetCookieDefence(result);
  // result = orderShuffle(result);
  //
  let ast = parseAst(result);
  removeApplyCall(ast);
  removeEmptyState(ast);
  evalConstantExpression(ast);
  removeFormatCheck(ast);
  evalHashArrayReordering(ast);
  decodeHashArray(ast);
  flattenHashedCall(ast);
  flattenHashedCall(ast);
  flattenHashedCall(ast);
  flattenHashedCall(ast);
  replaceLiteralComparation(ast);
  removeIfElseUnreachableStatements(ast);
  flattenSplitWhileSwitch(ast);
  flattenWrappedBlock(ast);
  flattenWrappedBlock(ast);
  result = serializeAst(ast);

  // result = atobSource + result;
  fs.writeFileSync(dest, result, {encoding: 'utf-8'});
}());
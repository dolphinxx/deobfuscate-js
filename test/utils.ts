import {readFileSync} from 'fs';
import {join} from 'path';
import {parseAst} from "../src/utils";
import {Node} from 'estree';

export function loadCodeTree(name: string): Node {
  return parseAst(loadText(name));
}

export function loadText(name: string): string {
  return readFileSync(join(__dirname, name), {encoding: 'utf-8'});
}
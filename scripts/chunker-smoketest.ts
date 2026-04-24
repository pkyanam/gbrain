import { chunkCodeText } from '../src/core/chunkers/code.ts';
const src = `
export function hello(name: string): string {
  return \`hello \${name}\`;
}

export class Foo {
  async bar() { return 42; }
}

export type Id = string;
`;
const result = await chunkCodeText(src, 'smoketest.ts');
console.log(JSON.stringify({
  count: result.length,
  first: result[0]?.metadata,
  has_real_symbols: result.every(c => c.metadata.symbolName !== null || c.metadata.symbolType === 'module'),
  first_header: result[0]?.text.split('\n')[0],
}, null, 2));

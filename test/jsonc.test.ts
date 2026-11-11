import { describe, expect, it } from 'vitest';
import { parseJsonc } from '../src/jsonc.js';

describe('parseJsonc', () => {
  it('ignores line and block comments', () => {
    expect(parseJsonc('{\n  // line\n  "a": /* inline */ 1\n}')).toEqual({ a: 1 });
  });

  it('removes trailing commas in objects and arrays', () => {
    expect(parseJsonc('{ "a": [1, 2, ], "b": { "c": 3, }, }')).toEqual({ a: [1, 2], b: { c: 3 } });
  });

  it('leaves comment and comma lookalikes inside strings untouched', () => {
    expect(parseJsonc('{ "url": "http://x/*y*/", "s": "a,}" }')).toEqual({ url: 'http://x/*y*/', s: 'a,}' });
  });

  it('handles escaped quotes inside strings', () => {
    expect(parseJsonc(String.raw`{ "a": "say \"hi\" // still a string" }`)).toEqual({ a: 'say "hi" // still a string' });
  });

  it('accepts a byte order mark', () => {
    expect(parseJsonc('\uFEFF{"a": 1}')).toEqual({ a: 1 });
  });

  it('throws on an unterminated block comment', () => {
    expect(() => parseJsonc('{ /* "a": 1 }')).toThrow(SyntaxError);
  });
});

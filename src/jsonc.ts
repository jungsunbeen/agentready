/**
 * Parses JSON with comments and trailing commas, the dialect used by
 * tsconfig.json and many editor configs. String contents are never altered.
 *
 * @throws {SyntaxError} if the input is not valid after normalisation.
 */
export function parseJsonc(text: string): unknown {
  return JSON.parse(stripTrailingCommas(stripComments(withoutBom(text))));
}

function withoutBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Copies a string literal starting at `start` (the opening quote) into `out`. Returns the index after it. */
function copyString(input: string, start: number, out: string[]): number {
  let i = start + 1;
  out.push('"');
  while (i < input.length) {
    const ch = input.charAt(i);
    if (ch === '\\') {
      out.push(ch, input.charAt(i + 1));
      i += 2;
      continue;
    }
    out.push(ch);
    i += 1;
    if (ch === '"') return i;
  }
  return i;
}

export function stripComments(input: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    const next = input.charAt(i + 1);
    if (ch === '"') {
      i = copyString(input, i, out);
    } else if (ch === '/' && next === '/') {
      const end = input.indexOf('\n', i);
      i = end === -1 ? input.length : end;
    } else if (ch === '/' && next === '*') {
      const end = input.indexOf('*/', i + 2);
      if (end === -1) throw new SyntaxError('Unterminated block comment');
      out.push(' ');
      i = end + 2;
    } else {
      out.push(ch);
      i += 1;
    }
  }
  return out.join('');
}

export function stripTrailingCommas(input: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (ch === '"') {
      i = copyString(input, i, out);
      continue;
    }
    if (ch === ',') {
      const rest = input.slice(i + 1).trimStart();
      if (rest.startsWith('}') || rest.startsWith(']')) {
        i += 1;
        continue;
      }
    }
    out.push(ch);
    i += 1;
  }
  return out.join('');
}

import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { formatRulesMarkdown } from '../src/report.js';
import { rules } from '../src/rules/index.js';

it('docs/rules.md is up to date (run `npm run build && npm run docs`)', async () => {
  const committed = await readFile(new URL('../docs/rules.md', import.meta.url), 'utf8');
  expect(committed).toBe(formatRulesMarkdown(rules));
});

import type { Rule } from '../types.js';
import { fail, pass } from './result.js';

const README_NAME = /^readme(\.md|\.markdown|\.mdx)?$/i;
const HEADING = /^#{1,6}\s+(.+)$/gm;
const USAGE_KEYWORDS = ['usage', 'getting started', 'quick start', 'quickstart', 'install', '사용', '시작', '설치', '실행'];

/** Returns true when any Markdown heading looks like a usage or installation section. */
export function hasUsageSection(markdown: string): boolean {
  for (const match of markdown.matchAll(HEADING)) {
    const heading = (match[1] ?? '').toLowerCase();
    if (USAGE_KEYWORDS.some((keyword) => heading.includes(keyword))) return true;
  }
  return false;
}

export const readme: Rule = {
  id: 'readme',
  title: 'README exists and has a usage section',
  severity: 'error',
  rationale:
    'The README is where an agent learns what the project is for and how it is meant to be used. ' +
    'Without a usage example it infers the API from source code, which is slower and often wrong.',
  async check(ctx) {
    const name = (await ctx.list('.')).find((entry) => README_NAME.test(entry));
    if (name === undefined) {
      return fail('No README found.', 'Add README.md that states the problem the project solves and shows one usage example.');
    }
    const text = (await ctx.readText(name)) ?? '';
    if (!hasUsageSection(text)) {
      return fail(
        `${name} has no usage or installation section.`,
        'Add a "Usage" heading with a copy-pasteable example.',
      );
    }
    return pass(`${name} has a usage section.`);
  },
};

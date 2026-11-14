import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RepoContext } from '../src/context.js';
import type { Rule, RuleResult } from '../src/types.js';

export type Files = Readonly<Record<string, string>>;

const created: string[] = [];

/** Creates a throwaway repository with the given files. Removed after each test by test/setup.ts. */
export async function makeRepo(files: Files = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-lint-'));
  created.push(root);
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relPath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }
  return root;
}

export async function removeRepos(): Promise<void> {
  await Promise.all(created.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

export async function runRule(rule: Rule, files: Files): Promise<RuleResult> {
  return rule.check(new RepoContext(await makeRepo(files)));
}

export const json = (value: unknown): string => JSON.stringify(value, null, 2);

/** A repository that passes every built-in rule. */
export const GOOD_REPO: Files = {
  'package.json': json({
    name: 'demo',
    description: 'A demo package.',
    engines: { node: '>=22' },
    scripts: { build: 'tsc', lint: 'eslint .', test: 'vitest run' },
  }),
  'package-lock.json': '{}',
  'tsconfig.json': '{\n  // strict on\n  "compilerOptions": { "strict": true, },\n}\n',
  'README.md': '# demo\n\n## Usage\n\n```sh\nnpx demo\n```\n',
  'AGENTS.md': '# demo\n\nRun `npm run lint` and `npm test` before finishing.\n',
  '.github/workflows/ci.yml': 'on: push\n',
};

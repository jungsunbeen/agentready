import path from 'node:path';
import type { RepoContext } from '../context.js';
import type { Rule } from '../types.js';
import { isRecord } from '../util.js';
import { fail, pass, skip } from './result.js';

const MAX_EXTENDS_DEPTH = 8;

/** Maps an `extends` entry to a path relative to the repository root. */
export function resolveExtends(fromConfig: string, spec: string): string {
  if (spec.startsWith('.')) {
    const joined = path.posix.join(path.posix.dirname(fromConfig), spec);
    return joined.endsWith('.json') ? joined : `${joined}.json`;
  }
  return spec.endsWith('.json') ? `node_modules/${spec}` : `node_modules/${spec}/tsconfig.json`;
}

/**
 * Follows the `extends` chain and returns the effective `strict` value,
 * or `undefined` if no config in the chain sets it.
 */
export async function resolveStrict(ctx: RepoContext, configPath: string, depth = 0): Promise<boolean | undefined> {
  if (depth > MAX_EXTENDS_DEPTH) return undefined;
  const file = await ctx.readJson(configPath, { comments: true });
  if (file.kind !== 'ok' || !isRecord(file.value)) return undefined;

  const { compilerOptions, extends: parent } = file.value;
  if (isRecord(compilerOptions) && typeof compilerOptions.strict === 'boolean') return compilerOptions.strict;

  const parents = typeof parent === 'string' ? [parent] : Array.isArray(parent) ? parent : [];
  // Later entries in an `extends` array override earlier ones.
  for (const spec of parents.toReversed()) {
    if (typeof spec !== 'string') continue;
    const inherited = await resolveStrict(ctx, resolveExtends(configPath, spec), depth + 1);
    if (inherited !== undefined) return inherited;
  }
  return undefined;
}

export const typescriptStrict: Rule = {
  id: 'typescript-strict',
  title: 'TypeScript strict mode is enabled',
  severity: 'warning',
  rationale:
    'Type errors are the cheapest feedback an agent can get: they arrive in seconds and point at a line. ' +
    'Strict mode turns many runtime bugs into such errors. The `extends` chain is followed.',
  async check(ctx) {
    const root = await ctx.readJson('tsconfig.json', { comments: true });
    if (root.kind === 'missing') return skip('No tsconfig.json.');
    if (root.kind === 'invalid') {
      return fail(`tsconfig.json is invalid: ${root.error}.`, 'Fix tsconfig.json so the compiler and agents can read it.');
    }
    const strict = await resolveStrict(ctx, 'tsconfig.json');
    if (strict === true) return pass('"strict" is enabled.');
    return fail(
      strict === false ? '"strict" is explicitly disabled.' : '"strict" is not enabled in tsconfig.json or its extends chain.',
      'Set "compilerOptions.strict": true. If it comes from a package in "extends", install dependencies first.',
    );
  },
};

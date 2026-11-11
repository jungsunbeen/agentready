import type { RepoContext } from '../context.js';
import type { Rule } from '../types.js';
import { fail, pass, skip } from './result.js';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

const LOCKFILES: readonly (readonly [file: string, manager: PackageManager])[] = [
  ['package-lock.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
];

/** Lockfiles present at the repository root, with the package manager each implies. */
export async function findLockfiles(ctx: RepoContext): Promise<{ file: string; manager: PackageManager }[]> {
  const found: { file: string; manager: PackageManager }[] = [];
  for (const [file, manager] of LOCKFILES) {
    if (await ctx.exists(file)) found.push({ file, manager });
  }
  return found;
}

export const singleLockfile: Rule = {
  id: 'single-lockfile',
  title: 'Exactly one lockfile is committed',
  severity: 'warning',
  rationale:
    'The lockfile tells an agent which package manager to use and pins what it installs. With none, ' +
    'installs drift; with several, the agent has to guess.',
  async check(ctx) {
    if (!(await ctx.exists('package.json'))) return skip('No package.json.');
    const found = await findLockfiles(ctx);
    const [only, ...others] = found;
    if (only === undefined) {
      return fail('No lockfile found.', 'Install once with your package manager and commit the lockfile.');
    }
    if (others.length > 0) {
      return fail(
        `Multiple lockfiles: ${found.map((entry) => entry.file).join(', ')}.`,
        'Keep the lockfile of the package manager you use and delete the others.',
      );
    }
    return pass(`Uses ${only.manager} (${only.file}).`);
  },
};

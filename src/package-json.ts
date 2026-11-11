import type { RepoContext } from './context.js';
import { isRecord } from './util.js';

/** The subset of package.json the rules care about, validated from untrusted JSON. */
export interface PackageInfo {
  readonly name: string | undefined;
  readonly description: string | undefined;
  readonly scripts: ReadonlyMap<string, string>;
  readonly engines: ReadonlyMap<string, string>;
}

export type PackageJsonFile =
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid'; readonly error: string }
  | { readonly kind: 'ok'; readonly pkg: PackageInfo };

export async function readPackageJson(ctx: RepoContext): Promise<PackageJsonFile> {
  const file = await ctx.readJson('package.json');
  if (file.kind !== 'ok') return file;
  if (!isRecord(file.value)) return { kind: 'invalid', error: 'top-level value is not an object' };

  const { name, description, scripts, engines } = file.value;
  return {
    kind: 'ok',
    pkg: {
      name: typeof name === 'string' ? name : undefined,
      description: typeof description === 'string' ? description : undefined,
      scripts: stringMap(scripts),
      engines: stringMap(engines),
    },
  };
}

function stringMap(value: unknown): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (!isRecord(value)) return map;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') map.set(key, entry);
  }
  return map;
}

import { describe, expect, it } from 'vitest';
import { agentCommands, referencedScripts } from '../src/rules/agent-commands.js';
import { agentInstructions } from '../src/rules/agent-instructions.js';
import { ciWorkflow } from '../src/rules/ci.js';
import { singleLockfile } from '../src/rules/lockfile.js';
import { nodeVersion } from '../src/rules/node-version.js';
import { packageScripts } from '../src/rules/package-scripts.js';
import { readme } from '../src/rules/readme.js';
import { resolveExtends, typescriptStrict } from '../src/rules/typescript-strict.js';
import { json, runRule } from './helpers.js';

const pkgWith = (extra: Record<string, unknown>) => json({ name: 'x', ...extra });

describe('agent-instructions', () => {
  it('passes with AGENTS.md', async () => {
    expect(await runRule(agentInstructions, { 'AGENTS.md': '# hi' })).toMatchObject({ status: 'pass' });
  });

  it('accepts other agent files such as CLAUDE.md', async () => {
    expect(await runRule(agentInstructions, { 'CLAUDE.md': '# hi' })).toMatchObject({ status: 'pass', message: 'Found CLAUDE.md.' });
  });

  it('fails when the file is missing or blank', async () => {
    expect(await runRule(agentInstructions, {})).toMatchObject({ status: 'fail' });
    expect(await runRule(agentInstructions, { 'AGENTS.md': '  \n' })).toMatchObject({ status: 'fail' });
  });
});

describe('referencedScripts', () => {
  it('finds explicit run commands and lifecycle shortcuts', () => {
    const text = 'Use `pnpm run build:prod`, then `npm test`. Finally npm run lint.';
    expect(referencedScripts(text)).toEqual(['build:prod', 'lint', 'test']);
  });

  it('ignores ambiguous and built-in commands', () => {
    expect(referencedScripts('pnpm install, pnpm build, bun test, npm ci')).toEqual([]);
  });
});

describe('agent-commands', () => {
  const scripts = pkgWith({ scripts: { lint: 'eslint .', test: 'vitest' } });

  it('passes when every referenced script exists', async () => {
    const result = await runRule(agentCommands, { 'package.json': scripts, 'AGENTS.md': 'Run `npm run lint` and `npm test`.' });
    expect(result).toMatchObject({ status: 'pass' });
  });

  it('fails and names scripts that do not exist', async () => {
    const result = await runRule(agentCommands, { 'package.json': scripts, 'AGENTS.md': 'Run `npm run check`.' });
    expect(result.status).toBe('fail');
    expect(result.message).toContain('check');
  });

  it('fails when no commands are mentioned', async () => {
    const result = await runRule(agentCommands, { 'package.json': scripts, 'AGENTS.md': 'Be nice.' });
    expect(result).toMatchObject({ status: 'fail' });
  });

  it('skips without an agent file or package.json', async () => {
    expect(await runRule(agentCommands, { 'package.json': scripts })).toMatchObject({ status: 'skip' });
    expect(await runRule(agentCommands, { 'AGENTS.md': 'npm test' })).toMatchObject({ status: 'skip' });
  });
});

describe('readme', () => {
  it('passes with a usage heading, in English or Korean', async () => {
    expect(await runRule(readme, { 'README.md': '# x\n## Usage\n' })).toMatchObject({ status: 'pass' });
    expect(await runRule(readme, { 'readme.md': '# x\n## 사용법\n' })).toMatchObject({ status: 'pass' });
  });

  it('fails without a usage heading', async () => {
    expect(await runRule(readme, { 'README.md': '# x\nusage is obvious\n' })).toMatchObject({ status: 'fail' });
  });

  it('fails without a README', async () => {
    expect(await runRule(readme, {})).toMatchObject({ status: 'fail' });
  });
});

describe('package-scripts', () => {
  it('passes with lint and test', async () => {
    const result = await runRule(packageScripts, { 'package.json': pkgWith({ scripts: { lint: 'eslint', test: 'vitest' } }) });
    expect(result).toMatchObject({ status: 'pass' });
  });

  it('fails on the npm placeholder test script', async () => {
    const placeholder = 'echo "Error: no test specified" && exit 1';
    const result = await runRule(packageScripts, { 'package.json': pkgWith({ scripts: { lint: 'eslint', test: placeholder } }) });
    expect(result.status).toBe('fail');
    expect(result.message).toContain('placeholder');
  });

  it('fails on missing scripts and invalid JSON', async () => {
    expect(await runRule(packageScripts, { 'package.json': pkgWith({}) })).toMatchObject({ status: 'fail' });
    expect(await runRule(packageScripts, { 'package.json': '{ nope' })).toMatchObject({ status: 'fail' });
  });

  it('skips non-JavaScript repositories', async () => {
    expect(await runRule(packageScripts, {})).toMatchObject({ status: 'skip' });
  });
});

describe('typescript-strict', () => {
  it('passes when strict is set directly, with comments in the file', async () => {
    const result = await runRule(typescriptStrict, { 'tsconfig.json': '{ /* c */ "compilerOptions": { "strict": true } }' });
    expect(result).toMatchObject({ status: 'pass' });
  });

  it('follows a relative extends chain', async () => {
    const result = await runRule(typescriptStrict, {
      'tsconfig.json': '{ "extends": "./config/base" }',
      'config/base.json': '{ "extends": "./strict.json" }',
      'config/strict.json': '{ "compilerOptions": { "strict": true } }',
    });
    expect(result).toMatchObject({ status: 'pass' });
  });

  it('lets later entries in an extends array win', async () => {
    const result = await runRule(typescriptStrict, {
      'tsconfig.json': '{ "extends": ["./on.json", "./off.json"] }',
      'on.json': '{ "compilerOptions": { "strict": true } }',
      'off.json': '{ "compilerOptions": { "strict": false } }',
    });
    expect(result).toMatchObject({ status: 'fail', message: '"strict" is explicitly disabled.' });
  });

  it('resolves package extends from node_modules', async () => {
    const result = await runRule(typescriptStrict, {
      'tsconfig.json': '{ "extends": "@tsconfig/strictest" }',
      'node_modules/@tsconfig/strictest/tsconfig.json': '{ "compilerOptions": { "strict": true } }',
    });
    expect(result).toMatchObject({ status: 'pass' });
  });

  it('fails when strict is unset, skips without tsconfig', async () => {
    expect(await runRule(typescriptStrict, { 'tsconfig.json': '{}' })).toMatchObject({ status: 'fail' });
    expect(await runRule(typescriptStrict, {})).toMatchObject({ status: 'skip' });
  });

  it('maps extends specifiers to repository paths', () => {
    expect(resolveExtends('tsconfig.json', './base')).toBe('base.json');
    expect(resolveExtends('a/tsconfig.json', '../b.json')).toBe('b.json');
    expect(resolveExtends('tsconfig.json', 'pkg/tsconfig.base.json')).toBe('node_modules/pkg/tsconfig.base.json');
    expect(resolveExtends('tsconfig.json', '@scope/pkg')).toBe('node_modules/@scope/pkg/tsconfig.json');
  });
});

describe('ci-workflow', () => {
  it('passes with a GitHub Actions workflow or another CI file', async () => {
    expect(await runRule(ciWorkflow, { '.github/workflows/ci.yaml': 'on: push' })).toMatchObject({ status: 'pass' });
    expect(await runRule(ciWorkflow, { '.gitlab-ci.yml': 'test: {}' })).toMatchObject({ status: 'pass' });
  });

  it('fails without CI', async () => {
    expect(await runRule(ciWorkflow, { '.github/workflows/README.md': '' })).toMatchObject({ status: 'fail' });
  });
});

describe('single-lockfile', () => {
  const pkg = pkgWith({});

  it('passes with exactly one lockfile', async () => {
    expect(await runRule(singleLockfile, { 'package.json': pkg, 'pnpm-lock.yaml': '' })).toMatchObject({
      status: 'pass',
      message: 'Uses pnpm (pnpm-lock.yaml).',
    });
  });

  it('fails with none or several', async () => {
    expect(await runRule(singleLockfile, { 'package.json': pkg })).toMatchObject({ status: 'fail' });
    const both = { 'package.json': pkg, 'package-lock.json': '{}', 'yarn.lock': '' };
    expect(await runRule(singleLockfile, both)).toMatchObject({ status: 'fail' });
  });

  it('skips without package.json', async () => {
    expect(await runRule(singleLockfile, {})).toMatchObject({ status: 'skip' });
  });
});

describe('node-version', () => {
  it('passes with engines.node, .nvmrc or .tool-versions', async () => {
    expect(await runRule(nodeVersion, { 'package.json': pkgWith({ engines: { node: '>=22' } }) })).toMatchObject({ status: 'pass' });
    expect(await runRule(nodeVersion, { 'package.json': pkgWith({}), '.nvmrc': '24' })).toMatchObject({ status: 'pass' });
    expect(await runRule(nodeVersion, { 'package.json': pkgWith({}), '.tool-versions': 'nodejs 24.1.0\n' })).toMatchObject({
      status: 'pass',
    });
  });

  it('fails when nothing declares a version', async () => {
    expect(await runRule(nodeVersion, { 'package.json': pkgWith({}) })).toMatchObject({ status: 'fail' });
  });

  it('skips without package.json', async () => {
    expect(await runRule(nodeVersion, {})).toMatchObject({ status: 'skip' });
  });
});

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { check } from '../src/check.js';
import { RepoContext } from '../src/context.js';
import { renderAgentsMd } from '../src/init.js';
import { run, type Io } from '../src/run.js';
import { GOOD_REPO, json, makeRepo } from './helpers.js';

async function cli(argv: string[], cwd: string) {
  let stdout = '';
  let stderr = '';
  const io: Io = {
    cwd,
    color: false,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  };
  const code = await run(argv, io);
  return { code, stdout, stderr };
}

describe('agent-lint check', () => {
  it('exits 0 for a ready repository and checks cwd by default', async () => {
    const result = await cli([], await makeRepo(GOOD_REPO));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Score 100/100');
  });

  it('exits 1 when an error rule fails, unless --exit-zero is set', async () => {
    const root = await makeRepo();
    expect((await cli(['check'], root)).code).toBe(1);
    const { code, stdout } = await cli(['check', '--json', '--exit-zero'], root);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ passed: false });
  });

  it('accepts a directory argument and prints JSON', async () => {
    const root = await makeRepo(GOOD_REPO);
    const result = await cli(['check', path.basename(root), '--json'], path.dirname(root));
    const report = JSON.parse(result.stdout) as { score: number; findings: unknown[] };
    expect(report.score).toBe(100);
    expect(report.findings).toHaveLength(8);
  });

  it('exits 1 when the score is below --fail-under', async () => {
    // No engines.node: only the node-version warning fails, so the check itself passes.
    const files = { ...GOOD_REPO, 'package.json': json({ scripts: { lint: 'x', test: 'y' } }) };
    const root = await makeRepo(files);
    expect((await cli([], root)).code).toBe(0);
    const result = await cli(['--fail-under', '100'], root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('below --fail-under 100');
  });

  it('exits 2 on usage errors', async () => {
    const root = await makeRepo();
    expect((await cli(['--nope'], root)).code).toBe(2);
    expect((await cli(['--fail-under', 'abc'], root)).code).toBe(2);
    expect((await cli(['check', 'a', 'b'], root)).code).toBe(2);
    expect((await cli(['missing-dir'], root)).code).toBe(2);
  });

  it('skips rules named by --ignore and leaves them out of the score', async () => {
    // Without CI only the ci-workflow warning fails, so the score is below 100.
    const withoutCi = Object.fromEntries(Object.entries(GOOD_REPO).filter(([file]) => !file.startsWith('.github/')));
    const root = await makeRepo(withoutCi);
    const before = JSON.parse((await cli(['--json'], root)).stdout) as { score: number };
    expect(before.score).toBeLessThan(100);

    const result = await cli(['check', '--json', '--ignore', 'ci-workflow'], root);
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as {
      score: number;
      summary: { skip: number };
      findings: { ruleId: string; status: string; message: string }[];
    };
    expect(report.score).toBe(100);
    expect(report.summary.skip).toBe(1);
    expect(report.findings.find((f) => f.ruleId === 'ci-workflow')).toMatchObject({
      status: 'skip',
      message: 'Ignored by configuration',
    });
  });

  it('accepts --ignore more than once', async () => {
    const root = await makeRepo();
    const result = await cli(['--json', '--ignore', 'agent-instructions', '--ignore', 'readme'], root);
    const report = JSON.parse(result.stdout) as { findings: { ruleId: string; status: string; message: string }[] };
    const statusOf = (id: string) => report.findings.find((f) => f.ruleId === id)?.status;
    expect(statusOf('agent-instructions')).toBe('skip');
    expect(statusOf('readme')).toBe('skip');
    expect(report.findings.filter((f) => f.message === 'Ignored by configuration')).toHaveLength(2);
  });

  it('exits 2 for an unknown rule in --ignore', async () => {
    const root = await makeRepo(GOOD_REPO);
    const result = await cli(['--ignore', 'no-such-rule'], root);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Unknown rule in --ignore: no-such-rule');
  });
});

describe('option validation', () => {
  it('rejects an option that belongs to another command', async () => {
    const root = await makeRepo(GOOD_REPO);
    const cases = [
      ['init', '--json'],
      ['rules', '--fail-under', '90'],
      ['check', '--dry-run'],
      ['rules', '--ignore', 'readme'],
      ['init', '--exit-zero'],
    ];
    for (const argv of cases) {
      const result = await cli(argv, root);
      expect(result.code, argv.join(' ')).toBe(2);
      expect(result.stderr, argv.join(' ')).toContain('cannot be used with');
    }
  });

  it('still accepts --help and --version on every command', async () => {
    const root = await makeRepo(GOOD_REPO);
    expect((await cli(['init', '--help'], root)).code).toBe(0);
    expect((await cli(['rules', '--version'], root)).code).toBe(0);
  });
});

describe('agent-lint rules', () => {
  it('lists every rule', async () => {
    const { code, stdout } = await cli(['rules'], process.cwd());
    expect(code).toBe(0);
    expect(stdout).toContain('agent-commands');
  });
});

describe('agent-lint init', () => {
  const files = {
    'package.json': json({ name: 'app', scripts: { build: 'tsc', lint: 'eslint .', test: 'vitest run' } }),
    'pnpm-lock.yaml': '',
  };

  it('writes AGENTS.md using the detected package manager', async () => {
    const root = await makeRepo(files);
    expect((await cli(['init'], root)).code).toBe(0);
    const written = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
    expect(written).toContain('# app');
    expect(written).toContain('- Install: `pnpm install`');
    expect(written).toContain('`pnpm run test`');
  });

  it('produces a file that satisfies the agent rules', async () => {
    const root = await makeRepo(files);
    await cli(['init'], root);
    const report = await check(root);
    const statusOf = (id: string) => report.findings.find((f) => f.ruleId === id)?.status;
    expect(statusOf('agent-instructions')).toBe('pass');
    expect(statusOf('agent-commands')).toBe('pass');
  });

  it('refuses to overwrite without --force', async () => {
    const root = await makeRepo({ ...files, 'AGENTS.md': 'mine' });
    expect((await cli(['init'], root)).code).toBe(1);
    expect(await readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe('mine');
    expect((await cli(['init', '--force'], root)).code).toBe(0);
  });

  it('prints instead of writing with --dry-run', async () => {
    const root = await makeRepo(files);
    const { stdout } = await cli(['init', '--dry-run'], root);
    expect(stdout).toContain('## Commands');
    expect(await new RepoContext(root).exists('AGENTS.md')).toBe(false);
  });

  it('leaves TODOs and no install command when there is no package.json', async () => {
    const text = await renderAgentsMd(new RepoContext(await makeRepo()));
    expect(text).not.toContain('- Install:');
    expect(text).toContain('TODO: No package.json found.');
  });

  it('uses npm ci only when package-lock.json exists', async () => {
    const pkg = { 'package.json': json({ name: 'app', scripts: { test: 'vitest run' } }) };
    const withoutLock = await renderAgentsMd(new RepoContext(await makeRepo(pkg)));
    expect(withoutLock).toContain('- Install: `npm install`');
    const withLock = await renderAgentsMd(new RepoContext(await makeRepo({ ...pkg, 'package-lock.json': '{}' })));
    expect(withLock).toContain('- Install: `npm ci`');
  });
});

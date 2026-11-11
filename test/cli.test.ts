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

describe('agentready check', () => {
  it('exits 0 for a ready repository and checks cwd by default', async () => {
    const result = await cli([], await makeRepo(GOOD_REPO));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Score 100/100');
  });

  it('exits 1 when an error rule fails', async () => {
    expect((await cli(['check'], await makeRepo())).code).toBe(1);
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
});

describe('agentready rules', () => {
  it('lists every rule', async () => {
    const { code, stdout } = await cli(['rules'], process.cwd());
    expect(code).toBe(0);
    expect(stdout).toContain('agent-commands');
  });
});

describe('agentready init', () => {
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

  it('leaves TODOs when there is no package.json', async () => {
    const text = await renderAgentsMd(new RepoContext(await makeRepo()));
    expect(text).toContain('- Install: `npm ci`');
    expect(text).toContain('TODO: Add build, lint and test scripts');
  });
});

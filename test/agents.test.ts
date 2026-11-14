import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { planAgents, SKILL_NAME } from '../src/agents.js';
import { check } from '../src/check.js';
import { RepoContext } from '../src/context.js';
import { run, type Io } from '../src/run.js';
import { json, makeRepo } from './helpers.js';

const CLAUDE_SKILL = `.claude/skills/${SKILL_NAME}/SKILL.md`;
const SHARED_SKILL = `.agents/skills/${SKILL_NAME}/SKILL.md`;

const PROJECT = {
  'package.json': json({ name: 'app', scripts: { lint: 'eslint .', test: 'vitest run' } }),
  'package-lock.json': '{}',
};

async function init(root: string, ...args: string[]) {
  let stdout = '';
  let stderr = '';
  const io: Io = { cwd: root, color: false, stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) };
  const code = await run(['init', ...args], io);
  return { code, stdout, stderr };
}

const read = (root: string, relPath: string) => readFile(path.join(root, relPath), 'utf8');

describe('planAgents', () => {
  it('maps each agent to its files and shares the skill between Codex and Copilot', async () => {
    const ctx = new RepoContext(await makeRepo());
    const plan = await planAgents(ctx, ['claude', 'codex', 'copilot']);
    expect(plan.create.map((file) => file.path).sort()).toEqual(['CLAUDE.md', SHARED_SKILL, CLAUDE_SKILL].sort());
    expect(plan.keep).toEqual([]);
  });

  it('keeps files that already exist', async () => {
    const ctx = new RepoContext(await makeRepo({ 'CLAUDE.md': '# mine' }));
    const plan = await planAgents(ctx, ['claude']);
    expect(plan.keep).toEqual(['CLAUDE.md']);
  });
});

describe('agent-lint init --agent', () => {
  it('installs a Claude Code skill that preloads the check result', async () => {
    const root = await makeRepo(PROJECT);
    expect((await init(root, '--agent', 'claude')).code).toBe(0);

    const skill = await read(root, CLAUDE_SKILL);
    expect(skill).toMatch(/^---\ndescription: .+\nallowed-tools: Bash\(agent-lint check --json --exit-zero\)/);
    expect(skill).toContain('!`agent-lint check --json --exit-zero`');
    expect(await read(root, 'CLAUDE.md')).toBe('@AGENTS.md\n');
  });

  it('installs one shared skill for Codex and Copilot CLI', async () => {
    const root = await makeRepo(PROJECT);
    const { code, stdout } = await init(root, '--agent', 'codex', '--agent', 'copilot');
    expect(code).toBe(0);
    expect(stdout.match(new RegExp(SHARED_SKILL, 'g'))).toHaveLength(1);

    const skill = await read(root, SHARED_SKILL);
    expect(skill).toMatch(new RegExp(`^---\\nname: ${SKILL_NAME}\\ndescription: `));
    expect(skill).toContain('Run `agent-lint check --json --exit-zero`');
  });

  it('keeps an existing AGENTS.md and existing skills instead of failing', async () => {
    const root = await makeRepo({ ...PROJECT, 'AGENTS.md': 'mine', [SHARED_SKILL]: 'edited' });
    const { code, stdout } = await init(root, '--agent', 'codex');
    expect(code).toBe(0);
    expect(stdout).toContain('Kept    AGENTS.md');
    expect(await read(root, 'AGENTS.md')).toBe('mine');
    expect(await read(root, SHARED_SKILL)).toBe('edited');
  });

  it('changes nothing when run twice', async () => {
    const root = await makeRepo(PROJECT);
    await init(root, '--agent', 'claude');
    const before = await read(root, CLAUDE_SKILL);
    const { stdout } = await init(root, '--agent', 'claude');
    expect(stdout).not.toContain('Created');
    expect(await read(root, CLAUDE_SKILL)).toBe(before);
  });

  it('leaves the repository passing the agent rules', async () => {
    const root = await makeRepo(PROJECT);
    await init(root, '--agent', 'claude');
    const report = await check(root);
    const statusOf = (id: string) => report.findings.find((f) => f.ruleId === id)?.status;
    expect(statusOf('agent-instructions')).toBe('pass');
    expect(statusOf('agent-commands')).toBe('pass');
  });

  it('rejects unknown agents and --dry-run with --agent', async () => {
    const root = await makeRepo(PROJECT);
    const unknown = await init(root, '--agent', 'cursor');
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain('Unknown agent: cursor');
    expect((await init(root, '--agent', 'claude', '--dry-run')).code).toBe(2);
    expect(await new RepoContext(root).exists('AGENTS.md')).toBe(false);
  });
});

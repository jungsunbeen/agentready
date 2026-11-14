import path from 'node:path';
import type { RepoContext } from './context.js';

export const AGENTS = ['claude', 'codex', 'copilot'] as const;
export type Agent = (typeof AGENTS)[number];

export const AGENT_NAMES: Readonly<Record<Agent, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
  copilot: 'Copilot CLI',
};

export function isAgent(name: string): name is Agent {
  return (AGENTS as readonly string[]).includes(name);
}

export const SKILL_NAME = 'agent-lint-fix';

// --exit-zero: a failing check is the expected input here, not an error.
const CHECK_COMMAND = 'agent-lint check --json --exit-zero';

const SKILL_DESCRIPTION =
  'Check whether this repository is ready for AI coding agents and fix what fails. ' +
  'Use when the user asks to run agent-lint or to make the repository easier for agents to work in.';

const SKILL_STEPS = `For each finding with "status": "fail", error severity first:

1. Apply its "fix". Change only what the fix asks for.
2. If the fix needs a decision only the user can make (which lockfile to keep, which Node.js version to require), ask instead of guessing.
3. For "agent-commands", update the instructions file to match package.json, unless the missing script was clearly meant to exist.

Then run \`agent-lint check\` again and repeat until "passed" is true.
Finish by reporting the score before and after, and any finding you left for the user.`;

// Claude Code runs `!` commands before the model reads the skill, so the result arrives preloaded.
const CLAUDE_SKILL = `---
description: ${SKILL_DESCRIPTION}
allowed-tools: Bash(${CHECK_COMMAND}) Bash(agent-lint check)
---

Current result of \`${CHECK_COMMAND}\`:

!\`${CHECK_COMMAND}\`

${SKILL_STEPS}
`;

// Codex and Copilot CLI both read .agents/skills, but cannot run a command inside a skill.
const SHARED_SKILL = `---
name: ${SKILL_NAME}
description: ${SKILL_DESCRIPTION}
---

Run \`${CHECK_COMMAND}\` and read "findings".

${SKILL_STEPS}
`;

// Claude Code reads CLAUDE.md, not AGENTS.md. An import keeps a single source of truth.
const CLAUDE_MD = '@AGENTS.md\n';

export interface PlannedFile {
  /** Path relative to the repository root. */
  readonly path: string;
  readonly content: string;
}

function filesFor(agent: Agent): PlannedFile[] {
  const shared = { path: `.agents/skills/${SKILL_NAME}/SKILL.md`, content: SHARED_SKILL };
  switch (agent) {
    case 'claude':
      return [
        { path: `.claude/skills/${SKILL_NAME}/SKILL.md`, content: CLAUDE_SKILL },
        { path: 'CLAUDE.md', content: CLAUDE_MD },
      ];
    case 'codex':
    case 'copilot':
      return [shared];
  }
}

export interface AgentPlan {
  /** Files to create. */
  readonly create: readonly PlannedFile[];
  /** Files that already exist and are left untouched. */
  readonly keep: readonly string[];
}

/**
 * Decides which files connecting the given agents would create.
 * Existing files are never overwritten, so running it twice changes nothing.
 */
export async function planAgents(ctx: RepoContext, agents: readonly Agent[]): Promise<AgentPlan> {
  const unique = new Map<string, PlannedFile>();
  for (const agent of agents) {
    for (const file of filesFor(agent)) unique.set(file.path, file);
  }
  const create: PlannedFile[] = [];
  const keep: string[] = [];
  for (const file of unique.values()) {
    if (await ctx.exists(file.path)) keep.push(file.path);
    else create.push(file);
  }
  return { create, keep };
}

/** Converts a planned path to an absolute one under `root`. */
export function absolutePath(root: string, file: PlannedFile): string {
  return path.join(root, ...file.path.split('/'));
}

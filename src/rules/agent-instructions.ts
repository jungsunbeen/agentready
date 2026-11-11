import type { RepoContext } from '../context.js';
import type { Rule } from '../types.js';
import { fail, pass } from './result.js';

/** Files that coding agents read on startup, in order of preference. */
export const AGENT_DOC_PATHS = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.cursorrules',
] as const;

export interface AgentDoc {
  readonly path: string;
  readonly text: string;
}

/** Returns the first non-empty agent instructions file, if any. */
export async function findAgentDoc(ctx: RepoContext): Promise<AgentDoc | undefined> {
  for (const docPath of AGENT_DOC_PATHS) {
    const text = await ctx.readText(docPath);
    if (text !== undefined && text.trim() !== '') return { path: docPath, text };
  }
  return undefined;
}

export const agentInstructions: Rule = {
  id: 'agent-instructions',
  title: 'An agent instructions file exists',
  severity: 'error',
  rationale:
    'Agents start every session without memory of the project. A checked-in instructions file ' +
    `(${AGENT_DOC_PATHS.join(', ')}) is the one place they reliably read for commands, ` +
    'conventions and boundaries.',
  async check(ctx) {
    const doc = await findAgentDoc(ctx);
    if (doc) return pass(`Found ${doc.path}.`);
    return fail(
      'No agent instructions file found.',
      'Run `agentready init` to generate AGENTS.md from your package.json scripts.',
    );
  },
};

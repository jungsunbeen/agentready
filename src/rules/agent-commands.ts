import { readPackageJson } from '../package-json.js';
import type { Rule } from '../types.js';
import { findAgentDoc } from './agent-instructions.js';
import { fail, pass, skip } from './result.js';

/** `npm run x`, `pnpm run x`, `yarn run x`, `bun run x` */
const RUN_SCRIPT = /\b(?:npm|pnpm|yarn|bun)\s+run\s+([\w:.-]+)/g;
/** `npm test`, `pnpm start`, ... (`bun test` is Bun's built-in runner, so it is excluded.) */
const LIFECYCLE_SCRIPT = /\b(?:npm|pnpm|yarn)\s+(test|start)\b/g;

/**
 * Extracts package script names referenced in free text.
 * Only unambiguous forms are recognised; `pnpm build` could be a script or a
 * built-in command, so it is ignored rather than guessed.
 */
export function referencedScripts(text: string): string[] {
  const names = new Set<string>();
  for (const pattern of [RUN_SCRIPT, LIFECYCLE_SCRIPT]) {
    for (const match of text.matchAll(pattern)) {
      const name = match[1]?.replace(/\.+$/, '');
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

export const agentCommands: Rule = {
  id: 'agent-commands',
  title: 'Commands in the agent instructions actually exist',
  severity: 'error',
  rationale:
    'Instructions drift. When AGENTS.md says `npm run check` but the script was renamed, an agent ' +
    'runs a failing command, then improvises. Every `<pm> run <script>`, `npm test` and `npm start` ' +
    'in the instructions must resolve to a script in package.json.',
  async check(ctx) {
    const doc = await findAgentDoc(ctx);
    if (!doc) return skip('No agent instructions file to check.');
    const file = await readPackageJson(ctx);
    if (file.kind !== 'ok') return skip('No readable package.json to check against.');

    const referenced = referencedScripts(doc.text);
    if (referenced.length === 0) {
      return fail(
        `${doc.path} does not mention any package scripts.`,
        'List the exact commands an agent should run to verify a change, e.g. `npm run lint` and `npm test`.',
      );
    }
    const missing = referenced.filter((name) => !file.pkg.scripts.has(name));
    if (missing.length > 0) {
      return fail(
        `${doc.path} references scripts missing from package.json: ${missing.join(', ')}.`,
        'Update the instructions or add the scripts, so agents do not run commands that fail.',
      );
    }
    return pass(`All ${String(referenced.length)} referenced scripts exist.`);
  },
};

import path from 'node:path';
import type { RepoContext } from './context.js';
import { readPackageJson } from './package-json.js';
import { findLockfiles } from './rules/lockfile.js';

/** Scripts worth telling an agent about, in the order a change is usually verified. */
const KNOWN_SCRIPTS: readonly (readonly [script: string, label: string])[] = [
  ['build', 'Build'],
  ['typecheck', 'Type-check'],
  ['lint', 'Lint'],
  ['format', 'Format'],
  ['test', 'Test'],
  ['dev', 'Dev server'],
];

/** Scripts an agent should run before it considers a change done. */
const VERIFY_SCRIPTS = new Set(['typecheck', 'lint', 'test']);

const TODO = (text: string) => `<!-- TODO: ${text} -->`;

/**
 * Generates an AGENTS.md draft from package.json and the lockfile.
 * Every command it writes uses `<pm> run <script>`, so the result passes
 * the `agent-commands` rule by construction.
 */
export async function renderAgentsMd(ctx: RepoContext): Promise<string> {
  const file = await readPackageJson(ctx);
  const pkg = file.kind === 'ok' ? file.pkg : undefined;
  const manager = (await findLockfiles(ctx))[0]?.manager ?? 'npm';
  const install = manager === 'npm' ? 'npm ci' : `${manager} install`;

  const present = KNOWN_SCRIPTS.filter(([script]) => pkg?.scripts.has(script) === true);
  const command = (script: string) => `\`${manager} run ${script}\``;

  const lines = [
    `# ${pkg?.name ?? path.basename(ctx.root)}`,
    '',
    pkg?.description ?? TODO('One paragraph: what this project does and who uses it.'),
    '',
    '## Commands',
    '',
    `- Install: \`${install}\``,
    ...present.map(([script, label]) => `- ${label}: ${command(script)}`),
  ];
  if (present.length === 0) lines.push(TODO('Add build, lint and test scripts to package.json, then list them here.'));

  const verify = present.filter(([script]) => VERIFY_SCRIPTS.has(script));
  lines.push('', '## Before you finish', '');
  if (verify.length > 0) {
    lines.push(`Run ${verify.map(([script]) => command(script)).join(', ')} and make sure they pass.`);
  } else {
    lines.push(TODO('Which commands must pass before a change is done?'));
  }

  lines.push(
    '',
    '## Conventions',
    '',
    TODO('Directory layout, code style, and files agents must not edit (e.g. generated code).'),
  );
  return `${lines.join('\n')}\n`;
}

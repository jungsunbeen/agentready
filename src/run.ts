import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { absolutePath, AGENT_NAMES, AGENTS, isAgent, planAgents, SKILL_NAME, type PlannedFile } from './agents.js';
import { check } from './check.js';
import { RepoContext } from './context.js';
import { renderAgentsMd } from './init.js';
import { formatJson, formatRulesJson, formatRulesMarkdown, formatRulesText, formatText } from './report.js';
import { rules } from './rules/index.js';
import { errorMessage, isRecord } from './util.js';

/** Everything the CLI touches in the outside world, injected so tests can capture it. */
export interface Io {
  readonly cwd: string;
  readonly color: boolean;
  stdout(text: string): void;
  stderr(text: string): void;
}

export const EXIT = { ok: 0, failed: 1, usage: 2 } as const;

const HELP = `Usage: agentready [command] [dir] [options]

Commands:
  check [dir]   Check a repository (default)
  rules         List all rules
  init [dir]    Create AGENTS.md from package.json scripts,
                and optionally connect AI coding tools

Options:
  --json             Machine-readable output (check, rules)
  --fail-under <n>   Also exit 1 if the score is below n (check)
  --exit-zero        Always exit 0, for hooks and skills that only read the result (check)
  --ignore <ruleId>  Skip a rule; repeat to skip more than one (check)
  --markdown         Rules as Markdown (rules)
  --agent <name>     Install the ${SKILL_NAME} skill for ${AGENTS.join(', ')} (init, repeatable)
  --force            Overwrite an existing AGENTS.md (init)
  --dry-run          Print AGENTS.md instead of writing it (init)
  -h, --help         Show this help
  -v, --version      Show the version

Each option belongs to a command: using it with another one is a usage error.
Exit codes: 0 ok, 1 check failed, 2 usage error
`;

const OPTIONS = {
  json: { type: 'boolean' },
  'fail-under': { type: 'string' },
  'exit-zero': { type: 'boolean' },
  ignore: { type: 'string', multiple: true },
  markdown: { type: 'boolean' },
  agent: { type: 'string', multiple: true },
  force: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const satisfies ParseArgsConfig['options'];

const COMMANDS = ['check', 'rules', 'init'] as const;
type Command = (typeof COMMANDS)[number];

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

/** Options each command accepts, besides the global `-h/--help` and `-v/--version`. */
const COMMAND_OPTIONS = {
  check: ['json', 'fail-under', 'exit-zero', 'ignore'],
  rules: ['json', 'markdown'],
  init: ['agent', 'force', 'dry-run'],
} as const satisfies Readonly<Record<Command, readonly (keyof typeof OPTIONS)[]>>;

const GLOBAL_OPTIONS: readonly string[] = ['help', 'version'];

const RULE_IDS: readonly string[] = rules.map((rule) => rule.id);

function parse(argv: readonly string[]) {
  return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
}
type Values = ReturnType<typeof parse>['values'];

class UsageError extends Error {}

/** Rejects an option that this command does not take, instead of silently ignoring it. */
function rejectForeignOptions(command: Command, values: Values): void {
  const allowed: readonly string[] = [...GLOBAL_OPTIONS, ...COMMAND_OPTIONS[command]];
  const foreign = Object.keys(values).filter((name) => !allowed.includes(name));
  if (foreign.length === 0) return;
  const given = foreign.map((name) => `--${name}`).join(', ');
  const usable = COMMAND_OPTIONS[command].map((name) => `--${name}`).join(', ');
  throw new UsageError(`${given} cannot be used with \`${command}\`. \`${command}\` takes ${usable}.`);
}

function parseIgnore(raw: readonly string[] | undefined): readonly string[] {
  const ignore = raw ?? [];
  const unknown = ignore.filter((id) => !RULE_IDS.includes(id));
  if (unknown.length > 0) {
    throw new UsageError(`Unknown rule in --ignore: ${unknown.join(', ')}. Run \`agentready rules\` to list rule IDs.`);
  }
  return ignore;
}

function readVersion(): string {
  const pkg: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return isRecord(pkg) && typeof pkg.version === 'string' ? pkg.version : 'unknown';
}

function parseFailUnder(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new UsageError(`--fail-under must be a number from 0 to 100, got "${raw}"`);
  }
  return value;
}

export async function run(argv: readonly string[], io: Io): Promise<number> {
  try {
    const { values, positionals } = parse(argv);
    if (values.help === true) {
      io.stdout(HELP);
      return EXIT.ok;
    }
    if (values.version === true) {
      io.stdout(`${readVersion()}\n`);
      return EXIT.ok;
    }

    const [first, ...rest] = positionals;
    const command: Command = first !== undefined && isCommand(first) ? first : 'check';
    const args = first !== undefined && isCommand(first) ? rest : positionals;
    rejectForeignOptions(command, values);
    if (args.length > (command === 'rules' ? 0 : 1)) throw new UsageError(`Too many arguments: ${args.join(' ')}`);
    const dir = path.resolve(io.cwd, args[0] ?? '.');

    switch (command) {
      case 'check':
        return await runCheck(dir, values, io);
      case 'rules':
        io.stdout(values.markdown === true ? formatRulesMarkdown(rules) : values.json === true ? formatRulesJson(rules) : formatRulesText(rules));
        return EXIT.ok;
      case 'init':
        return await runInit(dir, values, io);
    }
  } catch (error) {
    const usage = error instanceof UsageError || (isRecord(error) && typeof error.code === 'string' && error.code.startsWith('ERR_PARSE_ARGS'));
    io.stderr(`agentready: ${errorMessage(error)}\n`);
    if (usage) io.stderr(`\n${HELP}`);
    return EXIT.usage;
  }
}

async function runCheck(dir: string, values: Values, io: Io): Promise<number> {
  const failUnder = parseFailUnder(values['fail-under']);
  const ignore = parseIgnore(values.ignore);
  const report = await check(dir, { ignore });
  io.stdout(values.json === true ? formatJson(report) : formatText(report, { color: io.color }));
  if (values['exit-zero'] === true) return EXIT.ok;

  if (!report.passed) return EXIT.failed;
  if (failUnder !== undefined && report.score < failUnder) {
    io.stderr(`Score ${String(report.score)} is below --fail-under ${String(failUnder)}.\n`);
    return EXIT.failed;
  }
  return EXIT.ok;
}

async function runInit(dir: string, values: Values, io: Io): Promise<number> {
  const requested = values.agent ?? [];
  const unknown = requested.filter((name) => !isAgent(name));
  if (unknown.length > 0) throw new UsageError(`Unknown agent: ${unknown.join(', ')}. Choose from ${AGENTS.join(', ')}.`);
  const agents = requested.filter(isAgent);
  if (values['dry-run'] === true && agents.length > 0) throw new UsageError('--dry-run cannot be combined with --agent');

  const ctx = new RepoContext(dir);
  const agentsMd = await renderAgentsMd(ctx);
  if (values['dry-run'] === true) {
    io.stdout(agentsMd);
    return EXIT.ok;
  }

  const agentsMdExists = await ctx.exists('AGENTS.md');
  if (agentsMdExists && values.force !== true && agents.length === 0) {
    io.stderr('AGENTS.md already exists. Use --force to overwrite it, or --dry-run to preview.\n');
    return EXIT.failed;
  }

  const create: PlannedFile[] = [];
  const keep: string[] = [];
  if (!agentsMdExists || values.force === true) create.push({ path: 'AGENTS.md', content: agentsMd });
  else keep.push('AGENTS.md');
  const plan = await planAgents(ctx, agents);
  create.push(...plan.create);
  keep.push(...plan.keep);

  for (const file of create) {
    const target = absolutePath(ctx.root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }

  const lines = [
    ...create.map((file) => `Created ${file.path}`),
    ...keep.map((file) => `Kept    ${file} (already exists)`),
  ];
  if (create.some((file) => file.path === 'AGENTS.md')) lines.push('', 'Fill in the TODO comments in AGENTS.md.');
  if (agents.length > 0) {
    const tools = agents.map((agent) => AGENT_NAMES[agent]).join(', ');
    lines.push(`Connected ${tools}. Ask the agent to "fix agentready findings", or call the ${SKILL_NAME} skill directly.`);
  }
  io.stdout(`${lines.join('\n')}\n`);
  return EXIT.ok;
}

import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
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
  init [dir]    Create AGENTS.md from package.json scripts

Options:
  --json             Machine-readable output (check, rules)
  --fail-under <n>   Also exit 1 if the score is below n (check)
  --markdown         Rules as Markdown (rules)
  --force            Overwrite an existing AGENTS.md (init)
  --dry-run          Print AGENTS.md instead of writing it (init)
  -h, --help         Show this help
  -v, --version      Show the version

Exit codes: 0 ok, 1 check failed, 2 usage error
`;

const OPTIONS = {
  json: { type: 'boolean' },
  'fail-under': { type: 'string' },
  markdown: { type: 'boolean' },
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

function parse(argv: readonly string[]) {
  return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
}
type Values = ReturnType<typeof parse>['values'];

class UsageError extends Error {}

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
  const report = await check(dir);
  io.stdout(values.json === true ? formatJson(report) : formatText(report, { color: io.color }));

  if (!report.passed) return EXIT.failed;
  if (failUnder !== undefined && report.score < failUnder) {
    io.stderr(`Score ${String(report.score)} is below --fail-under ${String(failUnder)}.\n`);
    return EXIT.failed;
  }
  return EXIT.ok;
}

async function runInit(dir: string, values: Values, io: Io): Promise<number> {
  const ctx = new RepoContext(dir);
  const content = await renderAgentsMd(ctx);
  if (values['dry-run'] === true) {
    io.stdout(content);
    return EXIT.ok;
  }
  if (values.force !== true && (await ctx.exists('AGENTS.md'))) {
    io.stderr('AGENTS.md already exists. Use --force to overwrite it, or --dry-run to preview.\n');
    return EXIT.failed;
  }
  const target = path.join(ctx.root, 'AGENTS.md');
  await writeFile(target, content);
  io.stdout(`Wrote ${path.relative(io.cwd, target) || 'AGENTS.md'}. Fill in the TODO comments.\n`);
  return EXIT.ok;
}

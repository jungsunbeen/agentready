import { stat } from 'node:fs/promises';
import { RepoContext } from './context.js';
import { fail, skip } from './rules/result.js';
import { rules as builtInRules } from './rules/index.js';
import type { Finding, Report, Rule, Severity } from './types.js';
import { errorMessage } from './util.js';

export interface CheckOptions {
  /** Rules to run. Defaults to all built-in rules. */
  readonly rules?: readonly Rule[];
  /** Rule IDs to skip. An ignored rule is reported as skipped and stays out of the score. */
  readonly ignore?: readonly string[];
}

const WEIGHT: Readonly<Record<Severity, number>> = { error: 3, warning: 1 };

/** Weighted share of applicable rules that passed, 0–100. A repo where nothing applies scores 100. */
export function computeScore(findings: readonly Finding[]): number {
  let total = 0;
  let earned = 0;
  for (const finding of findings) {
    if (finding.status === 'skip') continue;
    total += WEIGHT[finding.severity];
    if (finding.status === 'pass') earned += WEIGHT[finding.severity];
  }
  return total === 0 ? 100 : Math.round((earned / total) * 100);
}

/**
 * Runs rules against the repository at `root`.
 * A rule that throws is reported as a failure instead of aborting the run.
 * A rule named in `options.ignore` is not run at all.
 *
 * @throws {Error} if `root` is not a directory.
 */
export async function check(root: string, options: CheckOptions = {}): Promise<Report> {
  const ctx = new RepoContext(root);
  const isDirectory = await stat(ctx.root).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
  if (!isDirectory) throw new Error(`Not a directory: ${ctx.root}`);

  const ignore = new Set(options.ignore ?? []);
  const findings = await Promise.all(
    (options.rules ?? builtInRules).map(async (rule): Promise<Finding> => {
      const result = ignore.has(rule.id)
        ? skip('Ignored by configuration')
        : await rule
            .check(ctx)
            .catch((error: unknown) => fail(`Rule crashed: ${errorMessage(error)}`, 'This is a bug in the rule; please report it.'));
      return { ruleId: rule.id, severity: rule.severity, ...result };
    }),
  );

  const count = (status: Finding['status']) => findings.filter((finding) => finding.status === status).length;
  return {
    root: ctx.root,
    score: computeScore(findings),
    passed: !findings.some((finding) => finding.status === 'fail' && finding.severity === 'error'),
    summary: { pass: count('pass'), fail: count('fail'), skip: count('skip') },
    findings,
  };
}

import type { RepoContext } from './context.js';

/** `error` rules gate the exit code; `warning` rules only lower the score. */
export type Severity = 'error' | 'warning';

/** `skip` means the rule does not apply to this repository (e.g. no package.json). */
export type Status = 'pass' | 'fail' | 'skip';

export interface RuleResult {
  readonly status: Status;
  readonly message: string;
  /** A concrete next step a human or an agent can act on. Set on failures. */
  readonly fix?: string;
}

export interface Rule {
  /** Stable kebab-case identifier, used in output and docs anchors. */
  readonly id: string;
  /** One-line description of what the rule checks. */
  readonly title: string;
  readonly severity: Severity;
  /** Why this matters for coding agents. Rendered into docs/rules.md. */
  readonly rationale: string;
  check(ctx: RepoContext): Promise<RuleResult>;
}

export interface Finding extends RuleResult {
  readonly ruleId: string;
  readonly severity: Severity;
}

export interface Report {
  /** Absolute path of the checked repository. */
  readonly root: string;
  /** 0–100, weighted by severity. Skipped rules are excluded. */
  readonly score: number;
  /** False when any `error` rule failed. */
  readonly passed: boolean;
  readonly summary: {
    readonly pass: number;
    readonly fail: number;
    readonly skip: number;
  };
  readonly findings: readonly Finding[];
}

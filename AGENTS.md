# agentready

CLI and library that checks whether a repository is ready for AI coding agents. TypeScript, ESM, Node.js 22+, zero runtime dependencies.

## Commands

- Install: `npm ci`
- Type-check: `npm run typecheck`
- Lint: `npm run lint`
- Test: `npm test`
- Build: `npm run build`
- Regenerate docs/rules.md after changing any rule: `npm run build && npm run docs`
- Check this repo with its own CLI: `npm run build && npm run check:self`

## Layout

- `src/rules/` — one file per rule. Register new rules in `src/rules/index.ts`. Guide: `docs/adding-a-rule.md`.
- `src/context.ts` — `RepoContext`. All filesystem reads go through it; rules must not import `node:fs`.
- `src/check.ts` — runs rules and computes the score. `src/report.ts` — text, JSON and Markdown output.
- `src/run.ts` — CLI parsing and commands, with injected I/O. `src/cli.ts` is only the entry point.
- `src/agents.ts` — files that `init --agent` installs for Claude Code, Codex and Copilot CLI. Never overwrite existing files.
- `test/` — Vitest. Build fixture repos with `makeRepo()` from `test/helpers.ts`; they are deleted after each test.

## Conventions

- No runtime dependencies. Dev dependencies are fine.
- No `any`, no non-null assertions, no `as` casts on untrusted data. Parse JSON to `unknown` and narrow with `isRecord`.
- Every failing `RuleResult` has a `fix`: one concrete action, written for someone who only sees the CLI output.
- Every rule has tests for pass, fail and (if applicable) skip.
- `docs/rules.md` is generated. Do not edit it by hand; a test fails if it is stale.

## Before you finish

Run `npm run typecheck`, `npm run lint` and `npm test`, and make sure all pass.

export { check, computeScore, type CheckOptions } from './check.js';
export { RepoContext, type JsonFile } from './context.js';
export { renderAgentsMd } from './init.js';
export { formatJson, formatRulesMarkdown, formatText, type TextOptions } from './report.js';
export { rules } from './rules/index.js';
export { fail, pass, skip } from './rules/result.js';
export type { Finding, Report, Rule, RuleResult, Severity, Status } from './types.js';

import type { RuleResult } from '../types.js';

export function pass(message: string): RuleResult {
  return { status: 'pass', message };
}

export function fail(message: string, fix: string): RuleResult {
  return { status: 'fail', message, fix };
}

export function skip(message: string): RuleResult {
  return { status: 'skip', message };
}

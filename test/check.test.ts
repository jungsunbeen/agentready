import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { check, computeScore } from '../src/check.js';
import { formatText } from '../src/report.js';
import type { Finding, Rule } from '../src/types.js';
import { GOOD_REPO, makeRepo } from './helpers.js';

const finding = (status: Finding['status'], severity: Finding['severity']): Finding => ({
  ruleId: 'r',
  severity,
  status,
  message: '',
});

describe('computeScore', () => {
  it('weights errors three times as much as warnings', () => {
    expect(computeScore([finding('pass', 'error'), finding('fail', 'warning')])).toBe(75);
    expect(computeScore([finding('fail', 'error'), finding('pass', 'warning')])).toBe(25);
  });

  it('ignores skipped rules and scores 100 when nothing applies', () => {
    expect(computeScore([finding('pass', 'warning'), finding('skip', 'error')])).toBe(100);
    expect(computeScore([])).toBe(100);
  });
});

describe('check', () => {
  it('gives a well-prepared repository a perfect score', async () => {
    const report = await check(await makeRepo(GOOD_REPO));
    expect(report.findings.filter((f) => f.status !== 'pass')).toEqual([]);
    expect(report).toMatchObject({ score: 100, passed: true });
  });

  it('fails an empty directory and skips JavaScript-only rules', async () => {
    const report = await check(await makeRepo());
    expect(report.passed).toBe(false);
    expect(report.findings.find((f) => f.ruleId === 'package-scripts')?.status).toBe('skip');
  });

  it('passes with only warnings failing', async () => {
    const withoutCi = Object.fromEntries(Object.entries(GOOD_REPO).filter(([file]) => !file.startsWith('.github/')));
    const report = await check(await makeRepo(withoutCi));
    expect(report.passed).toBe(true);
    expect(report.score).toBeLessThan(100);
  });

  it('reports a crashing rule as a failure instead of throwing', async () => {
    const broken: Rule = {
      id: 'broken',
      title: 'Broken',
      severity: 'error',
      rationale: '',
      check: () => Promise.reject(new Error('boom')),
    };
    const report = await check(await makeRepo(), { rules: [broken] });
    expect(report.findings[0]).toMatchObject({ status: 'fail', message: 'Rule crashed: boom' });
  });

  it('rejects a path that is not a directory', async () => {
    const root = await makeRepo({ 'file.txt': '' });
    await expect(check(path.join(root, 'file.txt'))).rejects.toThrow('Not a directory');
  });
});

describe('formatText', () => {
  it('shows each finding, a fix for failures, and the score', async () => {
    const text = formatText(await check(await makeRepo()), { color: false });
    expect(text).toContain('✖ agent-instructions');
    expect(text).toContain('→ Run `agentready init`');
    expect(text).toMatch(/Score \d+\/100/);
    expect(text).not.toContain('\u001b[');
  });
});

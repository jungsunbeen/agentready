import type { Rule } from '../types.js';
import { fail, pass } from './result.js';

const OTHER_CI_FILES = ['.gitlab-ci.yml', '.circleci/config.yml', 'azure-pipelines.yml', 'bitbucket-pipelines.yml'];

export const ciWorkflow: Rule = {
  id: 'ci-workflow',
  title: 'CI runs on changes',
  severity: 'warning',
  rationale:
    'Agent-written changes should be verified the same way as human ones. CI is the backstop when an ' +
    'agent skips a step or a local environment differs.',
  async check(ctx) {
    const workflows = (await ctx.list('.github/workflows')).filter((name) => /\.ya?ml$/.test(name));
    if (workflows.length > 0) return pass(`Found GitHub Actions workflow: ${workflows.join(', ')}.`);
    for (const file of OTHER_CI_FILES) {
      if (await ctx.exists(file)) return pass(`Found ${file}.`);
    }
    return fail('No CI configuration found.', 'Add a workflow that runs lint and test on every pull request.');
  },
};

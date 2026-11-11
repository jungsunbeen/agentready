import { readPackageJson } from '../package-json.js';
import type { Rule } from '../types.js';
import { fail, pass, skip } from './result.js';

export const REQUIRED_SCRIPTS = ['lint', 'test'] as const;

/** The `test` script `npm init` writes, which always fails. */
const NPM_PLACEHOLDER_TEST = /no test specified/i;

export const packageScripts: Rule = {
  id: 'package-scripts',
  title: 'package.json defines real lint and test scripts',
  severity: 'error',
  rationale:
    'Agents verify their own changes by running scripts. Without `lint` and `test` they either guess ' +
    'commands or skip verification. The npm placeholder test script counts as missing.',
  async check(ctx) {
    const file = await readPackageJson(ctx);
    if (file.kind === 'missing') return skip('No package.json; not a JavaScript project.');
    if (file.kind === 'invalid') {
      return fail(`package.json is invalid: ${file.error}.`, 'Fix package.json so tools and agents can read it.');
    }

    const { scripts } = file.pkg;
    const problems: string[] = [];
    const missing = REQUIRED_SCRIPTS.filter((name) => !scripts.has(name));
    if (missing.length > 0) problems.push(`missing ${missing.join(', ')}`);
    const test = scripts.get('test');
    if (test !== undefined && NPM_PLACEHOLDER_TEST.test(test)) problems.push('"test" is the npm placeholder');

    if (problems.length > 0) {
      return fail(
        `package.json scripts: ${problems.join('; ')}.`,
        `Add working ${REQUIRED_SCRIPTS.map((name) => `"${name}"`).join(' and ')} scripts.`,
      );
    }
    return pass(`Has ${REQUIRED_SCRIPTS.join(' and ')} scripts.`);
  },
};

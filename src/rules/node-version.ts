import { readPackageJson } from '../package-json.js';
import type { Rule } from '../types.js';
import { fail, pass, skip } from './result.js';

const VERSION_FILES = ['.nvmrc', '.node-version'];

export const nodeVersion: Rule = {
  id: 'node-version',
  title: 'The required Node.js version is declared',
  severity: 'warning',
  rationale:
    'Agents run in whatever environment they are given. A declared Node.js version turns ' +
    '"works on my machine" failures into an explicit, fixable mismatch.',
  async check(ctx) {
    const file = await readPackageJson(ctx);
    if (file.kind !== 'ok') return skip('No readable package.json.');

    const engine = file.pkg.engines.get('node');
    if (engine !== undefined) return pass(`engines.node is "${engine}".`);
    for (const versionFile of VERSION_FILES) {
      if (await ctx.exists(versionFile)) return pass(`Found ${versionFile}.`);
    }
    const toolVersions = await ctx.readText('.tool-versions');
    if (toolVersions !== undefined && /^nodejs\s/m.test(toolVersions)) return pass('Found nodejs in .tool-versions.');

    return fail('No Node.js version declared.', 'Add "engines": { "node": ">=22" } to package.json, or an .nvmrc file.');
  },
};

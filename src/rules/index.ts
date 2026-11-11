import type { Rule } from '../types.js';
import { agentCommands } from './agent-commands.js';
import { agentInstructions } from './agent-instructions.js';
import { ciWorkflow } from './ci.js';
import { singleLockfile } from './lockfile.js';
import { nodeVersion } from './node-version.js';
import { packageScripts } from './package-scripts.js';
import { readme } from './readme.js';
import { typescriptStrict } from './typescript-strict.js';

/** All built-in rules, in report order: errors first, then warnings. */
export const rules: readonly Rule[] = [
  agentInstructions,
  agentCommands,
  readme,
  packageScripts,
  typescriptStrict,
  ciWorkflow,
  singleLockfile,
  nodeVersion,
];

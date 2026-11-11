#!/usr/bin/env node
import { run } from './run.js';

process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  color: process.stdout.isTTY && process.env.NO_COLOR === undefined,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});

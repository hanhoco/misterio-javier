/**
 * Test runner. The project ships as ESM, but the tests are compiled to
 * CommonJS so that the source files can keep extensionless imports (which is
 * what Vite expects). Dropping a `package.json` with `"type": "commonjs"` into
 * the build output is what tells Node how to read those emitted `.js` files.
 *
 * No test framework, no extra dependencies: tsc plus `node --test`.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(projectRoot, 'dist-test');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: projectRoot, stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.test.json']);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));

const testDir = join(outDir, 'test');
const testFiles = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => join(testDir, name));

if (testFiles.length === 0) {
  console.error('No compiled test files found in', testDir);
  process.exit(1);
}

run(process.execPath, ['--test', ...testFiles]);

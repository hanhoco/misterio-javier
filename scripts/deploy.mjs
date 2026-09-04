/**
 * Publish the site to GitHub Pages, in the one order that produces an honest
 * build stamp.
 *
 * Written because doing it by hand went wrong twice. Once the build ran before
 * the commit, so the page shipped stamped with the previous SHA and a "+dirty"
 * suffix. Once `git --work-tree=dist commit` was run while sitting on `master`,
 * which committed the built site over the source tree and left the branch
 * pointing at a deploy. Both were recoverable and neither should be possible
 * again, so the sequence lives here instead of in someone's shell history.
 *
 *   1. refuse to publish a dirty tree  - the stamp would lie
 *   2. tests, then the Pages build     - never ship red
 *   3. push the source branch          - so the stamped SHA is reachable
 *   4. publish dist/ from its own throwaway repository, never from this one
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REMOTE = 'git@github.com:hanhoco/misterio-javier.git';
const SITE = 'https://hanhoco.github.io/misterio-javier/';

const root = process.cwd();
const dist = join(root, 'dist');

const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

const step = (message) => console.log(`\n== ${message}`);

step('1/5  Checking the working tree');
const dirty = run('git', ['status', '--porcelain']);
if (dirty) {
  console.error(
    '\nThe working tree has uncommitted changes, so the build would be stamped\n' +
      '"+dirty" and nobody could tell which code the classroom is running.\n' +
      'Commit first, then deploy.\n\n' +
      dirty,
  );
  process.exit(1);
}
const sha = run('git', ['rev-parse', '--short', 'HEAD']);
console.log(`   clean at ${sha}`);

step('2/5  Running the tests');
run('npm', ['test']);
console.log('   green');

step('3/5  Building for Pages');
run('npm', ['run', 'build:pages']);
if (!existsSync(dist)) throw new Error('dist/ is missing after the build');
writeFileSync(join(dist, '.nojekyll'), '');
console.log('   built');

step('4/5  Pushing the source branch');
run('git', ['push', 'origin', 'HEAD']);
console.log('   pushed');

step('5/5  Publishing dist/ to gh-pages');
// Its own repository, so a mistake here can never touch the source history.
rmSync(join(dist, '.git'), { recursive: true, force: true });
run('git', ['init', '-q'], dist);
run('git', ['add', '-A'], dist);
run(
  'git',
  ['-c', 'user.email=deploy@local', '-c', 'user.name=deploy', 'commit', '-q', '-m', `deploy ${sha}`],
  dist,
);
run('git', ['push', '-q', '-f', REMOTE, 'HEAD:gh-pages'], dist);
rmSync(join(dist, '.git'), { recursive: true, force: true });

console.log(`\nPublished ${sha}   ${SITE}`);
console.log('GitHub Pages takes a minute or two. Then force reload with Ctrl + Shift + R.\n');

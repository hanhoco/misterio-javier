import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/**
 * GitHub Pages serves the site from `https://<user>.github.io/<repo>/`, not from
 * the root of the domain, so every asset URL needs that prefix baked in at build
 * time. Without it the page loads and then renders blank, because the bundle and
 * the poster are requested from `/assets/...` and answered with 404s.
 *
 * Kept as an env override rather than a hardcoded string so `npm run dev` still
 * serves from `/` and a rename of the repository is a one-variable change.
 */
const base = process.env.PUBLIC_BASE ?? '/';

/**
 * The build's identity, stamped in so a running page can say which code it is.
 *
 * A tab opened before a deploy keeps serving its old bundle for as long as it
 * stays open, and a classroom of twenty-five machines opened at twenty-five
 * different moments runs twenty-five different versions of the game. That cost
 * us most of a day: failures were blamed on the decoder while the screen was
 * running code from three deploys earlier. Now the page prints its commit and
 * build time to the console and shows them in the footer, so "which version is
 * this?" is answered by looking instead of guessing.
 */
function describeBuild(): { commit: string; builtAt: string } {
  // `scripts/deploy.mjs` has already refused to run on a dirty tree, so when it
  // hands the SHA down we trust it rather than re-deriving one here. Deriving it
  // twice produced a `+dirty` stamp on a tree that `git status` reported clean
  // moments later, and a version stamp nobody can trust is worse than none.
  const given = process.env.BUILD_COMMIT;
  if (given) return { commit: given, builtAt: new Date().toISOString() };

  let commit = 'unknown';
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
    commit = dirty ? `${sha}+dirty` : sha;
  } catch {
    // Building outside a git checkout is fine; the page just says "unknown".
  }
  return { commit, builtAt: new Date().toISOString() };
}

const build = describeBuild();

export default defineConfig({
  base,
  define: {
    __BUILD_COMMIT__: JSON.stringify(build.commit),
    __BUILD_TIME__: JSON.stringify(build.builtAt),
  },
  server: {
    port: 5300,
    strictPort: true,
  },
  preview: {
    port: 5300,
    strictPort: true,
  },
});

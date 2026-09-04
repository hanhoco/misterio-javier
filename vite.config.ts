import { defineConfig } from 'vite';

/**
 * Port 5300 rather than Vite's default 5173: that one is already taken by
 * another project on this machine, and a silently reassigned port makes the
 * "open this URL" step unreliable. `strictPort` turns a collision into a loud
 * failure instead of a quiet move to 5301.
 */
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

export default defineConfig({
  base,
  server: {
    port: 5300,
    strictPort: true,
  },
  preview: {
    port: 5300,
    strictPort: true,
  },
});

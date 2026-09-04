import { defineConfig } from 'vite';

/**
 * Port 5300 rather than Vite's default 5173: that one is already taken by
 * another project on this machine, and a silently reassigned port makes the
 * "open this URL" step unreliable. `strictPort` turns a collision into a loud
 * failure instead of a quiet move to 5301.
 */
export default defineConfig({
  server: {
    port: 5300,
    strictPort: true,
  },
  preview: {
    port: 5300,
    strictPort: true,
  },
});

/**
 * Which build is this page actually running?
 *
 * A browser tab that was opened before a deploy keeps its old bundle for as
 * long as it stays open - GitHub Pages sends `cache-control: max-age=600` on the
 * HTML, but an open tab never re-requests it at all. In a classroom where
 * twenty-five machines were opened at twenty-five different moments, that means
 * twenty-five different versions of the game running side by side, and failures
 * that look like they come and go at random.
 *
 * The values are injected by `vite.config.ts` at build time.
 */

declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

export const BUILD_COMMIT: string = __BUILD_COMMIT__;
export const BUILD_TIME: string = __BUILD_TIME__;

/**
 * Short, human readable, safe to show a teacher over a child's shoulder.
 *
 * The time is rendered in the machine's OWN timezone, not UTC. The person
 * reading it is standing in a classroom comparing it against "I deployed that
 * a few minutes ago", and a UTC stamp makes them do arithmetic before they can
 * answer the only question that matters: is this screen running old code?
 *
 * `BUILD_TIME` is stored as UTC ISO, so the conversion happens here, per
 * viewer, and a machine with a wrong clock shows its own wrong time - which is
 * itself worth knowing.
 */
export function buildLabel(): string {
  const when = new Date(BUILD_TIME);
  if (Number.isNaN(when.getTime())) return `${BUILD_COMMIT} · ${BUILD_TIME}`;

  const pad = (value: number): string => String(value).padStart(2, '0');
  const stamp =
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ` +
    `${pad(when.getHours())}:${pad(when.getMinutes())}`;
  return `${BUILD_COMMIT} · ${stamp}`;
}

/**
 * Announce the build on the console, loudly enough to find without scrolling.
 *
 * Called once at startup. The teacher opens the console on any machine that is
 * behaving oddly and reads the line, instead of us inferring the version from
 * which mission happens to be first.
 */
export function announceBuild(): void {
  const banner = `%c The Mystery of Javier %c ${buildLabel()} `;
  const left = 'background:#1A2744;color:#fff;font-weight:700;border-radius:3px 0 0 3px';
  const right = 'background:#EE4B85;color:#fff;border-radius:0 3px 3px 0';
  console.log(banner, left, right);
  console.log(
    'If this build is older than the one your teacher deployed, press Ctrl + Shift + R.',
  );
}

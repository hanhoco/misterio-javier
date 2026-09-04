/**
 * The viewer's scale arithmetic, with no DOM anywhere in it.
 *
 * `PosterViewer` owns a canvas, listeners and a container, none of which exist
 * in plain Node - and the one thing the tests most need to reason about is the
 * scale a child actually lands on when a poster is fitted to a school laptop.
 * So the arithmetic lives here and the viewer calls it.
 */

/** Never let a poster shrink past this, however small the container. */
export const MIN_SCALE = 0.15;

/** ...nor blow up past this, however hard the wheel is spun. */
export const MAX_SCALE = 8;

/** How much one notch of the wheel changes the scale. */
export const WHEEL_ZOOM_STEP = 1.0015;

/**
 * How much one press of the + button changes the scale.
 *
 * 1.7, not the 1.35 this started at. From a whole-poster fit around 0.4x, a
 * 1.35 step needs five presses to reach 1:1 and a child gives up somewhere
 * around three; 1.7 gets there in two. The wheel keeps its own much finer step
 * because a wheel produces dozens of events per gesture.
 */
export const BUTTON_ZOOM_STEP = 1.7;

/**
 * The scale that puts the whole poster inside a viewport of this size.
 *
 * Exported separately from `PosterViewer.fitToView` because it is the number
 * the whole zoom-readiness contract hangs off: it is where a child STARTS, and
 * `test/parkPoster.test.ts` walks up from it in `BUTTON_ZOOM_STEP` presses to
 * prove the child is never told they found the wrong object simply because the
 * poster was too far away to read.
 */
export function computeFitScale(
  viewportWidth: number,
  viewportHeight: number,
  posterWidth: number,
  posterHeight: number,
): number {
  if (viewportWidth <= 0 || viewportHeight <= 0) return 0;
  if (posterWidth <= 0 || posterHeight <= 0) return 0;
  return Math.min(viewportWidth / posterWidth, viewportHeight / posterHeight);
}

/** `computeFitScale`, clamped to what the viewer will actually accept. */
export function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

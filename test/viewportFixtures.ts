/**
 * The machines the classroom failure was reproduced on, as numbers.
 *
 * Nothing here is CSS arithmetic redone by hand. Every field was read out of
 * headless Chrome on the mission screen of the built application: the canvas
 * box with `getBoundingClientRect()`, and `openingScale` off the viewer itself
 * after the layout had settled. They are here so the zoom tests can ask the one
 * question that matters - "what happens to a child who crops at the zoom the
 * game opened at, on the machine they are actually sitting at?" - without a DOM.
 *
 * `openingScale` is recorded rather than recomputed from the canvas box, and
 * the difference is real: the viewer fits once, on the first resize that gives
 * its container a size, and the page keeps settling for a few frames after
 * that. So the poster opens slightly larger than a fit against the final box
 * would give. `zoomReadiness.test.ts` pins the two together loosely enough to
 * survive that and tightly enough to catch a genuine drift.
 *
 * These numbers will move as the chrome around the poster changes, and that is
 * fine. Every test that uses them either asserts a property that holds across
 * the whole zoom range, or asserts something (the opening view is below the
 * readable floor) that only gets MORE true as the stage gets smaller.
 */

import { PARK_POSTER_HEIGHT, PARK_POSTER_WIDTH } from '../src/poster/parkPosterData';
import { clampScale, computeFitScale } from '../src/viewer/viewerGeometry';
import { effectiveCropScale } from '../src/viewer/zoomReadiness';

export interface StageBox {
  /** The browser window this was measured in, for the record. */
  viewport: string;
  /** Measured `.poster-viewer__canvas` box, in CSS pixels. */
  canvasWidth: number;
  canvasHeight: number;
  /** Measured `viewer.getScale()` on arrival at mission 1. */
  openingScale: number;
  /**
   * The screen's device pixel ratio.
   *
   * Part of the fixture and not an afterthought: it is half of the scale that
   * decides whether a crop can be read, and the reason the game "worked on one
   * computer and failed on the other twenty-eight". See `effectiveCropScale`.
   */
  devicePixelRatio: number;
}

/**
 * The 1366x768 school laptop at Windows 100% scaling.
 *
 * This is the machine twenty-eight children are sitting at, and the case that
 * has to work.
 */
export const PARK_LAPTOP_STAGE: StageBox = {
  viewport: '1366x768',
  canvasWidth: 1024,
  canvasHeight: 388.56,
  openingScale: 0.2297,
  devicePixelRatio: 1,
};

/**
 * The same laptop with Windows display scaling at 150%.
 *
 * Identical hardware, identical window, identical CSS zoom - and a different
 * answer to "can this child crop yet?", over a setting nobody thinks to check.
 */
export const PARK_LAPTOP_SCALED_STAGE: StageBox = {
  ...PARK_LAPTOP_STAGE,
  viewport: '1366x768 @150%',
  devicePixelRatio: 1.5,
};

/** A roomier window, where the poster opens noticeably larger. */
export const PARK_DESKTOP_STAGE: StageBox = {
  viewport: '1600x1100',
  canvasWidth: 1250,
  canvasHeight: 681.2,
  openingScale: 0.3766,
  devicePixelRatio: 1,
};

/**
 * The teacher's Retina Mac: the one machine the game appeared to work on.
 *
 * Same window and same CSS zoom as `PARK_DESKTOP_STAGE`. Only the panel differs,
 * and that alone is the difference between a class that can play and one that
 * cannot.
 */
export const PARK_RETINA_STAGE: StageBox = {
  ...PARK_DESKTOP_STAGE,
  viewport: '1600x1100 Retina',
  devicePixelRatio: 2,
};

/** Every machine measured, for tests that should hold on all of them. */
export const MEASURED_STAGES: readonly StageBox[] = [
  PARK_LAPTOP_STAGE,
  PARK_LAPTOP_SCALED_STAGE,
  PARK_DESKTOP_STAGE,
  PARK_RETINA_STAGE,
];

/** The device pixel ratios Windows display scaling actually produces. */
export const WINDOWS_PIXEL_RATIOS = [1, 1.25, 1.5, 2] as const;

/** What the child's screenshot carries at the opening view. */
export function openingEffectiveScaleFor(stage: StageBox): number {
  return effectiveCropScale(stage.openingScale, stage.devicePixelRatio);
}

/** What `fitToView` would compute against the settled canvas box. */
export function computedFitFor(stage: StageBox): number {
  return clampScale(
    computeFitScale(
      stage.canvasWidth,
      stage.canvasHeight,
      PARK_POSTER_WIDTH,
      PARK_POSTER_HEIGHT,
    ),
  );
}

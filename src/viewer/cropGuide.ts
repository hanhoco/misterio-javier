/**
 * The crop guide - the "croquis" a child traces with the snipping tool.
 *
 * WHY THIS EXISTS. The zoom readiness light works: measured over CDP at DPR 1,
 * a 1366x768 school laptop opens the park poster at 0.26x and reaches green in
 * two presses of "+", a 1920x1080 desktop at 0.39x in one. And children still
 * failed, because reaching green answers "may I crop yet?" and never answers
 * "crop WHAT, and how big?". They cropped too wide, too tight, or off-centre.
 * The teacher asked for an outline to trace, and this is the geometry of it.
 *
 * WHY IT IS THE PRECISE BOX AND NOT THE BOUNDING BOX. A guide drawn on the
 * target's bare bounding box would teach a child to crop tighter than the game
 * ever asks for, and - worse - a guide drawn at some hand-picked margin would
 * drift the first time `PRECISE_AREA_RATIO` moved. So the margin is SOLVED for,
 * from `PRECISE_AREA_RATIO` itself: a child who traces this rectangle does not
 * merely pass, they earn the precision bonus. That is what makes the guide
 * teach good cropping instead of rescuing a bad attempt.
 *
 * Nothing here touches the DOM or a canvas. The drawing lives in
 * `src/ui/cropGuideOverlay.ts`; this file is importable from plain Node so the
 * "does the guide actually score PRECISE?" test can run against the real
 * poster.
 */

import { RESERVED_HUES, RESERVED_HUE_TOLERANCE, hueDistance } from '../poster/seal';
import type { PosterTarget } from '../poster/posterData';
import { PRECISE_AREA_RATIO } from '../validation/verdict';
import { isReadyToCrop } from './zoomReadiness';

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

/** A rectangle, in whatever space the caller is working in. */
export interface GuideRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The viewer's transform, as `PosterViewer` hands it to an overlay renderer. */
export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** A viewport, in CSS pixels. */
export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * How much of the precision budget the guide actually spends.
 *
 * Not decoration and not timidity. A guide drawn at exactly
 * `PRECISE_AREA_RATIO` would put the child on the boundary, where every source
 * of slack works against them at once: the snipping tool rounds to whole device
 * pixels, a seven year old dragging a rectangle overshoots by a few, and the
 * guide is drawn with a stroke that has width - so tracing "the outside of the
 * line" is already a slightly larger crop than the maths assumed. Spending 85%
 * of the budget leaves room for all three and still teaches a genuinely tight
 * crop, because the remaining 15% is invisible to a child and decisive to the
 * grader.
 */
export const GUIDE_PRECISION_HEADROOM = 0.85;

/** The widest the guide is ever allowed to be, as a multiple of the target's area. */
export const GUIDE_AREA_CEILING = PRECISE_AREA_RATIO * GUIDE_PRECISION_HEADROOM;

/**
 * The margin the guide actually draws: a fraction of the object's SHORT side.
 *
 * The first version spent the whole precision budget, which is 3.4x the area -
 * about 1.8x the width and height. On the school building that drew a rectangle
 * wide enough to swallow the poster's title banner and a stretch of empty sky,
 * and a teacher rightly said the frame covered two things at once.
 *
 * The budget is a ceiling, not a target. A guide teaches "crop THIS", so it has
 * to hug the object; the leftover budget is slack the child is allowed to spend
 * by hand, not slack the guide should spend for them. A tenth of the short side
 * lands around 1.2-1.5x the area: unmistakably snug, and still far enough
 * inside the precise band that an overshooting seven year old stays there.
 */
export const GUIDE_MARGIN_FRACTION = 0.1;

/** Floor and ceiling in poster pixels, so tiny and huge targets both behave. */
export const GUIDE_MARGIN_MIN_PX = 8;
export const GUIDE_MARGIN_MAX_PX = 48;

/**
 * The margin, in poster pixels, that grows a `width` x `height` box to exactly
 * `ratio` times its own area on every side at once.
 *
 * Solving `(w + 2m)(h + 2m) = ratio * w * h` for m:
 *
 *     4m^2 + 2(w + h)m + wh(1 - ratio) = 0
 *     m = (-(w + h) + sqrt((w + h)^2 + 4wh(ratio - 1))) / 4
 *
 * A ratio at or below 1 asks for no margin at all, which is the honest answer
 * rather than an imaginary one.
 */
export function preciseCropMargin(
  width: number,
  height: number,
  ratio: number = GUIDE_AREA_CEILING,
): number {
  if (!(width > 0) || !(height > 0) || ratio <= 1) return 0;
  const sum = width + height;
  return (Math.sqrt(sum * sum + 4 * width * height * (ratio - 1)) - sum) / 4;
}

/**
 * The margin the guide draws: a snug fraction of the short side, never wider
 * than the precision budget allows.
 */
export function guideMargin(
  width: number,
  height: number,
  ratio: number = GUIDE_AREA_CEILING,
): number {
  if (!(width > 0) || !(height > 0)) return 0;
  const snug = Math.min(
    GUIDE_MARGIN_MAX_PX,
    Math.max(GUIDE_MARGIN_MIN_PX, Math.min(width, height) * GUIDE_MARGIN_FRACTION),
  );
  // The ceiling still wins, so a very small target cannot be handed a margin
  // that pushes its own crop out of the precise band.
  return Math.min(snug, preciseCropMargin(width, height, ratio));
}

/**
 * The rectangle to draw: the target's box plus a snug margin on all four sides.
 *
 * Deliberately NOT clamped to the poster's edges. Two of the fifteen park
 * targets sit close enough to a border that a clamp would silently shrink the
 * guide, and a guide whose size depends on where the object happens to sit is a
 * guide that teaches something different in different missions. The viewer
 * draws the few pixels that fall past the artwork over its own background,
 * which costs nothing: `computeAreaRatio` measures the crop, not the poster.
 */
export function preciseCropBox(
  target: Pick<PosterTarget, 'x' | 'y' | 'width' | 'height'>,
  ratio: number = GUIDE_AREA_CEILING,
): GuideRect {
  const margin = guideMargin(target.width, target.height, ratio);
  return {
    x: target.x - margin,
    y: target.y - margin,
    width: target.width + margin * 2,
    height: target.height + margin * 2,
  };
}

/** A poster-space rectangle in CSS pixels inside the viewer canvas. */
export function toScreenRect(box: GuideRect, view: ViewTransform): GuideRect {
  return {
    x: box.x * view.scale + view.offsetX,
    y: box.y * view.scale + view.offsetY,
    width: box.width * view.scale,
    height: box.height * view.scale,
  };
}

/** True when the whole rectangle is inside the viewport. */
export function isRectInsideViewport(rect: GuideRect, viewport: ViewportSize): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= viewport.width &&
    rect.y + rect.height <= viewport.height
  );
}

/* -------------------------------------------------------------------------- */
/* When the guide is allowed on screen                                        */
/* -------------------------------------------------------------------------- */

export interface CropGuideVisibilityInput {
  /** Guided mode. Off is detective mode, and the guide never shows. */
  guidedMode: boolean;
  /** True while the window has lost focus, i.e. the snipping overlay is up. */
  hiddenForSnip: boolean;
  /** CSS scale times device pixel ratio. See `zoomReadiness.ts`. */
  effectiveScale: number;
  /** The TARGET's own box, in CSS pixels inside the viewer canvas. */
  targetRect: GuideRect;
  /** The viewer canvas, in CSS pixels. */
  viewport: ViewportSize;
}

/**
 * Whether to draw the guide right now.
 *
 * THE ORDERING HERE IS THE GAME. The guide appears only once the child has
 * already found the object (its box is on screen) AND already zoomed in on it
 * (the light is green). It therefore never says WHERE anything is - only HOW to
 * crop what the child has already found. Loosen either condition and the
 * detective game becomes a game of waiting for a rectangle to appear.
 *
 * The visibility test is against the TARGET's box, not the guide's. The guide
 * is deliberately larger, and requiring all of it on screen would make the
 * guide blink out exactly when a child zooms in far enough to want it.
 */
export function isCropGuideVisible(input: CropGuideVisibilityInput): boolean {
  if (!input.guidedMode) return false;
  if (input.hiddenForSnip) return false;
  if (!isReadyToCrop(input.effectiveScale)) return false;
  return isRectInsideViewport(input.targetRect, input.viewport);
}

/* -------------------------------------------------------------------------- */
/* Palette                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The guide's colours.
 *
 * Two constraints, and the second one is the load-bearing one.
 *
 * It must read over both dark and light artwork, because the park poster has
 * bright sky at the top and dark foliage in the middle. So the outline is a
 * solid dark rail with light dashes marching along it: whichever way the
 * artwork goes, one of the two stands out against it.
 *
 * And it must stay out of every reserved seal hue. The guide is hidden on blur
 * and so should never reach a screenshot at all - but "should never" is exactly
 * the kind of promise that a future refactor breaks quietly, and a saturated
 * cyan rectangle that DID land in a crop would feed the decoder a wall of
 * false blobs. Near-black navy sits at hue ~220, thirty-four degrees clear of
 * the nearest band (cyan, 186 +/- 15); white and the grey scrim carry no
 * saturation at all, so the decoder discards them before hue is even consulted.
 * `test/cropGuide.test.ts` checks all of them against `RESERVED_HUES`.
 */
export const CROP_GUIDE_COLORS = {
  /** The continuous dark line the dashes march along. */
  rail: '#101828',
  /** The marching dashes themselves. */
  dash: '#FFFFFF',
  labelBackground: '#101828',
  labelText: '#FFFFFF',
} as const;

/** Every guide colour, for the palette-safety test. */
export const CROP_GUIDE_HEX_COLORS: readonly string[] = Object.values(CROP_GUIDE_COLORS);

/** True when a hue could be mistaken for a seal dot. */
export function isReservedGuideHue(hue: number): boolean {
  return RESERVED_HUES.some((reserved) => hueDistance(hue, reserved) <= RESERVED_HUE_TOLERANCE);
}

/** `#RRGGBB` to its three channels. Small enough to keep beside the palette. */
export function guideColorChannels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                       */
/* -------------------------------------------------------------------------- */

/** What the guide says. English, short enough to fit above a small box. */
export const CROP_GUIDE_LABEL = '✂ Crop this box';

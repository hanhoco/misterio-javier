/**
 * Can the child's crop possibly be read at the zoom they are looking at?
 *
 * This module exists because of a bug that reached a classroom. The seals were
 * shrunk so seventy-five of them would stop defacing the illustration, which
 * raised the zoom at which a crop first becomes readable - and nobody checked
 * that number against the zoom the viewer OPENS at. On a 1366x768 school laptop
 * the park poster fits at about 0.26x, and at 0.26x not one of the fifteen
 * targets could be decoded. Children searched correctly, cropped correctly, and
 * were told "That is not the clue".
 *
 * Two things follow from that, and both live here so they can never drift apart
 * again:
 *
 * 1. The child is told, live, BEFORE they spend a crop, whether the poster is
 *    close enough. See `posterStage.ts`.
 * 2. Below the threshold the only honest verdict is "zoom in a bit more",
 *    whatever the decoder returned. See `verdict.ts`.
 *
 * And the scale both of those are measured in is NOT the viewer's CSS scale.
 * See `effectiveCropScale` - that distinction is the second half of the same
 * classroom report, and the half that made the failure look like witchcraft.
 *
 * Nothing here touches the DOM.
 */

import { SEAL_DOT_RADIUS } from '../poster/seal';
import { MIN_READABLE_DOT_RADIUS_PX } from '../validation/sealDecoder';

/**
 * The bare floor: below this viewer scale a seal's core is physically thinner
 * than the decoder's `MIN_READABLE_DOT_RADIUS_PX` and no crop can decode.
 *
 * DERIVED, never typed out. The two numbers it is built from live one in the
 * seal geometry and one in the decoder, and the whole classroom failure was a
 * change to the first that nobody propagated. A literal here would let that
 * happen again silently.
 */
export const READABLE_FLOOR_SCALE = MIN_READABLE_DOT_RADIUS_PX / SEAL_DOT_RADIUS;

/**
 * How far above the bare floor "ready" starts.
 *
 * At exactly the floor the core is 3.0px in theory and rather less than that in
 * practice, once the antialiased rim is eaten by the saturation cut: measured
 * on the real park poster, 0.60x decodes 3 of 15 targets and 0.62x decodes all
 * 15. Promising a child "Ready!" and then failing them is worse than asking
 * for one more press of "+", so the green light waits for headroom.
 */
export const READINESS_SAFETY_MARGIN = 1.1;

/**
 * At or above this viewer scale the child is told they can crop.
 *
 * `test/parkPoster.test.ts` pins this against the real poster: every target
 * decodes at or above it, and the first fully decodable scale sits below it.
 */
export const READY_TO_CROP_SCALE = READABLE_FLOOR_SCALE * READINESS_SAFETY_MARGIN;

/**
 * The scale the DECODER will see, which is not the scale the viewer reports.
 *
 * This is the other half of the classroom report, and it is the half that made
 * the failure look like magic: the game "worked on one computer and failed on
 * the other twenty-eight". There is no server and no shared state - the app is
 * static files - so twenty-eight children are twenty-eight independent copies
 * and none of them can affect another. What differed was the screen.
 *
 * `Win + Shift + S` photographs DEVICE pixels. The viewer draws the poster into
 * a backing store scaled by `devicePixelRatio`, so one poster-native pixel
 * occupies `viewerScale * devicePixelRatio` pixels in the child's screenshot,
 * and that product - not the CSS scale on the zoom label - is what decides
 * whether a seal core clears `MIN_READABLE_DOT_RADIUS_PX`.
 *
 *   Teacher's Retina Mac:   fit 0.40x, DPR 2   -> 0.80x effective, 15/15 found
 *   School laptop 1366x768: fit 0.26x, DPR 1   -> 0.26x effective, 0/15 found
 *
 * It was never "whoever opened it first". It was "whoever had a Retina screen",
 * and that was the teacher demonstrating. Windows display scaling does the same
 * thing more quietly: 125% or 150% reports 1.25 or 1.5, so two identical
 * laptops can behave differently over a setting nobody thinks to check.
 *
 * A readiness light computed from the CSS scale alone would show a green
 * "Ready to crop!" on a machine where the crop cannot possibly be read.
 * That is worse than no light at all, because by then the child trusts it.
 */
export function effectiveCropScale(viewerScale: number, devicePixelRatio: number): number {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return viewerScale * ratio;
}

export type ZoomReadiness = 'too-far' | 'ready';

/**
 * Where the child stands against the threshold.
 *
 * Takes the EFFECTIVE scale - `effectiveCropScale(viewerScale, dpr)` - never
 * the viewer's CSS scale on its own.
 */
export function zoomReadiness(effectiveScale: number): ZoomReadiness {
  return effectiveScale >= READY_TO_CROP_SCALE ? 'ready' : 'too-far';
}

/**
 * True when a crop taken right now stands a chance of being read.
 *
 * Takes the EFFECTIVE scale. See `effectiveCropScale`.
 */
export function isReadyToCrop(effectiveScale: number): boolean {
  return zoomReadiness(effectiveScale) === 'ready';
}

export interface ZoomReadinessCopy {
  /** The traffic light itself. */
  badge: string;
  /** The verdict, in three or four words. */
  label: string;
  /** What to do about it, when there is something to do. */
  hint: string;
}

/**
 * Plain English, for a child of seven to nine.
 *
 * Never blaming: "too far" is a fact about the picture, not about the child.
 */
export const ZOOM_READINESS_COPY: Record<ZoomReadiness, ZoomReadinessCopy> = {
  'too-far': {
    badge: '🔴',
    label: 'Too far to crop',
    hint: 'Zoom in a bit with the + button',
  },
  ready: {
    badge: '🟢',
    label: 'Ready to crop!',
    hint: 'Now use Windows + Shift + S',
  },
};

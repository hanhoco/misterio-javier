/**
 * Turns a decode result into something a seven year old can act on.
 *
 * Every `message` is plain English, warm and neutral, because it is shown
 * directly to the child.
 */

import type { PosterTarget } from '../poster/posterData';
import { findObjectBySealCode } from '../poster/posterData';
import { isReadyToCrop } from '../viewer/zoomReadiness';
import type { DecodeResult, SealMeasurement } from './sealDecoder';

/**
 * How a caller turns a decoded code back into the object that carries it.
 *
 * A parameter rather than a hard-wired import, because the app can be showing
 * either poster and each has its own catalogue. Defaults to the procedural
 * poster's, which is what every existing caller already meant.
 */
export type TargetLookup = (code: number) => PosterTarget | undefined;

export type VerdictKind =
  | 'PRECISE'
  | 'LOOSE'
  | 'TOO_WIDE'
  | 'WRONG_OBJECT'
  | 'AMBIGUOUS'
  | 'NO_SEAL'
  | 'TOO_SMALL';

export interface Verdict {
  kind: VerdictKind;
  /** User facing text. */
  message: string;
  /** True when the child captured the requested object. */
  success: boolean;
  code?: number;
  scale?: number;
  areaRatio?: number;
  /** Name of the object the child actually captured, when it was a wrong one. */
  capturedObjectName?: string;
}

/** A crop no bigger than 4x the target's area counts as a precise capture. */
export const PRECISE_AREA_RATIO = 4;
/** Up to 25x still counts as found, but the child is nudged to crop closer. */
export const LOOSE_AREA_RATIO = 25;

/**
 * How much of the poster the screenshot actually covers, expressed as a
 * multiple of the target object's area. `scale` is screen pixels per
 * poster-native pixel, so dividing the crop size by it converts back to
 * poster-native units, where the object's own size is known.
 */
export function computeAreaRatio(
  target: PosterTarget,
  scale: number,
  cropWidth: number,
  cropHeight: number,
): number {
  const capturedWidth = cropWidth / scale;
  const capturedHeight = cropHeight / scale;
  return (capturedWidth * capturedHeight) / (target.width * target.height);
}

/**
 * The target's own seal was read. All that is left is to grade how tight the
 * crop was. Shared by the single-seal and multi-seal paths, because "I found
 * it, among other things" is just as much a find as "I found it, alone".
 */
function gradeCapture(
  target: PosterTarget,
  measurement: SealMeasurement,
  cropWidth: number,
  cropHeight: number,
): Verdict {
  const areaRatio = computeAreaRatio(target, measurement.scale, cropWidth, cropHeight);

  if (areaRatio <= PRECISE_AREA_RATIO) {
    return {
      kind: 'PRECISE',
      success: true,
      code: measurement.code,
      scale: measurement.scale,
      areaRatio,
      message: 'Great crop! You found the clue.',
    };
  }

  if (areaRatio <= LOOSE_AREA_RATIO) {
    return {
      kind: 'LOOSE',
      success: true,
      code: measurement.code,
      scale: measurement.scale,
      areaRatio,
      message: 'You found it! Try cropping a bit closer next time.',
    };
  }

  // Beyond the loose threshold the seal was still readable, but the child
  // captured most of the poster. It counts as found, with a firmer nudge.
  return {
    kind: 'TOO_WIDE',
    success: true,
    code: measurement.code,
    scale: measurement.scale,
    areaRatio,
    message: 'You found it! But your crop was very big. Try zooming in more.',
  };
}

/**
 * Grades one pasted crop.
 *
 * `effectiveScale` is the zoom the child's SCREENSHOT carries - the viewer's
 * CSS scale multiplied by the device pixel ratio, because `Win + Shift + S`
 * photographs device pixels. Passing it is what stops the game lying to them,
 * and passing the CSS scale instead would make the lie machine-specific: the
 * same 0.4x is genuinely readable on a Retina screen and hopeless on a school
 * laptop. See `effectiveCropScale` in `zoomReadiness.ts`.
 *
 * Below the readable floor a seal's core is physically thinner than the decoder
 * can classify, so the crop CANNOT have been read - which means a `no-seal` or
 * a wrong code down there says nothing whatsoever about what the child cropped.
 * Rendering that as "That is not the clue" told children who had searched
 * correctly and cropped correctly that they had found the wrong object. It is
 * not merely unhelpful; it is false. Below the floor the answer is always
 * "zoom in a bit more".
 *
 * Above the floor nothing changes: a genuine wrong object is still called one.
 * And a crop that somehow succeeded is never taken away, whatever the zoom.
 * Omitting `effectiveScale` keeps the old behaviour, for callers with no viewer.
 */
export function buildVerdict(
  target: PosterTarget,
  result: DecodeResult,
  cropWidth: number,
  cropHeight: number,
  lookupBySealCode: TargetLookup = findObjectBySealCode,
  effectiveScale?: number,
): Verdict {
  const verdict = gradeResult(target, result, cropWidth, cropHeight, lookupBySealCode);
  if (verdict.success) return verdict;
  if (effectiveScale === undefined || isReadyToCrop(effectiveScale)) return verdict;
  return tooSmallVerdict();
}

function tooSmallVerdict(): Verdict {
  return {
    kind: 'TOO_SMALL',
    success: false,
    message: 'Zoom in a bit more before you crop.',
  };
}

function gradeResult(
  target: PosterTarget,
  result: DecodeResult,
  cropWidth: number,
  cropHeight: number,
  lookupBySealCode: TargetLookup,
): Verdict {
  switch (result.kind) {
    case 'no-seal':
      return {
        kind: 'NO_SEAL',
        success: false,
        message: 'I could not see a clue in your crop. Have another go.',
      };

    case 'too-small':
      return tooSmallVerdict();

    case 'ambiguous': {
      // The poster carries decoy seals on dozens of crowd figures, so a crop
      // holding several seals is ordinary. If one of them is the target's, the
      // child found the object: grade that seal and say so.
      const mine = result.seals.find((seal) => seal.code === target.sealCode);
      if (mine) return gradeCapture(target, mine, cropWidth, cropHeight);

      return {
        kind: 'AMBIGUOUS',
        success: false,
        code: result.codes[0],
        message:
          'Your crop has several clues, and none of them is yours. Crop just the object.',
      };
    }

    case 'decoded': {
      if (result.code !== target.sealCode) {
        const captured = lookupBySealCode(result.code);
        return {
          kind: 'WRONG_OBJECT',
          success: false,
          code: result.code,
          scale: result.scale,
          areaRatio: computeAreaRatio(target, result.scale, cropWidth, cropHeight),
          capturedObjectName: captured?.name,
          message: 'That is not the clue. Keep looking!',
        };
      }

      return gradeCapture(target, result, cropWidth, cropHeight);
    }
  }
}

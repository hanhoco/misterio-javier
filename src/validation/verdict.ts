/**
 * Turns a decode result into something a seven year old can act on.
 *
 * Code identifiers stay in English; every `message` is Spanish, neutral
 * register, because it is shown directly to the child.
 */

import type { PosterTarget } from '../poster/posterData';
import { findObjectBySealCode } from '../poster/posterData';
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
  /** User facing text, Spanish. */
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
      message: '¡Excelente recorte! Encontraste la pista.',
    };
  }

  if (areaRatio <= LOOSE_AREA_RATIO) {
    return {
      kind: 'LOOSE',
      success: true,
      code: measurement.code,
      scale: measurement.scale,
      areaRatio,
      message: '¡La encontraste! Intenta recortar un poco más cerca.',
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
    message: '¡La encontraste! Pero recortaste demasiado grande. Acércate más.',
  };
}

export function buildVerdict(
  target: PosterTarget,
  result: DecodeResult,
  cropWidth: number,
  cropHeight: number,
  lookupBySealCode: TargetLookup = findObjectBySealCode,
): Verdict {
  switch (result.kind) {
    case 'no-seal':
      return {
        kind: 'NO_SEAL',
        success: false,
        message: 'No reconocí ninguna pista en tu recorte. Intenta de nuevo.',
      };

    case 'too-small':
      return {
        kind: 'TOO_SMALL',
        success: false,
        message: 'Acércate un poco más con el zoom antes de recortar.',
      };

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
          'Tu recorte tiene varias pistas y ninguna es la que buscas. Recorta solo el objeto.',
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
          message: 'Esa no es la pista. ¡Busca otra vez!',
        };
      }

      return gradeCapture(target, result, cropWidth, cropHeight);
    }
  }
}

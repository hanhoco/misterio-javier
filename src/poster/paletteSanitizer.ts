/**
 * The palette sanitiser: what makes an external illustration safe to carry
 * seals.
 *
 * The procedural poster stays out of the decoder's signal space by
 * construction - every colour it uses is built by `sceneColor()`, which refuses
 * reserved hues and caps saturation. An illustration that arrived as a PNG has
 * no such guarantee: a red kite, a magenta picnic blanket or a cyan pond can
 * all land squarely inside a reserved band at full saturation, and the decoder
 * would then read dots that are not there.
 *
 * So we do after the fact what `sceneColor()` does up front: walk every pixel
 * and, for the ones the decoder would classify, move them just far enough to be
 * invisible to it. There are exactly two ways out of the signal space, and we
 * take the cheaper one per pixel:
 *
 *   1. rotate the hue to the nearest safe hue just outside the band, or
 *   2. pull the HSV saturation below the decoder's floor.
 *
 * Both preserve HSV value exactly, which is the channel carrying the artwork's
 * shading: a sanitised illustration keeps its light and shadow, and only shifts
 * in colour where it had to.
 *
 * No DOM here, so it is importable from plain Node for tests.
 */

import { MAX_SCENE_VALUE_SATURATION } from './sceneColor';
import { RESERVED_HUES, RESERVED_HUE_TOLERANCE, hueDistance } from './seal';

/** Minimal structural subset of `ImageData`; the pixel buffer is written in place. */
export interface MutableImageDataLike {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/**
 * The decoder classifies a pixel only when its HSV saturation is above this.
 * It mirrors `MIN_SATURATION` in `sealDecoder.ts`, which is deliberately not
 * exported: the decoder's thresholds are tuned and frozen, and this module
 * reads them as a published contract rather than reaching into it.
 */
export const DECODER_SATURATION_FLOOR = 0.55;

/** ...and only when its HSV value is above this (`MIN_VALUE` in the decoder). */
export const DECODER_VALUE_FLOOR = 0.45;

/**
 * Where a desaturated pixel lands. The same ceiling `sceneColor()` imposes on
 * the procedural poster, so both posters end up with the same headroom under
 * the decoder's floor - enough to survive 8-bit quantisation and the resampling
 * a screenshot goes through.
 */
export const SANITIZED_SATURATION = MAX_SCENE_VALUE_SATURATION;

/**
 * Extra degrees a rotated hue is pushed past the edge of a reserved band.
 *
 * The band is +/-15 degrees wide; landing a pixel exactly on 15.0 would leave
 * it one rounding error away from being classified again. Eight degrees is
 * comfortably clear and still a shift small enough to read as the same colour.
 */
export const HUE_SAFETY_MARGIN = 8;

export interface SanitizeStats {
  /** Pixels examined. */
  scanned: number;
  /** Pixels the decoder would have classified, and that were therefore moved. */
  recolored: number;
  /** How many of those were fixed by rotating the hue rather than desaturating. */
  hueRotated: number;
}

/** RGB (0-255) to HSV, hue in degrees, saturation/value in 0-1. */
export function rgbToHsv(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
    if (h < 0) h += 360;
  }

  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/** HSV back to RGB in 0-255, unrounded. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hp = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = v - c;
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

/** True when the decoder would classify a pixel with these HSV coordinates. */
export function isDecodableSignal(h: number, s: number, v: number): boolean {
  if (s <= DECODER_SATURATION_FLOOR || v <= DECODER_VALUE_FLOOR) return false;
  return RESERVED_HUES.some((reserved) => hueDistance(h, reserved) <= RESERVED_HUE_TOLERANCE);
}

/**
 * The nearest hue outside every reserved band, with the safety margin applied.
 *
 * Walks out to whichever edge of the offending band is closer, then re-checks:
 * the bands are far enough apart that one step always suffices, but a poster
 * palette is not the place to rely on that silently.
 */
export function nearestSafeHue(hue: number): number {
  const normalise = (value: number) => ((value % 360) + 360) % 360;
  let candidate = normalise(hue);

  for (let attempt = 0; attempt < RESERVED_HUES.length + 1; attempt += 1) {
    const offending = RESERVED_HUES.find(
      (reserved) => hueDistance(candidate, reserved) <= RESERVED_HUE_TOLERANCE,
    );
    if (offending === undefined) return candidate;

    // Signed offset from the band's centre, in (-180, 180].
    const rawOffset = normalise(candidate - offending);
    const offset = rawOffset > 180 ? rawOffset - 360 : rawOffset;
    const edge = RESERVED_HUE_TOLERANCE + HUE_SAFETY_MARGIN;
    candidate = normalise(offending + (offset < 0 ? -edge : edge));
  }

  return candidate;
}

/** Squared Euclidean distance in RGB. Cheap, and monotone in the real distance. */
function rgbDistanceSquared(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * Moves one colour out of the decoder's signal space, by whichever of the two
 * routes changes it least. Returns the input unchanged when it was already safe.
 */
export function sanitizeColor(
  r: number,
  g: number,
  b: number,
): { rgb: [number, number, number]; changed: boolean; hueRotated: boolean } {
  const { h, s, v } = rgbToHsv(r, g, b);
  if (!isDecodableSignal(h, s, v)) {
    return { rgb: [r, g, b], changed: false, hueRotated: false };
  }

  const original: [number, number, number] = [r, g, b];
  const rotated = hsvToRgb(nearestSafeHue(h), s, v);
  const desaturated = hsvToRgb(h, SANITIZED_SATURATION, v);

  const hueRotated =
    rgbDistanceSquared(original, rotated) <= rgbDistanceSquared(original, desaturated);
  return { rgb: hueRotated ? rotated : desaturated, changed: true, hueRotated };
}

/**
 * Sanitises a whole image in place.
 *
 * Every pixel the decoder could have classified is moved; every pixel it could
 * not is left byte-identical, so the illustration only pays for the colours
 * that were actually dangerous.
 */
export function sanitizePalette(image: MutableImageDataLike): SanitizeStats {
  const { data } = image;
  const stats: SanitizeStats = { scanned: 0, recolored: 0, hueRotated: 0 };

  for (let i = 0; i < data.length; i += 4) {
    stats.scanned += 1;
    const result = sanitizeColor(data[i], data[i + 1], data[i + 2]);
    if (!result.changed) continue;

    data[i] = Math.round(result.rgb[0]);
    data[i + 1] = Math.round(result.rgb[1]);
    data[i + 2] = Math.round(result.rgb[2]);
    stats.recolored += 1;
    if (result.hueRotated) stats.hueRotated += 1;
  }

  return stats;
}

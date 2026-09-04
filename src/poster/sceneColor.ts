/**
 * The scene-colour guard: the single gate every non-seal colour in the poster
 * must pass through.
 *
 * The decoder's only signal is "fully saturated pixel whose hue is within 15
 * degrees of a reserved hue". Two independent guards keep the illustration out
 * of that space, and both are enforced here by construction rather than by
 * convention:
 *
 *   1. Reserved-hue assertion. Asking for a hue inside a reserved band throws.
 *   2. Saturation ceilings. The requested HSL saturation is capped, and the
 *      resulting colour is then pushed below the decoder's HSV saturation
 *      floor as well.
 *
 * Guard 2 is the one that survives antialiasing. Every pixel the rasteriser
 * produces is a convex combination of the colours drawn into it, and for a
 * convex combination `c = (1-t)a + t*b`:
 *
 *     min(c) / max(c) >= min( min(a)/max(a), min(b)/max(b) )
 *
 * (the mediant inequality), so HSV saturation never rises above the highest
 * saturation of its ingredients. Cap every ingredient below the decoder's floor
 * and no blended edge pixel, however antialiased or rescaled, can ever be
 * mistaken for a seal dot. Pure black outlines and off-white smoke have zero
 * saturation, so they are ingredients that only ever help.
 */

import { isReservedHue } from './seal';

/**
 * Hard ceiling on the HSL saturation of anything that is not a seal. Kept as
 * the first, coarse cap: it is what keeps the palette looking muted.
 */
export const MAX_SCENE_SATURATION = 0.5;

/**
 * Hard ceiling on the HSV saturation of anything that is not a seal.
 *
 * The decoder classifies a pixel only when its HSV saturation is above 0.55, so
 * this sits well below that with room for 8-bit quantisation. Note that
 * `hsl(h, 50%, 50%)` has an HSV saturation of 0.67, which is *above* the
 * decoder's floor: capping HSL saturation alone would not be enough, which is
 * exactly why this second ceiling exists.
 */
export const MAX_SCENE_VALUE_SATURATION = 0.45;

/** HSL (h in degrees, s and l in 0-1) to RGB in 0-255. */
function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hp = hue / 60;
  const x = chroma * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [chroma, x, 0];
  else if (hp < 2) rgb = [x, chroma, 0];
  else if (hp < 3) rgb = [0, chroma, x];
  else if (hp < 4) rgb = [0, x, chroma];
  else if (hp < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  const m = lightness - chroma / 2;
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

/**
 * Raises the darkest channel until the HSV saturation meets the ceiling.
 *
 * Hue is preserved exactly: the transform is affine on the channel values and
 * leaves both `max` and the normalised position of the middle channel
 * unchanged, which is all the hue formula reads.
 */
function clampValueSaturation(rgb: [number, number, number]): [number, number, number] {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  const min = Math.min(rgb[0], rgb[1], rgb[2]);
  if (max <= 0) return rgb;
  const valueSaturation = (max - min) / max;
  if (valueSaturation <= MAX_SCENE_VALUE_SATURATION) return rgb;

  const targetMin = max * (1 - MAX_SCENE_VALUE_SATURATION);
  const factor = (max - targetMin) / (max - min);
  return [
    targetMin + (rgb[0] - min) * factor,
    targetMin + (rgb[1] - min) * factor,
    targetMin + (rgb[2] - min) * factor,
  ];
}

/**
 * Builds a scene colour. Throws when the hue is reserved; silently tightens the
 * saturation when it is too high, because clamping is always the safe answer
 * and a thrown error there would only tempt callers to bypass the guard.
 */
export function sceneColor(
  hue: number,
  saturation: number,
  lightness: number,
  alpha = 1,
): string {
  const safeHue = ((hue % 360) + 360) % 360;
  if (isReservedHue(safeHue)) {
    throw new Error(
      `Scene hue ${safeHue} falls inside a reserved seal band; pick another hue.`,
    );
  }
  const safeSaturation = Math.max(0, Math.min(saturation, MAX_SCENE_SATURATION));
  const safeLightness = Math.max(0, Math.min(1, lightness));
  const rgb = clampValueSaturation(hslToRgb(safeHue, safeSaturation, safeLightness));
  const r = Math.round(Math.max(0, Math.min(255, rgb[0])));
  const g = Math.round(Math.max(0, Math.min(255, rgb[1])));
  const b = Math.round(Math.max(0, Math.min(255, rgb[2])));
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

/**
 * The near-black used for every outline in the illustration. Zero saturation,
 * so it is invisible to the decoder no matter what it is blended with, and it
 * is what gives the crowd its cartoon readability.
 */
export const OUTLINE_COLOR = sceneColor(0, 0, 0.09);

/** Off-white used for smoke blobs and highlights. Zero saturation. */
export const SMOKE_COLOR = sceneColor(0, 0, 0.94);

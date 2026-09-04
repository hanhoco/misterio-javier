/**
 * Test-only seal rasterizer.
 *
 * Synthesises the exact pixel buffer the browser would produce, without a DOM:
 * dots are supersampled and then box-averaged down, which is the same kind of
 * smoothing the canvas (and the OS screenshot tool) applies. That means the
 * white rings get partially blended at their edges here too, so the test
 * exercises the real failure mode rather than a clean synthetic one.
 */

import {
  SEAL_COLORS,
  SEAL_DOT_OFFSETS,
  SEAL_DOT_OUTER_RADIUS,
  SEAL_DOT_RADIUS,
  SEAL_FOOTPRINT,
  decodeSealCode,
} from '../src/poster/seal';
import { downscaleImage, type ImageDataLike } from '../src/validation/sealDecoder';

const SUPERSAMPLE = 4;

/** Two muted, low-saturation background tones the decoder must ignore. */
const BACKGROUND_A: [number, number, number] = [214, 226, 240];
const BACKGROUND_B: [number, number, number] = [232, 224, 205];

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export interface SealPlacement {
  code: number;
  /** Seal centre in output pixels. */
  centerX: number;
  centerY: number;
}

/**
 * Renders `placements` into an image of `width` x `height` output pixels, with
 * every seal drawn at `scale` times its poster-native geometry.
 */
export function rasterizeSeals(
  placements: readonly SealPlacement[],
  scale: number,
  width: number,
  height: number,
): ImageDataLike {
  const superWidth = Math.round(width * SUPERSAMPLE);
  const superHeight = Math.round(height * SUPERSAMPLE);
  const data = new Uint8ClampedArray(superWidth * superHeight * 4);

  const coreRadius = SEAL_DOT_RADIUS * scale * SUPERSAMPLE;
  const outerRadius = SEAL_DOT_OUTER_RADIUS * scale * SUPERSAMPLE;

  const dots = placements.flatMap((placement) => {
    const digits = decodeSealCode(placement.code);
    return SEAL_DOT_OFFSETS.map((offset, index) => ({
      x: (placement.centerX + offset.dx * scale) * SUPERSAMPLE,
      y: (placement.centerY + offset.dy * scale) * SUPERSAMPLE,
      color: parseHex(SEAL_COLORS[digits[index]]),
    }));
  });

  const checkerSize = 23 * SUPERSAMPLE;

  for (let y = 0; y < superHeight; y += 1) {
    for (let x = 0; x < superWidth; x += 1) {
      const checker =
        (Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0;
      const color = checker ? BACKGROUND_A : BACKGROUND_B;
      const i = (y * superWidth + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }

  const paintDisc = (
    centerX: number,
    centerY: number,
    radius: number,
    color: readonly [number, number, number],
  ) => {
    const minX = Math.max(0, Math.floor(centerX - radius));
    const maxX = Math.min(superWidth - 1, Math.ceil(centerX + radius));
    const minY = Math.max(0, Math.floor(centerY - radius));
    const maxY = Math.min(superHeight - 1, Math.ceil(centerY + radius));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY) > radius) continue;
        const i = (y * superWidth + x) * 4;
        data[i] = color[0];
        data[i + 1] = color[1];
        data[i + 2] = color[2];
      }
    }
  };

  // White rings first for every dot, then cores on top: same paint order as the
  // real renderer, so adjacent cores stay separated by a white moat.
  const WHITE = [255, 255, 255] as const;
  for (const dot of dots) paintDisc(dot.x, dot.y, outerRadius, WHITE);
  for (const dot of dots) paintDisc(dot.x, dot.y, coreRadius, dot.color);

  return downscaleImage({ width: superWidth, height: superHeight, data }, 1 / SUPERSAMPLE);
}

/** A single seal centred in a tight crop, at the given scale. */
export function rasterizeSingleSeal(code: number, scale: number): ImageDataLike {
  const side = Math.ceil(SEAL_FOOTPRINT * scale) + Math.ceil(24 * scale);
  return rasterizeSeals([{ code, centerX: side / 2, centerY: side / 2 }], scale, side, side);
}

/** Background only: no reserved colour anywhere. */
export function rasterizeEmptyScene(width: number, height: number): ImageDataLike {
  return rasterizeSeals([], 1, width, height);
}

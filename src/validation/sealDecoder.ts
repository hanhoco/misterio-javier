/**
 * Seal decoder. Pure TypeScript, zero dependencies, no DOM: it takes the raw
 * pixels of a pasted screenshot and tries to read the base-4 seal hidden in it.
 *
 * The pipeline is deliberately conservative. A false negative only costs the
 * child another attempt; a false positive would tell them they found something
 * they did not.
 */

import {
  RESERVED_HUES,
  SEAL_ARM_DISTANCE,
  SEAL_COLOR_COUNT,
  SEAL_DOT_RADIUS,
} from '../poster/seal';

/** Minimal structural subset of `ImageData`, so tests can synthesise buffers. */
export interface ImageDataLike {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/**
 * The measurements of one seal, as read off the pasted image. Carried by both
 * the single-seal and the multi-seal result so the caller can compute a scale
 * for whichever seal it cares about.
 */
export interface SealMeasurement {
  code: number;
  scale: number;
  armDistancePx: number;
  dotRadiusPx: number;
}

export type DecodeResult =
  | { kind: 'decoded'; code: number; scale: number; armDistancePx: number; dotRadiusPx: number }
  | { kind: 'no-seal' }
  | { kind: 'too-small' }
  /**
   * More than one seal in the crop. `seals` carries the per-seal measurements
   * in the same order as `codes`: with decoys stamped all over the poster a
   * multi-seal crop is the normal case, not an error, and the caller needs the
   * measurements of the seal it was actually looking for.
   */
  | { kind: 'ambiguous'; codes: number[]; seals: SealMeasurement[] };

/** One seal found in the image, before the caller-facing result is chosen. */
export interface SealCandidate {
  code: number;
  scale: number;
  armDistancePx: number;
  dotRadiusPx: number;
  centerX: number;
  centerY: number;
}

/* -------------------------------------------------------------------------- */
/* Tunable thresholds. Kept together so they can be adjusted on real hardware. */
/* -------------------------------------------------------------------------- */

/** Longest side we are willing to scan. Larger inputs are box-downscaled. */
const MAX_ANALYSIS_SIDE = 1600;

/** A seal core is fully saturated; scene artwork is capped well below this. */
const MIN_SATURATION = 0.55;
const MIN_VALUE = 0.45;

/** Hue window around each reserved hue, in degrees. */
const HUE_TOLERANCE_DEGREES = 15;

/** Blobs thinner than this are noise (JPEG ringing, subpixel text). */
const MIN_BLOB_RADIUS_PX = 2;

/** Blobs at least this big but under `MIN_READABLE_DOT_RADIUS_PX` hint "zoom in". */
const HINT_BLOB_RADIUS_PX = 1;

/** A dot is a disc: its bounding box is square-ish and well filled. */
const MAX_BLOB_ASPECT_RATIO = 1.7;
const MIN_BLOB_FILL_RATIO = 0.5;

/**
 * Arm search window, expressed in multiples of the candidate centre's radius.
 * The seal's own arm-distance-to-dot-radius ratio is 15/7 ~= 2.14, which sits
 * comfortably inside [1.2, 3.5].
 */
const ARM_SEARCH_MIN_RADII = 1.2;
const ARM_SEARCH_MAX_RADII = 3.5;

/** The four arms must be equidistant from the centre within this fraction. */
const ARM_DISTANCE_TOLERANCE = 0.25;

/** ...and 90 degrees apart within this many degrees. */
const ARM_ANGLE_TOLERANCE_DEGREES = 25;

/** Below this measured core radius the code cannot be trusted. */
const MIN_READABLE_DOT_RADIUS_PX = 3;

/* -------------------------------------------------------------------------- */

interface Blob {
  colorIndex: number;
  area: number;
  centerX: number;
  centerY: number;
  radius: number;
}

/** Shortest distance between two angles on a circle, in degrees. */
function angularDistance(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360 + 360) % 360);
  return diff > 180 ? 360 - diff : diff;
}

/** RGB (0-255) to HSV with hue in degrees, saturation/value in 0-1. */
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / delta + 2);
    } else {
      h = 60 * ((rn - gn) / delta + 4);
    }
    if (h < 0) h += 360;
  }

  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/**
 * Step 1. Box-average downscale so very large screenshots stay fast. Averaging
 * (rather than nearest neighbour) keeps the white ring's desaturating effect,
 * which is what separates neighbouring dots later on.
 */
export function downscaleImage(image: ImageDataLike, factor: number): ImageDataLike {
  const width = Math.max(1, Math.round(image.width * factor));
  const height = Math.max(1, Math.round(image.height * factor));
  const out = new Uint8ClampedArray(width * height * 4);
  const stepX = image.width / width;
  const stepY = image.height / height;

  for (let y = 0; y < height; y += 1) {
    const srcY0 = Math.floor(y * stepY);
    const srcY1 = Math.max(srcY0 + 1, Math.floor((y + 1) * stepY));
    for (let x = 0; x < width; x += 1) {
      const srcX0 = Math.floor(x * stepX);
      const srcX1 = Math.max(srcX0 + 1, Math.floor((x + 1) * stepX));
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let sy = srcY0; sy < srcY1 && sy < image.height; sy += 1) {
        for (let sx = srcX0; sx < srcX1 && sx < image.width; sx += 1) {
          const i = (sy * image.width + sx) * 4;
          r += image.data[i];
          g += image.data[i + 1];
          b += image.data[i + 2];
          count += 1;
        }
      }
      const o = (y * width + x) * 4;
      out[o] = r / count;
      out[o + 1] = g / count;
      out[o + 2] = b / count;
      out[o + 3] = 255;
    }
  }

  return { width, height, data: out };
}

/**
 * Step 2. Classify every pixel as one of the four reserved colours, or -1.
 */
function classifyPixels(image: ImageDataLike): Int8Array {
  const labels = new Int8Array(image.width * image.height).fill(-1);
  for (let p = 0; p < labels.length; p += 1) {
    const i = p * 4;
    const { h, s, v } = rgbToHsv(image.data[i], image.data[i + 1], image.data[i + 2]);
    if (s <= MIN_SATURATION || v <= MIN_VALUE) continue;
    for (let colorIndex = 0; colorIndex < SEAL_COLOR_COUNT; colorIndex += 1) {
      if (angularDistance(h, RESERVED_HUES[colorIndex]) <= HUE_TOLERANCE_DEGREES) {
        labels[p] = colorIndex;
        break;
      }
    }
  }
  return labels;
}

/**
 * Steps 3 and 4. Connected-component labelling (8-connectivity, per colour),
 * followed by shape rejection. Returns the accepted blobs plus a count of the
 * ones rejected purely for being too small, which drives the "zoom in" hint.
 */
function findBlobs(
  image: ImageDataLike,
  labels: Int8Array,
): { blobs: Blob[]; undersizedCount: number } {
  const { width, height } = image;
  const visited = new Uint8Array(width * height);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  let undersizedCount = 0;

  for (let start = 0; start < labels.length; start += 1) {
    const colorIndex = labels[start];
    if (colorIndex < 0 || visited[start]) continue;

    visited[start] = 1;
    stack.length = 0;
    stack.push(start);

    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;

    while (stack.length > 0) {
      const p = stack.pop() as number;
      const px = p % width;
      const py = (p - px) / width;

      area += 1;
      sumX += px;
      sumY += py;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = py + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = px + dx;
          if (nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (visited[q] || labels[q] !== colorIndex) continue;
          visited[q] = 1;
          stack.push(q);
        }
      }
    }

    const radius = Math.sqrt(area / Math.PI);
    if (radius < MIN_BLOB_RADIUS_PX) {
      if (radius >= HINT_BLOB_RADIUS_PX) undersizedCount += 1;
      continue;
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const aspectRatio = Math.max(boxWidth, boxHeight) / Math.min(boxWidth, boxHeight);
    const fillRatio = area / (boxWidth * boxHeight);
    if (aspectRatio > MAX_BLOB_ASPECT_RATIO || fillRatio < MIN_BLOB_FILL_RATIO) continue;

    blobs.push({
      colorIndex,
      area,
      centerX: sumX / area + 0.5,
      centerY: sumY / area + 0.5,
      radius,
    });
  }

  return { blobs, undersizedCount };
}

/**
 * Steps 5 to 8. Try every blob as a seal centre and keep the plus-shaped
 * clusters. Blobs already consumed by an accepted seal are not reused.
 */
function findSeals(blobs: Blob[], pixelScale: number): SealCandidate[] {
  const consumed = new Set<number>();
  const seals: SealCandidate[] = [];

  for (let c = 0; c < blobs.length; c += 1) {
    if (consumed.has(c)) continue;
    const center = blobs[c];
    const minDistance = ARM_SEARCH_MIN_RADII * center.radius;
    const maxDistance = ARM_SEARCH_MAX_RADII * center.radius;

    const neighbours: Array<{ index: number; blob: Blob; distance: number; angle: number }> = [];
    for (let a = 0; a < blobs.length; a += 1) {
      if (a === c || consumed.has(a)) continue;
      const arm = blobs[a];
      const dx = arm.centerX - center.centerX;
      const dy = arm.centerY - center.centerY;
      const distance = Math.hypot(dx, dy);
      if (distance < minDistance || distance > maxDistance) continue;
      // Normalised so that "up" is 0 and the angle grows clockwise on screen.
      const angle = (((Math.atan2(dy, dx) * 180) / Math.PI + 90) % 360 + 360) % 360;
      neighbours.push({ index: a, blob: arm, distance, angle });
    }

    if (neighbours.length !== 4) continue;

    // Step 6: order the arms up, right, down, left, anchored on the arm nearest
    // to "up" using wrap-aware distance. Sorting by raw ascending angle instead
    // loses roughly a quarter of otherwise perfect seals: sub-pixel centroid
    // drift from resampling puts the up arm at ~359.7 degrees about half the
    // time, which sorts it last and throws the plus-shape away.
    let upIndex = 0;
    for (let i = 1; i < neighbours.length; i += 1) {
      if (
        angularDistance(neighbours[i].angle, 0) <
        angularDistance(neighbours[upIndex].angle, 0)
      ) {
        upIndex = i;
      }
    }
    const upAngle = neighbours[upIndex].angle;
    const clockwiseFromUp = (angle: number) => (((angle - upAngle) % 360) + 360) % 360;
    neighbours.sort((left, right) => clockwiseFromUp(left.angle) - clockwiseFromUp(right.angle));

    const meanDistance =
      neighbours.reduce((sum, n) => sum + n.distance, 0) / neighbours.length;
    const equidistant = neighbours.every(
      (n) => Math.abs(n.distance - meanDistance) <= ARM_DISTANCE_TOLERANCE * meanDistance,
    );
    if (!equidistant) continue;

    const squareAngles = neighbours.every((n, i) => {
      const expected = (neighbours[0].angle + i * 90) % 360;
      return angularDistance(n.angle, expected) <= ARM_ANGLE_TOLERANCE_DEGREES;
    });
    if (!squareAngles) continue;
    if (angularDistance(neighbours[0].angle, 0) > ARM_ANGLE_TOLERANCE_DEGREES) continue;

    // Step 7: centre is the most significant digit, then up, right, down, left.
    const digits = [center.colorIndex, ...neighbours.map((n) => n.blob.colorIndex)];
    const code = digits.reduce((acc, digit) => acc * SEAL_COLOR_COUNT + digit, 0);

    const meanRadius =
      (center.radius + neighbours.reduce((sum, n) => sum + n.blob.radius, 0)) / 5;

    // Undo any analysis downscale so measurements are in pasted-image pixels.
    const armDistancePx = meanDistance / pixelScale;
    const dotRadiusPx = meanRadius / pixelScale;

    seals.push({
      code,
      // Step 8: how many screen pixels one poster-native pixel became.
      scale: armDistancePx / SEAL_ARM_DISTANCE,
      armDistancePx,
      dotRadiusPx,
      centerX: center.centerX / pixelScale,
      centerY: center.centerY / pixelScale,
    });

    consumed.add(c);
    for (const n of neighbours) consumed.add(n.index);
  }

  return seals;
}

/** Everything the decoder saw, for the developer debug panel. */
export interface DecodeDiagnostics {
  analysisWidth: number;
  analysisHeight: number;
  pixelScale: number;
  blobCount: number;
  undersizedBlobCount: number;
  seals: SealCandidate[];
}

export interface DecodeReport {
  result: DecodeResult;
  diagnostics: DecodeDiagnostics;
}

/** Full decode with diagnostics attached. */
export function decodeSealWithDiagnostics(image: ImageDataLike): DecodeReport {
  const longestSide = Math.max(image.width, image.height);
  const pixelScale = longestSide > MAX_ANALYSIS_SIDE ? MAX_ANALYSIS_SIDE / longestSide : 1;
  const analysed = pixelScale < 1 ? downscaleImage(image, pixelScale) : image;

  const labels = classifyPixels(analysed);
  const { blobs, undersizedCount } = findBlobs(analysed, labels);
  const seals = findSeals(blobs, pixelScale);

  const diagnostics: DecodeDiagnostics = {
    analysisWidth: analysed.width,
    analysisHeight: analysed.height,
    pixelScale,
    blobCount: blobs.length,
    undersizedBlobCount: undersizedCount,
    seals,
  };

  return { result: chooseResult(seals, blobs, undersizedCount), diagnostics };
}

function chooseResult(
  seals: SealCandidate[],
  blobs: Blob[],
  undersizedCount: number,
): DecodeResult {
  if (seals.length === 0) {
    // Step 9 (negative case): reserved-colour specks are present but nothing
    // resolved into a seal, so the crop was almost certainly zoomed out too far.
    const tinyBlobs = blobs.filter((blob) => blob.radius < MIN_READABLE_DOT_RADIUS_PX).length;
    if (undersizedCount + tinyBlobs >= 3) return { kind: 'too-small' };
    return { kind: 'no-seal' };
  }

  if (seals.length > 1) {
    return {
      kind: 'ambiguous',
      codes: seals.map((seal) => seal.code),
      seals: seals.map((seal) => ({
        code: seal.code,
        scale: seal.scale,
        armDistancePx: seal.armDistancePx,
        dotRadiusPx: seal.dotRadiusPx,
      })),
    };
  }

  const seal = seals[0];
  // Step 9: a core smaller than this cannot be colour-classified reliably.
  if (seal.dotRadiusPx < MIN_READABLE_DOT_RADIUS_PX) return { kind: 'too-small' };

  return {
    kind: 'decoded',
    code: seal.code,
    scale: seal.scale,
    armDistancePx: seal.armDistancePx,
    dotRadiusPx: seal.dotRadiusPx,
  };
}

/** Decode a seal from a pasted screenshot. */
export function decodeSeal(image: ImageDataLike): DecodeResult {
  return decodeSealWithDiagnostics(image).result;
}

/** Exposed so the reference sheet and the tests share the nominal geometry. */
export const NOMINAL_ARM_DISTANCE = SEAL_ARM_DISTANCE;
export const NOMINAL_DOT_RADIUS = SEAL_DOT_RADIUS;

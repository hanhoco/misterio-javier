import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCrowd } from '../src/poster/crowd';
import {
  DECOY_EXCLUSION_RADIUS,
  DECOY_SEAL_COUNT,
  DEFAULT_POSTER_SEED,
  MIN_SEAL_SEPARATION,
  POSTER_HEIGHT,
  POSTER_OBJECTS,
  POSTER_WIDTH,
  POSTER_DECOY_CODES,
  buildDecoyCodes,
} from '../src/poster/posterData';
import { planPosterSeals, renderPoster } from '../src/poster/posterRenderer';
import { MAX_SCENE_VALUE_SATURATION } from '../src/poster/sceneColor';
import { SEAL_CODE_COUNT, SEAL_FOOTPRINT, isReservedHue } from '../src/poster/seal';
import { decodeSeal, downscaleImage, type ImageDataLike } from '../src/validation/sealDecoder';
import { buildVerdict } from '../src/validation/verdict';
import { contextOf, installSoftwareCanvas } from './softwareCanvas';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Renders the poster to real pixels through the software rasteriser. */
function renderPosterPixels(seed: number): ImageDataLike {
  const canvas = installSoftwareCanvas();
  try {
    return contextOf(renderPoster(seed)).getImageData();
  } finally {
    canvas.restore();
  }
}

const posterCache = new Map<number, ImageDataLike>();

/** Same poster, rendered at most once per seed: the render is not cheap. */
function poster(seed: number): ImageDataLike {
  const cached = posterCache.get(seed);
  if (cached) return cached;
  const image = renderPosterPixels(seed);
  posterCache.set(seed, image);
  return image;
}

function hashPixels(image: ImageDataLike): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < image.data.length; i += 1) {
    hash ^= image.data[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${image.width}x${image.height}:${hash.toString(16)}`;
}

/** RGB (0-255) to HSV, hue in degrees. Mirrors the decoder's own conversion. */
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
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

function cropImage(
  image: ImageDataLike,
  x: number,
  y: number,
  width: number,
  height: number,
): ImageDataLike {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const w = Math.min(Math.round(width), image.width - x0);
  const h = Math.min(Math.round(height), image.height - y0);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    for (let column = 0; column < w; column += 1) {
      const source = ((y0 + row) * image.width + (x0 + column)) * 4;
      const target = (row * w + column) * 4;
      data[target] = image.data[source];
      data[target + 1] = image.data[source + 1];
      data[target + 2] = image.data[source + 2];
      data[target + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** Bilinear magnification: what a zoomed-in screenshot of the poster looks like. */
function upscaleImage(image: ImageDataLike, factor: number): ImageDataLike {
  const width = Math.round(image.width * factor);
  const height = Math.round(image.height * factor);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(image.height - 1, Math.max(0, (y + 0.5) / factor - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(image.height - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(image.width - 1, Math.max(0, (x + 0.5) / factor - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(image.width - 1, x0 + 1);
      const tx = sx - x0;
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const p00 = image.data[(y0 * image.width + x0) * 4 + channel];
        const p10 = image.data[(y0 * image.width + x1) * 4 + channel];
        const p01 = image.data[(y1 * image.width + x0) * 4 + channel];
        const p11 = image.data[(y1 * image.width + x1) * 4 + channel];
        const top = p00 + (p10 - p00) * tx;
        const bottom = p01 + (p11 - p01) * tx;
        data[target + channel] = top + (bottom - top) * ty;
      }
      data[target + 3] = 255;
    }
  }
  return { width, height, data };
}

function resample(image: ImageDataLike, factor: number): ImageDataLike {
  if (factor === 1) return image;
  return factor < 1 ? downscaleImage(image, factor) : upscaleImage(image, factor);
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe('crowd density', () => {
  it('packs 300-450 figures into the scene, for any seed', () => {
    for (const seed of [DEFAULT_POSTER_SEED, 1, 777, 20261231]) {
      const count = buildCrowd(seed).length;
      assert.ok(
        count >= 300 && count <= 450,
        `seed ${seed} produced ${count} figures, expected 300-450`,
      );
    }
  });

  it('keeps every figure inside the size band the art direction asks for', () => {
    for (const figure of buildCrowd(DEFAULT_POSTER_SEED)) {
      assert.ok(
        figure.height >= 36 && figure.height <= 110,
        `figure ${figure.index} is ${figure.height.toFixed(1)}px tall`,
      );
    }
  });
});

describe('poster determinism', () => {
  it('renders identical pixels for the same seed and different pixels for another', () => {
    const first = hashPixels(renderPosterPixels(DEFAULT_POSTER_SEED));
    const second = hashPixels(renderPosterPixels(DEFAULT_POSTER_SEED));
    assert.equal(second, first, 'the same seed must produce byte-identical pixels');

    const other = hashPixels(renderPosterPixels(DEFAULT_POSTER_SEED + 1));
    assert.notEqual(other, first, 'a different seed must produce a different poster');
  });
});

describe('decoy seals', () => {
  it('never reuses a target code, for any seed', () => {
    const targetCodes = new Set(POSTER_OBJECTS.map((object) => object.sealCode));
    for (const seed of [DEFAULT_POSTER_SEED, 0, 1, 42, 999983, 20261231]) {
      const codes = buildDecoyCodes(seed);
      assert.equal(codes.length, DECOY_SEAL_COUNT, `seed ${seed}`);
      assert.equal(new Set(codes).size, codes.length, `seed ${seed}: duplicate decoy codes`);
      for (const code of codes) {
        assert.ok(code >= 0 && code < SEAL_CODE_COUNT, `seed ${seed}: code ${code} out of range`);
        assert.ok(!targetCodes.has(code), `seed ${seed}: decoy ${code} collides with a target`);
      }
    }
  });

  it('exports the shipped decoy set', () => {
    assert.deepEqual([...POSTER_DECOY_CODES], buildDecoyCodes(DEFAULT_POSTER_SEED));
  });

  it('stamps every decoy clear of the targets and of every other seal', () => {
    const seals = planPosterSeals(DEFAULT_POSTER_SEED);
    const targets = seals.filter((seal) => seal.isTarget);
    const decoys = seals.filter((seal) => !seal.isTarget);

    assert.equal(targets.length, POSTER_OBJECTS.length);
    assert.equal(decoys.length, DECOY_SEAL_COUNT, 'not every decoy found a home');

    for (const decoy of decoys) {
      for (const target of targets) {
        assert.ok(
          Math.hypot(target.centerX - decoy.centerX, target.centerY - decoy.centerY) >=
            DECOY_EXCLUSION_RADIUS,
          `decoy ${decoy.code} sits too close to a target`,
        );
      }
    }

    for (let i = 0; i < seals.length; i += 1) {
      for (let j = i + 1; j < seals.length; j += 1) {
        const distance = Math.hypot(
          seals[i].centerX - seals[j].centerX,
          seals[i].centerY - seals[j].centerY,
        );
        assert.ok(
          distance >= MIN_SEAL_SEPARATION,
          `seals ${i} and ${j} are only ${distance.toFixed(1)}px apart`,
        );
      }
    }
  });
});

describe('palette safety', () => {
  /**
   * The critical regression test. If any part of the illustration ever drifts
   * into a reserved hue at a saturation the decoder accepts, the decoder starts
   * seeing dots that are not there and the whole game stops working. Scanning
   * every rendered pixel is the only check that cannot be fooled by a colour
   * built somewhere the guard does not cover.
   */
  it('puts no seal-coloured pixel anywhere outside a seal', () => {
    const image = poster(DEFAULT_POSTER_SEED);
    const seals = planPosterSeals(DEFAULT_POSTER_SEED);
    const half = SEAL_FOOTPRINT / 2 + 4;

    const insideASeal = (x: number, y: number) =>
      seals.some(
        (seal) =>
          Math.abs(seal.centerX - x) <= half && Math.abs(seal.centerY - y) <= half,
      );

    const offenders: string[] = [];
    let worstSaturation = 0;
    let worstSample = '';

    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const i = (y * image.width + x) * 4;
        const { h, s, v } = rgbToHsv(image.data[i], image.data[i + 1], image.data[i + 2]);
        if (v <= 0.45) continue;
        if (insideASeal(x, y)) continue;

        if (s > worstSaturation) {
          worstSaturation = s;
          worstSample = `(${x},${y}) hue ${h.toFixed(0)} sat ${s.toFixed(3)}`;
        }
        if (s > 0.55 && isReservedHue(h) && offenders.length < 12) {
          offenders.push(`(${x},${y}) hue ${h.toFixed(1)} sat ${s.toFixed(3)}`);
        }
      }
    }

    assert.deepEqual(offenders, [], 'scene pixels landed inside a reserved seal band');
    // The stronger invariant the guard actually enforces: no scene pixel is
    // saturated enough for the decoder to classify it at all, whatever its hue.
    assert.ok(
      worstSaturation <= 0.55,
      `most saturated scene pixel was ${worstSample}, above the decoder's 0.55 floor`,
    );
    assert.ok(
      worstSaturation <= MAX_SCENE_VALUE_SATURATION + 0.06,
      `most saturated scene pixel was ${worstSample}, above the guard's own ceiling`,
    );
  });
});

describe('seal round-trip against the dense poster', () => {
  /** How much slack a child's crop gets around the object's bounding box. */
  const CROP_MARGIN = 30;

  /**
   * Runs the real decoder over a real crop of the real poster and returns one
   * line per target that did not come back clean.
   */
  function roundTripFailures(scale: number): string[] {
    const image = poster(DEFAULT_POSTER_SEED);
    const failures: string[] = [];

    for (const object of POSTER_OBJECTS) {
      const crop = cropImage(
        image,
        object.x - CROP_MARGIN,
        object.y - CROP_MARGIN,
        object.width + CROP_MARGIN * 2,
        object.height + CROP_MARGIN * 2,
      );
      const sample = resample(crop, scale);
      const result = decodeSeal(sample);

      if (result.kind !== 'decoded') {
        const detail = result.kind === 'ambiguous' ? ` codes=${result.codes.join(',')}` : '';
        failures.push(`${object.id}: got "${result.kind}"${detail}`);
        continue;
      }
      if (result.code !== object.sealCode) {
        failures.push(`${object.id}: read code ${result.code}, expected ${object.sealCode}`);
        continue;
      }
      if (Math.abs(result.scale - scale) / scale > 0.15) {
        failures.push(
          `${object.id}: reported scale ${result.scale.toFixed(3)}, expected ~${scale}`,
        );
        continue;
      }

      const verdict = buildVerdict(object, result, sample.width, sample.height);
      if (!verdict.success) {
        failures.push(`${object.id}: verdict was ${verdict.kind}`);
      }
    }

    return failures;
  }

  // Unresampled: the crop the child gets when the viewer is at 1:1, and the one
  // case the decoder handles without any sub-pixel drift at all.
  for (const scale of [1, 1.5, 2]) {
    it(`decodes every target from a tight crop at ${scale}x`, () => {
      assert.deepEqual(roundTripFailures(scale), []);
    });
  }

  /**
   * Recorded, not hidden: the decoder loses roughly a quarter of otherwise
   * perfect seals once the screenshot has been resampled by a factor that is
   * not "nice".
   *
   * It is NOT the dense background. At every failing scale all five dots are
   * still found, still equidistant, and still 90 degrees apart. What rejects
   * the seal is the 0/360 wrap in `findSeals`: the four arms are sorted by raw
   * angle ascending and the seal is then required to have its "up" arm first,
   * but sub-pixel centroid drift from resampling puts that arm at ~359.7
   * degrees about half the time, so it sorts last, `neighbours[0]` becomes the
   * "right" arm at ~90 degrees, and the plus-shape is thrown away.
   *
   * Measured, seed 20260903, tight crops, 31 scales from 0.50x to 2.00x in
   * 0.05 steps: 189 of 248 decodes succeed (76%); only 12 of the 31 scales are
   * clean. Per-arm evidence at 1.25x, where backpack/cat/clock/key/ball all
   * fail: every one reports 5 blobs, equidistant = true, square = true, and an
   * up-arm angle of 359.65-359.86, while the two that pass report 0.14-0.31.
   *
   * FIXED: `findSeals` now anchors the arm order on the arm nearest to "up"
   * using wrap-aware angular distance, instead of sorting by raw ascending
   * angle. This test is the regression guard for that fix and must stay green
   * across every scale it sweeps.
   *
   * The sweep starts at 0.8x, not 0.5x. `SEAL_DOT_RADIUS` was halved from 7 to
   * 4 so the seals stop defacing the illustration, and the decoder needs a 3px
   * radius, so nothing resolves below 3/4 = 0.75x. Under that floor the correct
   * answer is `too-small` - "zoom in a bit more" - which is asserted in
   * `sealDecoder.test.ts`, not a decode. The raised floor is the design: it
   * forces the child to zoom in before a crop can be read.
   */
  it('decodes every target at every resampled scale', () => {
      const failures: string[] = [];
      for (let step = 0; step <= 24; step += 1) {
        const scale = Math.round((0.8 + step * 0.05) * 100) / 100;
        const bad = roundTripFailures(scale);
        if (bad.length > 0) failures.push(`${scale}x -> ${bad.join('; ')}`);
      }
      assert.deepEqual(failures, []);
    },
  );

  it('still finds the target when the crop also swallows decoy seals', () => {
    const image = poster(DEFAULT_POSTER_SEED);
    const target = POSTER_OBJECTS[0];
    const wide = cropImage(image, target.x - 260, target.y - 200, 700, 560);
    const result = decodeSeal(wide);

    assert.ok(
      result.kind === 'decoded' || result.kind === 'ambiguous',
      `expected a readable crop, got "${result.kind}"`,
    );
    const codes = result.kind === 'ambiguous' ? result.codes : [result.code];
    assert.ok(codes.includes(target.sealCode), `codes ${codes.join(',')} lack the target`);

    const verdict = buildVerdict(target, result, wide.width, wide.height);
    assert.equal(verdict.success, true, `verdict was ${verdict.kind}: ${verdict.message}`);
  });
});

describe('poster bounds', () => {
  it('keeps every findable object fully on the poster and clear of the others', () => {
    for (const object of POSTER_OBJECTS) {
      assert.ok(object.x >= 0 && object.y >= 0, `${object.id} starts off-poster`);
      assert.ok(
        object.x + object.width <= POSTER_WIDTH && object.y + object.height <= POSTER_HEIGHT,
        `${object.id} runs off the poster`,
      );
    }
    for (let i = 0; i < POSTER_OBJECTS.length; i += 1) {
      for (let j = i + 1; j < POSTER_OBJECTS.length; j += 1) {
        const a = POSTER_OBJECTS[i];
        const b = POSTER_OBJECTS[j];
        const overlaps =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        assert.ok(!overlaps, `${a.id} overlaps ${b.id}`);
      }
    }
  });
});

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  DEFAULT_PARK_SEED,
  PARK_CROP_HEIGHT,
  PARK_CROP_WIDTH,
  PARK_DECOY_CODES,
  PARK_DECOY_EXCLUSION_MARGIN,
  PARK_DECOY_SEAL_COUNT,
  PARK_ILLUSTRATION_WIDTH,
  PARK_MIN_SEAL_SEPARATION,
  PARK_POSTER_HEIGHT,
  PARK_POSTER_WIDTH,
  PARK_SEAL_EDGE_MARGIN,
  PARK_SOURCE_HEIGHT,
  PARK_SOURCE_WIDTH,
  PARK_TARGETS,
  buildParkDecoyCodes,
} from '../src/poster/parkPosterData';
import { legendCropWidth, planParkSeals } from '../src/poster/imagePoster';
import {
  isDecodableSignal,
  rgbToHsv,
  sanitizePalette,
} from '../src/poster/paletteSanitizer';
import { SEAL_CODE_COUNT, SEAL_FOOTPRINT } from '../src/poster/seal';
import { drawSeal } from '../src/poster/posterRenderer';
import { decodeSeal, type ImageDataLike } from '../src/validation/sealDecoder';
import { buildVerdict } from '../src/validation/verdict';
import { BUTTON_ZOOM_STEP, MIN_SCALE, clampScale } from '../src/viewer/viewerGeometry';
import {
  READY_TO_CROP_SCALE,
  effectiveCropScale,
  isReadyToCrop,
} from '../src/viewer/zoomReadiness';
import { cropAndResize, cropImage, upscaleImage } from './imageResample';
import { decodePng } from './pngDecoder';
import { SoftwareCanvasContext } from './softwareCanvas';
import { MEASURED_STAGES, type StageBox } from './viewportFixtures';

/** The tests are always spawned from the project root, by `run-tests.mjs`. */
const SOURCE_PATH = join(process.cwd(), 'assets', 'park-source.png');

/* -------------------------------------------------------------------------- */
/* The poster, built once                                                     */
/* -------------------------------------------------------------------------- */

let sourceCache: ImageDataLike | null = null;

/** The user's illustration, straight off disk, legend panel still attached. */
function source(): ImageDataLike {
  if (!sourceCache) sourceCache = decodePng(SOURCE_PATH);
  return sourceCache;
}

let backgroundCache: ImageDataLike | null = null;

/** Cropped, upscaled and sanitised - the poster with no seals on it yet. */
function background(): ImageDataLike {
  if (backgroundCache) return backgroundCache;
  const resized = cropAndResize(
    source(),
    legendCropWidth(source().width),
    PARK_POSTER_WIDTH,
    PARK_POSTER_HEIGHT,
  );
  sanitizePalette(resized);
  backgroundCache = resized;
  return resized;
}

let posterCache: ImageDataLike | null = null;

/** The finished, playable poster: sanitised artwork with the real seals on it. */
function poster(): ImageDataLike {
  if (posterCache) return posterCache;
  const ctx = new SoftwareCanvasContext(PARK_POSTER_WIDTH, PARK_POSTER_HEIGHT);
  ctx.putImageData(background(), 0, 0);
  for (const seal of planParkSeals(DEFAULT_PARK_SEED)) {
    drawSeal(ctx as unknown as CanvasRenderingContext2D, seal.centerX, seal.centerY, seal.code);
  }
  posterCache = ctx.getImageData();
  return posterCache;
}

/* -------------------------------------------------------------------------- */
/* The crop                                                                   */
/* -------------------------------------------------------------------------- */

describe('park legend crop', () => {
  it('matches the source the constants were measured against', () => {
    assert.equal(source().width, PARK_SOURCE_WIDTH);
    assert.equal(source().height, PARK_SOURCE_HEIGHT);
    assert.equal(legendCropWidth(source().width), PARK_ILLUSTRATION_WIDTH);
  });

  it('cuts exactly between the illustration and the legend panel', () => {
    const image = source();
    const columnMean = (x: number) => {
      let total = 0;
      for (let y = 0; y < image.height; y += 1) {
        const i = (y * image.width + x) * 4;
        total += (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
      }
      return total / image.height;
    };

    // The rule separating the two is nearly black...
    assert.ok(
      columnMean(PARK_ILLUSTRATION_WIDTH + 1) < 20,
      `column ${PARK_ILLUSTRATION_WIDTH + 1} should be the panel's black rule`,
    );
    // ...the panel behind it is cream paper...
    assert.ok(
      columnMean(image.width - 1) > 220,
      'the far right column should be the legend panel',
    );
    // ...and the last column we keep is neither.
    const kept = columnMean(PARK_ILLUSTRATION_WIDTH - 1);
    assert.ok(
      kept > 20 && kept < 220,
      `column ${PARK_ILLUSTRATION_WIDTH - 1} should still be illustration, got ${kept.toFixed(1)}`,
    );
  });

  it('keeps the illustration\'s aspect ratio', () => {
    assert.equal(PARK_CROP_WIDTH, PARK_ILLUSTRATION_WIDTH);
    assert.equal(PARK_CROP_HEIGHT, PARK_SOURCE_HEIGHT);
    const sourceRatio = PARK_CROP_WIDTH / PARK_CROP_HEIGHT;
    const posterRatio = PARK_POSTER_WIDTH / PARK_POSTER_HEIGHT;
    assert.ok(
      Math.abs(sourceRatio - posterRatio) < 0.002,
      `aspect ratio drifted: ${sourceRatio.toFixed(4)} vs ${posterRatio.toFixed(4)}`,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Target catalogue                                                           */
/* -------------------------------------------------------------------------- */

describe('park targets', () => {
  it('stores every box normalised inside the unit square', () => {
    for (const target of PARK_TARGETS) {
      const box = target.normalized;
      assert.ok(
        box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0,
        `${target.id} has a degenerate box`,
      );
      assert.ok(
        box.x + box.width <= 1 && box.y + box.height <= 1,
        `${target.id} runs off the cropped illustration`,
      );
    }
  });

  it('never lets two targets overlap', () => {
    const overlaps: string[] = [];
    for (let i = 0; i < PARK_TARGETS.length; i += 1) {
      for (let j = i + 1; j < PARK_TARGETS.length; j += 1) {
        const a = PARK_TARGETS[i];
        const b = PARK_TARGETS[j];
        if (
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height
        ) {
          overlaps.push(`${a.id} overlaps ${b.id}`);
        }
      }
    }
    assert.deepEqual(overlaps, []);
  });

  it('gives every target a distinct code that no decoy can take', () => {
    assert.equal(PARK_TARGETS.length, 15);

    const codes = PARK_TARGETS.map((target) => target.sealCode);
    assert.equal(new Set(codes).size, codes.length, 'two targets share a seal code');
    for (const code of codes) {
      assert.ok(code >= 0 && code < SEAL_CODE_COUNT, `code ${code} out of range`);
    }

    const decoys = new Set(PARK_DECOY_CODES);
    assert.equal(decoys.size, PARK_DECOY_SEAL_COUNT, 'duplicate decoy codes');
    for (const code of codes) {
      assert.ok(!decoys.has(code), `target code ${code} collides with a decoy`);
    }

    // ...and not just for the shipped seed.
    for (const seed of [0, 1, 42, 999983, 20261231]) {
      const seeded = new Set(buildParkDecoyCodes(seed));
      for (const code of codes) {
        assert.ok(!seeded.has(code), `seed ${seed}: target code ${code} collides with a decoy`);
      }
    }
  });

  it('leaves every target big enough to carry a seal', () => {
    for (const target of PARK_TARGETS) {
      assert.ok(
        target.width >= SEAL_FOOTPRINT && target.height >= SEAL_FOOTPRINT,
        `${target.id} is ${target.width.toFixed(0)}x${target.height.toFixed(0)}px, ` +
          `too small for a ${SEAL_FOOTPRINT}px seal`,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Seal placement                                                             */
/* -------------------------------------------------------------------------- */

describe('park seal placement', () => {
  it('stamps every target and every decoy, clear of each other', () => {
    const seals = planParkSeals(DEFAULT_PARK_SEED);
    const targets = seals.filter((seal) => seal.isTarget);
    const decoys = seals.filter((seal) => !seal.isTarget);

    assert.equal(targets.length, PARK_TARGETS.length);
    assert.equal(decoys.length, PARK_DECOY_SEAL_COUNT, 'not every decoy found a home');

    for (const seal of seals) {
      assert.ok(
        seal.centerX >= PARK_SEAL_EDGE_MARGIN &&
          seal.centerX <= PARK_POSTER_WIDTH - PARK_SEAL_EDGE_MARGIN &&
          seal.centerY >= PARK_SEAL_EDGE_MARGIN &&
          seal.centerY <= PARK_POSTER_HEIGHT - PARK_SEAL_EDGE_MARGIN,
        `seal ${seal.code} straddles a poster edge`,
      );
    }

    for (const decoy of decoys) {
      for (const target of PARK_TARGETS) {
        const inside =
          decoy.centerX >= target.x - PARK_DECOY_EXCLUSION_MARGIN &&
          decoy.centerX <= target.x + target.width + PARK_DECOY_EXCLUSION_MARGIN &&
          decoy.centerY >= target.y - PARK_DECOY_EXCLUSION_MARGIN &&
          decoy.centerY <= target.y + target.height + PARK_DECOY_EXCLUSION_MARGIN;
        assert.ok(!inside, `decoy ${decoy.code} sits inside ${target.id}'s crop region`);
      }
    }

    for (let i = 0; i < seals.length; i += 1) {
      for (let j = i + 1; j < seals.length; j += 1) {
        const distance = Math.hypot(
          seals[i].centerX - seals[j].centerX,
          seals[i].centerY - seals[j].centerY,
        );
        assert.ok(
          distance >= PARK_MIN_SEAL_SEPARATION,
          `seals ${i} and ${j} are only ${distance.toFixed(1)}px apart`,
        );
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Palette safety on the real illustration                                    */
/* -------------------------------------------------------------------------- */

describe('park palette safety', () => {
  /**
   * The whole reason the sanitiser exists. If any part of the user's artwork
   * survives inside a reserved band at a saturation the decoder accepts, the
   * decoder starts seeing dots that are not there. Scanning all 5.4 million
   * rendered pixels is the only check that cannot be fooled.
   */
  it('leaves no seal-coloured pixel anywhere in the illustration', () => {
    const image = background();
    const offenders: string[] = [];
    let worstSaturation = 0;
    let worstSample = '';

    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const i = (y * image.width + x) * 4;
        const { h, s, v } = rgbToHsv(image.data[i], image.data[i + 1], image.data[i + 2]);
        if (isDecodableSignal(h, s, v) && offenders.length < 12) {
          offenders.push(`(${x},${y}) hue ${h.toFixed(1)} sat ${s.toFixed(3)}`);
        }
        if (v > 0.45 && s > worstSaturation) {
          worstSaturation = s;
          worstSample = `(${x},${y}) hue ${h.toFixed(0)} sat ${s.toFixed(3)}`;
        }
      }
    }

    assert.deepEqual(offenders, [], 'illustration pixels survived inside a reserved seal band');
    assert.ok(worstSaturation > 0, `expected some colour in the poster, saw ${worstSample}`);
  });
});

/* -------------------------------------------------------------------------- */
/* Round trip                                                                 */
/* -------------------------------------------------------------------------- */

describe('seal round-trip against the park poster', () => {
  /** How much slack a child's crop gets around the object's bounding box. */
  const CROP_MARGIN = 40;

  function roundTripFailures(scale: number): string[] {
    const image = poster();
    const failures: string[] = [];

    for (const target of PARK_TARGETS) {
      const crop = cropImage(
        image,
        target.x - CROP_MARGIN,
        target.y - CROP_MARGIN,
        target.width + CROP_MARGIN * 2,
        target.height + CROP_MARGIN * 2,
      );
      const sample = scale === 1 ? crop : upscaleImage(crop, scale);
      const result = decodeSeal(sample);

      if (result.kind !== 'decoded') {
        const detail = result.kind === 'ambiguous' ? ` codes=${result.codes.join(',')}` : '';
        failures.push(`${target.id}: got "${result.kind}"${detail}`);
        continue;
      }
      if (result.code !== target.sealCode) {
        failures.push(`${target.id}: read code ${result.code}, expected ${target.sealCode}`);
        continue;
      }
      if (Math.abs(result.scale - scale) / scale > 0.15) {
        failures.push(
          `${target.id}: reported scale ${result.scale.toFixed(3)}, expected ~${scale}`,
        );
        continue;
      }

      const verdict = buildVerdict(target, result, sample.width, sample.height);
      if (!verdict.success) {
        failures.push(`${target.id}: verdict was ${verdict.kind}`);
      }
    }

    return failures;
  }

  // 1x is the crop a child gets with the viewer at 1:1. 1.25x is the awkward
  // case: a resample by a factor that is not "nice", which is what sub-pixel
  // centroid drift comes from and what used to lose a quarter of all seals.
  for (const scale of [1, 1.25]) {
    it(`decodes every target from a tight crop at ${scale}x`, () => {
      assert.deepEqual(roundTripFailures(scale), []);
    });
  }

  /*
   * Everything above this line only ever tested scale >= 1, and that is exactly
   * why the classroom bug shipped. A child does not start at 1x. On a 1366x768
   * school laptop the park poster opens at about 0.26x, and every test in the
   * suite agreed the poster was fine.
   */

  /**
   * The first scale below 1x at which all fifteen targets decode, measured
   * against the real poster with the shipped geometry.
   *
   * A documented number, not a guess: the bare readable floor is
   * MIN_READABLE_DOT_RADIUS_PX / SEAL_DOT_RADIUS = 0.60x, and at exactly 0.60x
   * only 3 of 15 survive the antialiased rim that the saturation cut eats. At
   * 0.62x all fifteen do.
   *
   * If a geometry change moves this, the change is not automatically wrong -
   * but `READY_TO_CROP_SCALE` has to move with it, and the assertion below is
   * what forces that to be a decision rather than an accident.
   */
  const FIRST_FULLY_DECODABLE_SCALE = 0.62;

  it('decodes nothing below the readable floor and everything just above it', () => {
    const belowFloor = [0.26, 0.3, 0.4, 0.5, 0.55];
    for (const scale of belowFloor) {
      const failures = roundTripFailures(scale);
      assert.equal(
        failures.length,
        PARK_TARGETS.length,
        `${scale}x is below the readable floor, so NOTHING should decode there; ` +
          `${PARK_TARGETS.length - failures.length} target(s) did`,
      );
    }

    assert.deepEqual(
      roundTripFailures(FIRST_FULLY_DECODABLE_SCALE),
      [],
      `${FIRST_FULLY_DECODABLE_SCALE}x is documented as the first fully decodable scale`,
    );
  });

  it('promises the green light no earlier than the poster can actually deliver', () => {
    assert.ok(
      READY_TO_CROP_SCALE >= FIRST_FULLY_DECODABLE_SCALE,
      `the readiness light turns green at ${READY_TO_CROP_SCALE.toFixed(3)}x but the ` +
        `park poster only decodes fully from ${FIRST_FULLY_DECODABLE_SCALE}x: a child ` +
        'would be told "¡Listo!" and then fail',
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The contract that shipped broken                                           */
/* -------------------------------------------------------------------------- */

describe('what a child is told at the zoom the game opens at', () => {
  /** Same generous crop a child takes: the object plus a wide margin. */
  const CROP_MARGIN = 40;

  /**
   * Every verdict the fifteen targets produce at one EFFECTIVE zoom, graded the
   * way the mission screen grades them.
   *
   * `scale` here is the scale the child's screenshot carries - CSS zoom times
   * device pixel ratio - because that is what resamples the poster and what the
   * decoder measures. The same number therefore drives both the resample and
   * the verdict, which is the invariant the whole fix rests on.
   */
  function verdictsAt(scale: number): string[] {
    const image = poster();
    const lies: string[] = [];

    for (const target of PARK_TARGETS) {
      const crop = cropImage(
        image,
        target.x - CROP_MARGIN,
        target.y - CROP_MARGIN,
        target.width + CROP_MARGIN * 2,
        target.height + CROP_MARGIN * 2,
      );
      const sample = scale === 1 ? crop : upscaleImage(crop, scale);
      const verdict = buildVerdict(
        target,
        decodeSeal(sample),
        sample.width,
        sample.height,
        undefined,
        scale,
      );

      /*
       * Only two answers are ever honest.
       *
       * The child found it - or the child is asked to come closer. Anything
       * else at a zoom they did not choose is the game inventing a mistake they
       * did not make: "Esa no es la pista" told a child who searched correctly
       * and cropped correctly that they had found the wrong object.
       */
      if (verdict.success) continue;
      if (verdict.kind === 'TOO_SMALL') continue;
      lies.push(`${scale.toFixed(3)}x ${target.id}: ${verdict.kind} - "${verdict.message}"`);
    }

    return lies;
  }

  /**
   * The effective scales a child climbs through: the opening view, then one per
   * press of "+", with the machine's device pixel ratio applied throughout.
   */
  function zoomLadder(stage: StageBox, rungs: number): number[] {
    const scales: number[] = [];
    let scale = stage.openingScale;
    for (let i = 0; i < rungs; i += 1) {
      scales.push(effectiveCropScale(scale, stage.devicePixelRatio));
      scale = clampScale(scale * BUTTON_ZOOM_STEP);
    }
    return scales;
  }

  for (const stage of MEASURED_STAGES) {
    it(`never blames the child at any zoom reachable on a ${stage.viewport} screen`, () => {
      assert.ok(stage.openingScale > 0, 'the stage fixture has no opening scale');

      const lies: string[] = [];
      for (const scale of zoomLadder(stage, 4)) lies.push(...verdictsAt(scale));

      assert.deepEqual(
        lies,
        [],
        'a wrong-object verdict caused purely by zoom is the classroom bug',
      );
    });
  }

  it('never blames the child at ANY zoom the viewer can reach, fit or not', () => {
    /*
     * The ladder above starts at a measured stage box, and a measured number
     * can go stale. This one does not depend on the chrome at all: it walks the
     * whole range the viewer will let a child sit at, below 1:1, in steps small
     * enough that the cliff at the readable floor cannot hide between two of
     * them. It is the assertion that closes the hole for good.
     */
    const lies: string[] = [];
    for (let scale = MIN_SCALE; scale <= 1.001; scale += 0.05) {
      lies.push(...verdictsAt(Number(scale.toFixed(3))));
    }
    assert.deepEqual(lies, []);
  });

  it('lets the child win the moment the light goes green', () => {
    // The other half of the contract. "Never lie" is satisfied by a game that
    // says "acércate" forever; this is what stops that being the fix.
    const failures = PARK_TARGETS.filter((target) => {
      const image = poster();
      const crop = cropImage(
        image,
        target.x - CROP_MARGIN,
        target.y - CROP_MARGIN,
        target.width + CROP_MARGIN * 2,
        target.height + CROP_MARGIN * 2,
      );
      const sample = upscaleImage(crop, READY_TO_CROP_SCALE);
      const verdict = buildVerdict(
        target,
        decodeSeal(sample),
        sample.width,
        sample.height,
        undefined,
        READY_TO_CROP_SCALE,
      );
      return !verdict.success;
    }).map((target) => target.id);

    assert.ok(isReadyToCrop(READY_TO_CROP_SCALE));
    assert.deepEqual(
      failures,
      [],
      `the light says "¡Listo para recortar!" at ${READY_TO_CROP_SCALE.toFixed(3)}x, ` +
        'so every target must be findable there',
    );
  });
});

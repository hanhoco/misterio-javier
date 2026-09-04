import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  DEFAULT_PARK_SEED,
  PARK_POSTER_HEIGHT,
  PARK_POSTER_WIDTH,
  PARK_TARGETS,
} from '../src/poster/parkPosterData';
import { legendCropWidth, planParkSeals } from '../src/poster/imagePoster';
import { rgbToHsv, sanitizePalette } from '../src/poster/paletteSanitizer';
import { drawSeal } from '../src/poster/posterRenderer';
import { RESERVED_HUES, RESERVED_HUE_TOLERANCE, hueDistance } from '../src/poster/seal';
import { decodeSeal, type ImageDataLike } from '../src/validation/sealDecoder';
import {
  PRECISE_AREA_RATIO,
  buildVerdict,
  computeAreaRatio,
} from '../src/validation/verdict';
import {
  CROP_GUIDE_COLORS,
  CROP_GUIDE_HEX_COLORS,
  GUIDE_AREA_RATIO,
  GUIDE_PRECISION_HEADROOM,
  guideColorChannels,
  isCropGuideVisible,
  isRectInsideViewport,
  preciseCropBox,
  preciseCropMargin,
  toScreenRect,
} from '../src/viewer/cropGuide';
import { READY_TO_CROP_SCALE, effectiveCropScale } from '../src/viewer/zoomReadiness';
import { cropAndResize, cropImage, upscaleImage } from './imageResample';
import { decodePng } from './pngDecoder';
import { SoftwareCanvasContext } from './softwareCanvas';

/* -------------------------------------------------------------------------- */
/* The poster, built once                                                     */
/* -------------------------------------------------------------------------- */

/** The tests are always spawned from the project root, by `run-tests.mjs`. */
const SOURCE_PATH = join(process.cwd(), 'assets', 'park-source.png');

let posterCache: ImageDataLike | null = null;

/**
 * The finished, playable poster.
 *
 * Built the same way `parkPoster.test.ts` builds it, and deliberately built
 * again here rather than shared: `node --test` runs each file in its own
 * process, so a shared fixture would save nothing and would couple the one test
 * that proves the guide teaches the right thing to another file's caching.
 */
function poster(): ImageDataLike {
  if (posterCache) return posterCache;
  const source = decodePng(SOURCE_PATH);
  const resized = cropAndResize(
    source,
    legendCropWidth(source.width),
    PARK_POSTER_WIDTH,
    PARK_POSTER_HEIGHT,
  );
  sanitizePalette(resized);

  const ctx = new SoftwareCanvasContext(PARK_POSTER_WIDTH, PARK_POSTER_HEIGHT);
  ctx.putImageData(resized, 0, 0);
  for (const seal of planParkSeals(DEFAULT_PARK_SEED)) {
    drawSeal(ctx as unknown as CanvasRenderingContext2D, seal.centerX, seal.centerY, seal.code);
  }
  posterCache = ctx.getImageData();
  return posterCache;
}

/* -------------------------------------------------------------------------- */
/* The rectangle itself                                                       */
/* -------------------------------------------------------------------------- */

describe('the crop guide rectangle', () => {
  it('is derived from PRECISE_AREA_RATIO, never typed out', () => {
    // The whole point of the guide is that a child who traces it scores the
    // precision bonus. If someone replaces the derivation with a pixel margin,
    // the guide and the grader drift apart silently and the guide starts
    // teaching a crop the game no longer rewards.
    assert.equal(GUIDE_AREA_RATIO, PRECISE_AREA_RATIO * GUIDE_PRECISION_HEADROOM);
    assert.ok(
      GUIDE_AREA_RATIO < PRECISE_AREA_RATIO,
      'the guide must sit inside the precise budget, not on its boundary',
    );
  });

  it('solves the margin so the box is exactly GUIDE_AREA_RATIO of the target', () => {
    for (const target of PARK_TARGETS) {
      const box = preciseCropBox(target);
      // `scale` of 1: the box is already in poster-native pixels, which is the
      // unit `computeAreaRatio` converts back into.
      const ratio = computeAreaRatio(target, 1, box.width, box.height);
      assert.ok(
        Math.abs(ratio - GUIDE_AREA_RATIO) < 1e-9,
        `${target.id}: guide covers ${ratio.toFixed(4)}x the object, expected ` +
          `${GUIDE_AREA_RATIO.toFixed(4)}x`,
      );
      assert.ok(
        ratio <= PRECISE_AREA_RATIO,
        `${target.id}: guide would not score PRECISE (${ratio.toFixed(3)}x)`,
      );
    }
  });

  it('surrounds the target on all four sides', () => {
    for (const target of PARK_TARGETS) {
      const box = preciseCropBox(target);
      assert.ok(box.x < target.x, `${target.id}: guide does not clear the left edge`);
      assert.ok(box.y < target.y, `${target.id}: guide does not clear the top edge`);
      assert.ok(
        box.x + box.width > target.x + target.width,
        `${target.id}: guide does not clear the right edge`,
      );
      assert.ok(
        box.y + box.height > target.y + target.height,
        `${target.id}: guide does not clear the bottom edge`,
      );
    }
  });

  it('asks for no margin when the ratio buys none', () => {
    assert.equal(preciseCropMargin(100, 100, 1), 0);
    assert.equal(preciseCropMargin(0, 100), 0);
    assert.equal(preciseCropMargin(100, 0), 0);
  });
});

/* -------------------------------------------------------------------------- */
/* The one test that proves the guide teaches the right thing                 */
/* -------------------------------------------------------------------------- */

describe('a child who traces the guide', () => {
  /**
   * The crop the guide asks for, taken at the zoom the green light promises,
   * graded exactly the way the mission screen grades it.
   *
   * `READY_TO_CROP_SCALE` is the worst zoom at which the guide can be on screen
   * at all: below it the light is red and the guide is hidden. If the guide
   * earns the bonus there, it earns it everywhere above.
   */
  function verdictAt(scale: number, targetIndex: number) {
    const target = PARK_TARGETS[targetIndex];
    const box = preciseCropBox(target);
    const crop = cropImage(poster(), box.x, box.y, box.width, box.height);
    const sample = scale === 1 ? crop : upscaleImage(crop, scale);
    return buildVerdict(
      target,
      decodeSeal(sample),
      sample.width,
      sample.height,
      undefined,
      scale,
    );
  }

  for (const scale of [READY_TO_CROP_SCALE, 1, 1.25]) {
    it(`scores PRECISE on every park target at ${scale.toFixed(2)}x`, () => {
      const failures: string[] = [];
      for (let i = 0; i < PARK_TARGETS.length; i += 1) {
        const verdict = verdictAt(scale, i);
        if (verdict.kind === 'PRECISE') continue;
        failures.push(
          `${PARK_TARGETS[i].id}: ${verdict.kind}` +
            (verdict.areaRatio === undefined ? '' : ` at ${verdict.areaRatio.toFixed(2)}x`),
        );
      }
      assert.deepEqual(
        failures,
        [],
        'the guide must earn the precision bonus, not merely pass',
      );
    });
  }
});

/* -------------------------------------------------------------------------- */
/* When it is allowed on screen                                               */
/* -------------------------------------------------------------------------- */

describe('crop guide visibility', () => {
  const viewport = { width: 1024, height: 389 };
  const onScreen = { x: 300, y: 100, width: 120, height: 90 };
  const readyScale = READY_TO_CROP_SCALE;
  const tooFarScale = READY_TO_CROP_SCALE * 0.9;

  const base = {
    guidedMode: true,
    hiddenForSnip: false,
    effectiveScale: readyScale,
    targetRect: onScreen,
    viewport,
  };

  it('is shown only when the target is on screen AND the light is green', () => {
    assert.equal(isCropGuideVisible(base), true);
  });

  it('is hidden while the zoom is below ready, however visible the target is', () => {
    // This is the ordering the detective game rests on: the guide never
    // appears until the child has zoomed in on the object themselves.
    assert.equal(isCropGuideVisible({ ...base, effectiveScale: tooFarScale }), false);
  });

  it('is hidden when the target is off the viewport, however green the light', () => {
    // ...and this is the other half: the guide never says WHERE the object is.
    const offRight = { ...onScreen, x: viewport.width - 10 };
    const offLeft = { ...onScreen, x: -200 };
    const offTop = { ...onScreen, y: -50 };
    const offBottom = { ...onScreen, y: viewport.height - 10 };
    for (const targetRect of [offRight, offLeft, offTop, offBottom]) {
      assert.equal(
        isCropGuideVisible({ ...base, targetRect }),
        false,
        `a target at (${targetRect.x}, ${targetRect.y}) is not fully on screen`,
      );
    }
  });

  it('is hidden the moment the window loses focus, for the snip', () => {
    assert.equal(isCropGuideVisible({ ...base, hiddenForSnip: true }), false);
  });

  it('is hidden in detective mode', () => {
    assert.equal(isCropGuideVisible({ ...base, guidedMode: false }), false);
  });

  it('reads the device pixel ratio through the effective scale', () => {
    // A CSS scale under the threshold on a Retina panel is over it in the
    // screenshot, which is the distinction the whole readiness module exists
    // for. The guide must not reintroduce the bug by looking at the zoom label.
    const cssScale = READY_TO_CROP_SCALE * 0.7;
    assert.equal(
      isCropGuideVisible({ ...base, effectiveScale: effectiveCropScale(cssScale, 1) }),
      false,
    );
    assert.equal(
      isCropGuideVisible({ ...base, effectiveScale: effectiveCropScale(cssScale, 2) }),
      true,
    );
  });

  it('tracks pan and zoom through the viewer transform', () => {
    const target = PARK_TARGETS[0];
    const view = { scale: 0.7, offsetX: -120, offsetY: -30 };
    const rect = toScreenRect(target, view);
    assert.equal(rect.x, target.x * 0.7 - 120);
    assert.equal(rect.y, target.y * 0.7 - 30);
    assert.equal(rect.width, target.width * 0.7);
    assert.equal(rect.height, target.height * 0.7);

    // Panning the same target off the left edge hides the guide.
    const panned = toScreenRect(target, { ...view, offsetX: -100000 });
    assert.equal(isRectInsideViewport(panned, viewport), false);
  });
});

/* -------------------------------------------------------------------------- */
/* Palette safety                                                             */
/* -------------------------------------------------------------------------- */

describe('crop guide colours', () => {
  it('stays outside every reserved seal hue band', () => {
    // The guide is hidden on blur and should never reach a screenshot. This is
    // the belt to that braces: a saturated cyan rectangle that DID land in a
    // crop would hand the decoder a wall of false blobs.
    for (const hex of CROP_GUIDE_HEX_COLORS) {
      const [r, g, b] = guideColorChannels(hex);
      const { h, s, v } = rgbToHsv(r, g, b);
      const offender = RESERVED_HUES.find(
        (reserved) => hueDistance(h, reserved) <= RESERVED_HUE_TOLERANCE,
      );
      assert.equal(
        offender,
        undefined,
        `${hex} sits at hue ${h.toFixed(1)}, inside the reserved band around ${offender}` +
          ` (saturation ${s.toFixed(2)}, value ${v.toFixed(2)})`,
      );
    }
  });

  it('uses a light mark on a dark rail, so it reads over any artwork', () => {
    const [, , railBlue] = guideColorChannels(CROP_GUIDE_COLORS.rail);
    const dash = guideColorChannels(CROP_GUIDE_COLORS.dash);
    const rail = guideColorChannels(CROP_GUIDE_COLORS.rail);
    const luminance = (rgb: readonly number[]) =>
      (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    assert.ok(
      luminance(dash) - luminance(rail) > 0.6,
      'the dashes and their rail must contrast strongly with each other',
    );
    assert.ok(railBlue >= 0, 'rail colour parsed');
  });
});

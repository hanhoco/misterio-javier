import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SEAL_ARM_DISTANCE, SEAL_DOT_RADIUS } from '../src/poster/seal';
import { PARK_POSTER_HEIGHT, PARK_POSTER_WIDTH } from '../src/poster/parkPosterData';
import { MIN_READABLE_DOT_RADIUS_PX } from '../src/validation/sealDecoder';
import {
  BUTTON_ZOOM_STEP,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  computeFitScale,
} from '../src/viewer/viewerGeometry';
import {
  READABLE_FLOOR_SCALE,
  READINESS_SAFETY_MARGIN,
  READY_TO_CROP_SCALE,
  ZOOM_READINESS_COPY,
  effectiveCropScale,
  isReadyToCrop,
  zoomReadiness,
} from '../src/viewer/zoomReadiness';
import {
  MEASURED_STAGES,
  PARK_DESKTOP_STAGE,
  PARK_LAPTOP_SCALED_STAGE,
  PARK_LAPTOP_STAGE,
  PARK_RETINA_STAGE,
  WINDOWS_PIXEL_RATIOS,
  computedFitFor,
  openingEffectiveScaleFor,
  type StageBox,
} from './viewportFixtures';

/* -------------------------------------------------------------------------- */
/* Seal geometry: the constraints the readable floor rests on                 */
/* -------------------------------------------------------------------------- */

describe('seal geometry', () => {
  it('keeps a moat of at least two poster pixels between neighbouring cores', () => {
    // The centre core and an arm core sit this far apart. At one pixel the gap
    // goes sub-pixel on a resample to 0.85x, the cores merge into one blob and
    // the plus-shape is gone. Shrinking either constant without checking this
    // is how seals get lost at a scale nobody happened to test.
    const moat = SEAL_ARM_DISTANCE - 2 * SEAL_DOT_RADIUS;
    assert.ok(
      moat >= 2,
      `moat is ${moat}px: SEAL_ARM_DISTANCE (${SEAL_ARM_DISTANCE}) and ` +
        `SEAL_DOT_RADIUS (${SEAL_DOT_RADIUS}) leave neighbouring cores too close`,
    );
  });

  it('keeps the arm-to-radius ratio inside the decoder’s search window', () => {
    // `ARM_SEARCH_MIN_RADII` / `ARM_SEARCH_MAX_RADII` in sealDecoder.ts.
    const ratio = SEAL_ARM_DISTANCE / SEAL_DOT_RADIUS;
    assert.ok(ratio >= 1.2 && ratio <= 3.5, `arm/radius ratio ${ratio} is outside [1.2, 3.5]`);
  });
});

/* -------------------------------------------------------------------------- */
/* The threshold itself                                                       */
/* -------------------------------------------------------------------------- */

describe('zoom readiness threshold', () => {
  it('is derived from the seal geometry, never typed out', () => {
    // The whole classroom failure was a change to SEAL_DOT_RADIUS that nobody
    // propagated to the zoom the game opens at. This is the assertion that
    // makes the next such change show up here instead of in a classroom.
    assert.equal(READABLE_FLOOR_SCALE, MIN_READABLE_DOT_RADIUS_PX / SEAL_DOT_RADIUS);
  });

  it('tracks SEAL_DOT_RADIUS rather than a frozen number', () => {
    // Recomputed the same way the module does, from the constants as they are
    // right now: if someone replaces the derivation with a literal, the literal
    // and this line stop agreeing the moment the geometry moves again.
    const expectedFloor = MIN_READABLE_DOT_RADIUS_PX / SEAL_DOT_RADIUS;
    assert.equal(READY_TO_CROP_SCALE, expectedFloor * READINESS_SAFETY_MARGIN);
    assert.ok(
      READY_TO_CROP_SCALE > READABLE_FLOOR_SCALE,
      'the green light must sit ABOVE the bare floor, not on it: a child at exactly ' +
        'the floor is told "listo" and then fails',
    );
  });

  it('leaves the green light reachable from a whole-poster fit', () => {
    // A threshold the viewer's own zoom range cannot reach would be a game with
    // no winning move, which is precisely what shipped.
    assert.ok(READY_TO_CROP_SCALE < MAX_SCALE);
    assert.ok(READY_TO_CROP_SCALE > MIN_SCALE);
  });
});

describe('the readiness light', () => {
  it('is red below the threshold', () => {
    for (const scale of [0.15, 0.26, 0.4, READY_TO_CROP_SCALE - 0.001]) {
      assert.equal(zoomReadiness(scale), 'too-far', `${scale}x should be red`);
      assert.equal(isReadyToCrop(scale), false, `${scale}x should not invite a crop`);
    }
  });

  it('is green at the threshold and above', () => {
    for (const scale of [READY_TO_CROP_SCALE, 0.8, 1, 2, 8]) {
      assert.equal(zoomReadiness(scale), 'ready', `${scale}x should be green`);
      assert.equal(isReadyToCrop(scale), true, `${scale}x should invite a crop`);
    }
  });

  it('is crossed by the EFFECTIVE scale, not by the zoom label', () => {
    /*
     * The classroom bug, in two lines. The same CSS zoom is a different answer
     * on a different screen, because `Win + Shift + S` photographs device
     * pixels: 0.4x on the teacher's Retina Mac is 0.8x in the screenshot and
     * decodes; 0.4x on a school laptop is 0.4x and cannot.
     *
     * A light driven by the CSS scale would be green on both, which is worse
     * than no light: the child has been told to trust it.
     */
    const cssScale = 0.4;

    assert.equal(
      isReadyToCrop(effectiveCropScale(cssScale, 2)),
      true,
      'at DPR 2 a CSS scale of 0.4 lands at 0.8x in the screenshot and is ready',
    );
    assert.equal(
      isReadyToCrop(effectiveCropScale(cssScale, 1)),
      false,
      'at DPR 1 the same 0.4 cannot possibly be read, and the light must say so',
    );
  });

  it('answers every device pixel ratio Windows display scaling produces', () => {
    // 100%, 125%, 150% and a Retina panel. A school can have all four in one
    // room and did.
    for (const ratio of WINDOWS_PIXEL_RATIOS) {
      // Just under the floor once the ratio is applied...
      const tooFar = (READY_TO_CROP_SCALE - 0.02) / ratio;
      assert.equal(
        zoomReadiness(effectiveCropScale(tooFar, ratio)),
        'too-far',
        `DPR ${ratio}: ${tooFar.toFixed(3)} CSS should still be red`,
      );

      // ...and just over it.
      const ready = (READY_TO_CROP_SCALE + 0.02) / ratio;
      assert.equal(
        zoomReadiness(effectiveCropScale(ready, ratio)),
        'ready',
        `DPR ${ratio}: ${ready.toFixed(3)} CSS should be green`,
      );
    }
  });

  it('treats a missing or nonsensical device pixel ratio as 1', () => {
    // A ratio the browser could not give us must never inflate the effective
    // scale: guessing high is how a child gets a green light they cannot use.
    for (const broken of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(effectiveCropScale(0.5, broken), 0.5, `DPR ${broken} was trusted`);
    }
  });

  it('says something a seven year old can act on, in both states', () => {
    const far = ZOOM_READINESS_COPY['too-far'];
    const ready = ZOOM_READINESS_COPY.ready;

    assert.equal(far.badge, '\u{1F534}');
    assert.equal(ready.badge, '\u{1F7E2}');
    // The red state must name the remedy, not just the problem.
    assert.match(far.hint, /Acércate/);
    assert.notEqual(far.label, ready.label);
    for (const copy of [far, ready]) {
      assert.ok(copy.label.length > 0 && copy.label.length <= 32, copy.label);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Where the child actually starts                                            */
/* -------------------------------------------------------------------------- */

describe('the zoom the viewer opens at', () => {
  it('fits the whole poster inside the viewport', () => {
    const scale = computeFitScale(1000, 400, 3000, 1809);
    assert.ok(3000 * scale <= 1000 + 1e-9);
    assert.ok(1809 * scale <= 400 + 1e-9);
    // The limiting dimension wins, and here that is the height.
    assert.equal(scale, 400 / 1809);
  });

  it('refuses to guess a fit against a container with no size', () => {
    // A viewer built before its container is in the document measures zero, and
    // a "fit" against nothing is what once opened a 900px picture at 0.15x.
    assert.equal(computeFitScale(0, 400, 3000, 1809), 0);
    assert.equal(computeFitScale(1000, 0, 3000, 1809), 0);
    assert.equal(computeFitScale(1000, 400, 0, 1809), 0);
  });

  it('explains the "works on one computer, fails on twenty-eight" report', () => {
    /*
     * The teacher assumed concurrency. It cannot be: the app is static files on
     * GitHub Pages, so twenty-eight children are twenty-eight independent
     * copies and none can affect another. What differed was the screen the
     * demonstration happened to be given on.
     */
    const retina = openingEffectiveScaleFor(PARK_RETINA_STAGE);
    const laptop = openingEffectiveScaleFor(PARK_LAPTOP_STAGE);

    assert.equal(
      isReadyToCrop(retina),
      true,
      `the teacher's Retina Mac opens at ${retina.toFixed(2)}x effective, which is why ` +
        'the game appeared to work',
    );
    assert.equal(
      isReadyToCrop(laptop),
      false,
      `a school laptop opens at ${laptop.toFixed(2)}x effective, which is why it did not`,
    );

    // Same window and same CSS zoom on the Retina machine as on the plain one,
    // so the panel is the only thing left to explain the difference.
    assert.equal(PARK_RETINA_STAGE.openingScale, PARK_DESKTOP_STAGE.openingScale);
    assert.equal(
      openingEffectiveScaleFor(PARK_RETINA_STAGE),
      openingEffectiveScaleFor(PARK_DESKTOP_STAGE) * PARK_RETINA_STAGE.devicePixelRatio,
    );
  });

  it('lets Windows display scaling alone decide the answer on identical laptops', () => {
    assert.equal(PARK_LAPTOP_STAGE.openingScale, PARK_LAPTOP_SCALED_STAGE.openingScale);
    assert.ok(
      openingEffectiveScaleFor(PARK_LAPTOP_SCALED_STAGE) >
        openingEffectiveScaleFor(PARK_LAPTOP_STAGE),
      'display scaling must raise the effective scale, or the model is wrong',
    );
  });

  it('opens the park poster on a school laptop BELOW the readable floor', () => {
    /*
     * This is the bug, stated as a fact rather than a hope.
     *
     * The park poster is 3000px wide and cannot fit inside a 1366x768 laptop's
     * stage and still be readable. So the opening view is below the floor and
     * always will be, which is exactly why the readiness light has to exist:
     * the fix was never "make the opening view readable", it is "tell the
     * child, before they spend a crop on it".
     */
    const opening = openingEffectiveScaleFor(PARK_LAPTOP_STAGE);

    assert.ok(opening > 0, 'the fixture has no opening scale');
    assert.equal(zoomReadiness(opening), 'too-far');
    assert.equal(isReadyToCrop(opening), false);
  });

  it('records an opening scale that agrees with the viewer’s own fit maths', () => {
    /*
     * The fixtures carry a MEASURED opening scale, because the viewer fits once
     * on the first resize that gives it a size and the page keeps settling for
     * a few frames afterwards - so the poster opens a little larger than a fit
     * against the final canvas box would give.
     *
     * A loose band, not an equality: tight enough that a fixture which has
     * drifted away from the application stops being believed, loose enough to
     * survive that settling.
     */
    for (const stage of MEASURED_STAGES) {
      const computed = computedFitFor(stage);
      const ratio = stage.openingScale / computed;
      assert.ok(
        ratio > 0.85 && ratio < 1.15,
        `${stage.viewport}: measured opening ${stage.openingScale} is ${ratio.toFixed(2)}x ` +
          `the fit computed from its canvas box (${computed.toFixed(4)}); the fixture ` +
          'has probably gone stale against the real application',
      );
    }
  });

  /** How many presses of "+" it takes to go green, from a machine's opening view. */
  function pressesToGreen(stage: StageBox): number {
    let scale = stage.openingScale;
    let presses = 0;
    while (!isReadyToCrop(effectiveCropScale(scale, stage.devicePixelRatio)) && presses < 12) {
      scale = clampScale(scale * BUTTON_ZOOM_STEP);
      presses += 1;
    }
    return presses;
  }

  it('reaches a readable zoom from the opening view, on every machine measured', () => {
    /*
     * The original complaint was that a child had to guess three unprompted
     * presses of "+". The presses are not the bug - the guessing was, and the
     * readiness light removes it: the child presses "+" until it turns green.
     *
     * What must still hold is that the button can get there AT ALL, and in a
     * handful of presses rather than a dozen. A threshold the "+" button cannot
     * reach would be the shipped bug with a traffic light on top of it.
     */
    for (const stage of MEASURED_STAGES) {
      const presses = pressesToGreen(stage);
      assert.ok(
        presses <= 3,
        `${stage.viewport}: ${presses} presses of "+" from an opening view of ` +
          `${stage.openingScale}x (DPR ${stage.devicePixelRatio}); the budget is 3`,
      );
    }
  });

  it('needs no presses at all on the machine the teacher demonstrated on', () => {
    // Which is exactly why the bug survived a demonstration and reached a class.
    assert.equal(pressesToGreen(PARK_RETINA_STAGE), 0);
    assert.ok(pressesToGreen(PARK_LAPTOP_STAGE) > 0);
  });
});

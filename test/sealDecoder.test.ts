import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { POSTER_OBJECTS, findObjectById, type PosterObject } from '../src/poster/posterData';
import { SEAL_CODE_COUNT, decodeSealCode, encodeSealCode } from '../src/poster/seal';
import { decodeSeal, decodeSealWithDiagnostics } from '../src/validation/sealDecoder';
import { buildVerdict } from '../src/validation/verdict';
import { rasterizeEmptyScene, rasterizeSeals, rasterizeSingleSeal } from './sealRasterizer';

/**
 * The decoder needs a dot radius of at least `MIN_READABLE_DOT_RADIUS_PX` (3),
 * and `SEAL_DOT_RADIUS` is 4, so a seal stops resolving below 3/4 = 0.75x.
 * 0.8x is the first tested scale that clears that floor with room for the
 * antialiased rim the saturation cut eats.
 *
 * This floor is deliberate. Seals were halved so they stop defacing the
 * illustration, and the higher floor is the point: it forces the child to zoom
 * in before a crop can be read, which is the skill the exercise teaches. Below
 * it the decoder must say `too-small` ("acércate un poco más"), never guess -
 * `refuses to guess below the readable floor` is the test that guards that.
 */
const ROUND_TRIP_SCALES = [0.8, 1, 2, 3];

describe('seal code encoding', () => {
  it('round-trips every code through its digits', () => {
    for (let code = 0; code < SEAL_CODE_COUNT; code += 1) {
      assert.equal(encodeSealCode(decodeSealCode(code)), code);
    }
  });

  it('gives every poster object a distinct code', () => {
    const codes = new Set(POSTER_OBJECTS.map((object) => object.sealCode));
    assert.equal(codes.size, POSTER_OBJECTS.length);
  });
});

describe('sealDecoder', () => {
  for (const scale of ROUND_TRIP_SCALES) {
    it(`decodes every poster seal at ${scale}x`, () => {
      for (const object of POSTER_OBJECTS) {
        const image = rasterizeSingleSeal(object.sealCode, scale);
        const result = decodeSeal(image);
        assert.equal(
          result.kind,
          'decoded',
          `${object.id} at ${scale}x produced "${result.kind}"`,
        );
        if (result.kind !== 'decoded') return;
        assert.equal(result.code, object.sealCode, `${object.id} at ${scale}x`);
        // Scale is derived from the measured arm distance; allow 12% slack for
        // the antialiased edges of the dots.
        assert.ok(
          Math.abs(result.scale - scale) / scale < 0.12,
          `${object.id}: expected scale ~${scale}, got ${result.scale.toFixed(3)}`,
        );
      }
    });
  }

  it('refuses to guess below the readable floor', () => {
    // 0.5x puts the dot radius at 2px, under MIN_READABLE_DOT_RADIUS_PX. The
    // decoder must ask the child to zoom in rather than risk a wrong code: a
    // false "that is not the clue" is recoverable, a false accept is not.
    for (const object of POSTER_OBJECTS) {
      const result = decodeSeal(rasterizeSingleSeal(object.sealCode, 0.5));
      assert.equal(
        result.kind,
        'too-small',
        `${object.id} at 0.5x produced "${result.kind}", expected "too-small"`,
      );
    }
  });

  it('decodes a seal whose five dots all share one colour', () => {
    // Worst case for connected components: adjacent same-coloured cores are
    // only one poster pixel apart, separated purely by the ring.
    for (let color = 0; color < 4; color += 1) {
      const code = encodeSealCode([color, color, color, color, color]);
      const result = decodeSeal(rasterizeSingleSeal(code, 2));
      assert.equal(result.kind, 'decoded', `uniform colour ${color} produced "${result.kind}"`);
      if (result.kind === 'decoded') assert.equal(result.code, code);
    }
  });

  it('reports no-seal on plain background', () => {
    assert.equal(decodeSeal(rasterizeEmptyScene(300, 200)).kind, 'no-seal');
  });

  it('reports too-small when the seal is below readable size', () => {
    // 0.6x puts the dot radius at 2.4px: over MIN_BLOB_RADIUS_PX so the blobs
    // are still found, under MIN_READABLE_DOT_RADIUS_PX so the seal must not be
    // read. That band is what "acércate un poco más" exists for.
    const result = decodeSeal(rasterizeSingleSeal(POSTER_OBJECTS[0].sealCode, 0.6));
    assert.equal(result.kind, 'too-small', `expected too-small, got "${result.kind}"`);
  });

  it('never invents a code at any scale, however small', () => {
    // Far below readable the dots stop being blobs at all and the honest answer
    // becomes "no-seal" rather than "too-small". Either is fine; a decoded code
    // is not. A wrong accept sends a child away believing a wrong crop was right.
    for (const scale of [0.1, 0.2, 0.25, 0.3, 0.4]) {
      const result = decodeSeal(rasterizeSingleSeal(POSTER_OBJECTS[0].sealCode, scale));
      assert.notEqual(result.kind, 'decoded', `decoded a seal at ${scale}x, which is guessing`);
    }
  });

  it('reports every code when the crop holds more than one seal', () => {
    const [first, second] = POSTER_OBJECTS;
    const image = rasterizeSeals(
      [
        { code: first.sealCode, centerX: 90, centerY: 110 },
        { code: second.sealCode, centerX: 330, centerY: 110 },
      ],
      2,
      420,
      220,
    );
    const result = decodeSeal(image);
    assert.equal(result.kind, 'ambiguous', `expected ambiguous, got "${result.kind}"`);
    if (result.kind !== 'ambiguous') return;
    assert.deepEqual([...result.codes].sort((a, b) => a - b), [first.sealCode, second.sealCode].sort((a, b) => a - b));
  });

  it('ignores the analysis downscale when reporting scale', () => {
    // Force the >1600px path and check the reported scale is in crop pixels.
    const scale = 2;
    const image = rasterizeSeals(
      [{ code: POSTER_OBJECTS[0].sealCode, centerX: 900, centerY: 500 }],
      scale,
      1800,
      1000,
    );
    const report = decodeSealWithDiagnostics(image);
    assert.ok(report.diagnostics.pixelScale < 1, 'expected the image to be downscaled');
    assert.equal(report.result.kind, 'decoded');
    if (report.result.kind !== 'decoded') return;
    assert.equal(report.result.code, POSTER_OBJECTS[0].sealCode);
    assert.ok(
      Math.abs(report.result.scale - scale) / scale < 0.15,
      `expected scale ~${scale}, got ${report.result.scale.toFixed(3)}`,
    );
  });
});

function requireObject(id: string): PosterObject {
  const object = findObjectById(id);
  if (!object) throw new Error(`Unknown poster object: ${id}`);
  return object;
}

describe('verdict', () => {
  const target = requireObject('red-cap');
  const other = requireObject('book');

  it('calls a tight crop precise', () => {
    const scale = 2;
    const cropWidth = target.width * scale;
    const cropHeight = target.height * scale;
    const verdict = buildVerdict(
      target,
      { kind: 'decoded', code: target.sealCode, scale, armDistancePx: 30, dotRadiusPx: 14 },
      cropWidth,
      cropHeight,
    );
    assert.equal(verdict.kind, 'PRECISE');
    assert.equal(verdict.success, true);
  });

  it('calls a wide crop loose', () => {
    const scale = 2;
    const verdict = buildVerdict(
      target,
      { kind: 'decoded', code: target.sealCode, scale, armDistancePx: 30, dotRadiusPx: 14 },
      target.width * scale * 3,
      target.height * scale * 3,
    );
    assert.equal(verdict.kind, 'LOOSE');
  });

  it('rejects another object’s seal', () => {
    const verdict = buildVerdict(
      target,
      { kind: 'decoded', code: other.sealCode, scale: 2, armDistancePx: 30, dotRadiusPx: 14 },
      400,
      300,
    );
    assert.equal(verdict.kind, 'WRONG_OBJECT');
    assert.equal(verdict.success, false);
    assert.equal(verdict.capturedObjectName, other.name);
  });

  it('maps decoder failures to child-friendly messages', () => {
    assert.equal(buildVerdict(target, { kind: 'no-seal' }, 10, 10).kind, 'NO_SEAL');
    assert.equal(buildVerdict(target, { kind: 'too-small' }, 10, 10).kind, 'TOO_SMALL');
    // The `ambiguous` variant now carries per-seal measurements, because with
    // decoy seals on the poster a multi-seal crop is the ordinary case.
    assert.equal(
      buildVerdict(
        target,
        {
          kind: 'ambiguous',
          codes: [other.sealCode, 7],
          seals: [
            { code: other.sealCode, scale: 2, armDistancePx: 30, dotRadiusPx: 14 },
            { code: 7, scale: 2, armDistancePx: 30, dotRadiusPx: 14 },
          ],
        },
        10,
        10,
      ).kind,
      'AMBIGUOUS',
    );
  });

  it('counts the target as found when it is one of several seals in the crop', () => {
    const scale = 2;
    const verdict = buildVerdict(
      target,
      {
        kind: 'ambiguous',
        codes: [913, target.sealCode, 41],
        seals: [
          { code: 913, scale: 1.4, armDistancePx: 21, dotRadiusPx: 10 },
          { code: target.sealCode, scale, armDistancePx: 30, dotRadiusPx: 14 },
          { code: 41, scale: 1.9, armDistancePx: 28.5, dotRadiusPx: 13 },
        ],
      },
      target.width * scale,
      target.height * scale,
    );

    assert.equal(verdict.success, true, verdict.message);
    assert.equal(verdict.kind, 'PRECISE');
    assert.equal(verdict.code, target.sealCode);
    // The target's own seal supplied the scale, not the first seal in the list.
    assert.equal(verdict.scale, scale);
  });
});

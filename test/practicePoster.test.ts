import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COPY_DRILL_SEAL_CODE,
  CROP_DRILL_SEAL_CODE,
  TRAINING_SEAL_CODE,
} from '../src/game/missions';
import { isDecodableSignal, rgbToHsv } from '../src/poster/paletteSanitizer';
import {
  PRACTICE_CARD_SIZE,
  PRACTICE_POSTER_HEIGHT,
  PRACTICE_POSTER_WIDTH,
  renderPracticeCard,
  renderPracticePoster,
  type PracticePoster,
  type PracticeShape,
} from '../src/poster/practicePoster';
import { SEAL_FOOTPRINT } from '../src/poster/seal';
import { decodeSeal, type ImageDataLike } from '../src/validation/sealDecoder';
import { buildVerdict } from '../src/validation/verdict';
import { cropImage } from './imageResample';
import { contextOf, installSoftwareCanvas } from './softwareCanvas';

/**
 * Renders a practice picture on the software rasteriser.
 *
 * This is the point of the whole file: the drills claim to run on the same
 * decoder as the real missions, and the only way to know that is to put a real
 * rendered picture through the real decoder.
 */
function render(
  build: (options: {
    shape: PracticeShape;
    sealCode: number;
    name: string;
  }) => PracticePoster,
  shape: PracticeShape,
  sealCode: number,
): { image: ImageDataLike; poster: PracticePoster } {
  const canvas = installSoftwareCanvas();
  try {
    const poster = build({ shape, sealCode, name: 'la figura' });
    return { image: contextOf(poster.canvas).getImageData(), poster };
  } finally {
    canvas.restore();
  }
}

const FULL_SIZE_CASES = [
  { label: 'training ball', shape: 'ball' as const, code: TRAINING_SEAL_CODE },
  { label: 'crop drill star', shape: 'star' as const, code: CROP_DRILL_SEAL_CODE },
  { label: 'copy drill heart', shape: 'heart' as const, code: COPY_DRILL_SEAL_CODE },
];

describe('practice pictures', () => {
  it('render at the declared size', () => {
    const { image } = render(renderPracticePoster, 'ball', TRAINING_SEAL_CODE);
    assert.equal(image.width, PRACTICE_POSTER_WIDTH);
    assert.equal(image.height, PRACTICE_POSTER_HEIGHT);

    const card = render(renderPracticeCard, 'heart', COPY_DRILL_SEAL_CODE);
    assert.equal(card.image.width, PRACTICE_CARD_SIZE);
    assert.equal(card.image.height, PRACTICE_CARD_SIZE);
  });

  for (const testCase of FULL_SIZE_CASES) {
    it(`puts no seal-coloured pixel outside the seal on the ${testCase.label}`, () => {
      const { image, poster } = render(renderPracticePoster, testCase.shape, testCase.code);
      const centerX = poster.target.x + poster.target.width / 2;
      const centerY = poster.target.y + poster.target.height / 2;
      const guard = SEAL_FOOTPRINT;

      const offenders: string[] = [];
      for (let y = 0; y < image.height && offenders.length < 8; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          // Skip the seal itself: it is supposed to be a decodable signal.
          if (Math.abs(x - centerX) <= guard && Math.abs(y - centerY) <= guard) continue;
          const i = (y * image.width + x) * 4;
          const { h, s, v } = rgbToHsv(image.data[i], image.data[i + 1], image.data[i + 2]);
          if (isDecodableSignal(h, s, v)) {
            offenders.push(`(${x},${y}) hue ${h.toFixed(1)} sat ${s.toFixed(3)}`);
            break;
          }
        }
      }

      assert.deepEqual(offenders, [], 'artwork survived inside a reserved seal band');
    });

    it(`decodes the ${testCase.label}'s own seal from a crop of the object`, () => {
      const { image, poster } = render(renderPracticePoster, testCase.shape, testCase.code);
      const margin = 40;
      const crop = cropImage(
        image,
        poster.target.x - margin,
        poster.target.y - margin,
        poster.target.width + margin * 2,
        poster.target.height + margin * 2,
      );

      const result = decodeSeal(crop);
      assert.equal(result.kind, 'decoded', `decoder said "${result.kind}"`);
      if (result.kind !== 'decoded') return;
      assert.equal(result.code, testCase.code);
      assert.equal(result.code, poster.target.sealCode);

      const verdict = buildVerdict(
        poster.target,
        result,
        crop.width,
        crop.height,
        (code) => (code === poster.target.sealCode ? poster.target : undefined),
      );
      assert.equal(verdict.success, true, `verdict was ${verdict.kind}`);
    });
  }

  it('decodes the copy drill card when the whole card is pasted', () => {
    const { image, poster } = render(renderPracticeCard, 'heart', COPY_DRILL_SEAL_CODE);

    const result = decodeSeal(image);
    assert.equal(result.kind, 'decoded', `decoder said "${result.kind}"`);
    if (result.kind !== 'decoded') return;
    assert.equal(result.code, COPY_DRILL_SEAL_CODE);

    // A copy travels at native resolution, so the whole card is the paste.
    const verdict = buildVerdict(
      poster.target,
      result,
      image.width,
      image.height,
      (code) => (code === poster.target.sealCode ? poster.target : undefined),
    );
    assert.equal(verdict.success, true, `verdict was ${verdict.kind}`);
  });

  it('rejects a crop of a practice picture against a different drill code', () => {
    const { image, poster } = render(renderPracticePoster, 'star', CROP_DRILL_SEAL_CODE);
    const crop = cropImage(
      image,
      poster.target.x,
      poster.target.y,
      poster.target.width,
      poster.target.height,
    );
    const result = decodeSeal(crop);
    assert.equal(result.kind, 'decoded');
    if (result.kind !== 'decoded') return;

    // The copy drill's target must not accept the crop drill's picture.
    const otherTarget = { ...poster.target, sealCode: COPY_DRILL_SEAL_CODE };
    const verdict = buildVerdict(otherTarget, result, crop.width, crop.height, () => undefined);
    assert.equal(verdict.success, false);
    assert.equal(verdict.kind, 'WRONG_OBJECT');
  });
});

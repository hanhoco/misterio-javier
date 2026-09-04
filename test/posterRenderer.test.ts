import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { POSTER_OBJECTS, objectCenter } from '../src/poster/posterData';
import {
  SEAL_COLORS,
  SEAL_DOT_OFFSETS,
  SEAL_DOT_RADIUS,
  decodeSealCode,
} from '../src/poster/seal';
import { renderPoster } from '../src/poster/posterRenderer';
import { installCanvasStub } from './canvasStub';

describe('posterRenderer', () => {
  it('renders without ever asking for a reserved hue, and seals every object', () => {
    const stub = installCanvasStub();
    try {
      // `sceneColor` throws if any illustration hue lands inside a reserved
      // band, so simply completing this call is the constraint check.
      renderPoster();

      for (const object of POSTER_OBJECTS) {
        const center = objectCenter(object);
        const digits = decodeSealCode(object.sealCode);

        SEAL_DOT_OFFSETS.forEach((offset, index) => {
          const expectedColor = SEAL_COLORS[digits[index]];
          const match = stub.context.arcs.find(
            (arc) =>
              arc.radius === SEAL_DOT_RADIUS &&
              arc.x === center.x + offset.dx &&
              arc.y === center.y + offset.dy &&
              arc.fillStyle === expectedColor,
          );
          assert.ok(
            match,
            `${object.id}: missing dot ${index} (${expectedColor}) at the object centre`,
          );
        });
      }
    } finally {
      stub.restore();
    }
  });
});

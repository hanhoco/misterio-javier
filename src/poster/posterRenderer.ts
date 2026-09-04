/**
 * Draws the poster procedurally: a dense, head-on building facade packed with
 * hundreds of little people, with the eight findable objects and a scattering
 * of decoy seals stamped on top.
 *
 * There is no external art in this repo and we need exact metadata, so the
 * whole scene is canvas primitives. Layout comes from `posterData.ts` and
 * `facade.ts`; this module never invents coordinates of its own.
 */

import {
  DECOY_EXCLUSION_RADIUS,
  DEFAULT_POSTER_SEED,
  MIN_SEAL_SEPARATION,
  POSTER_HEIGHT,
  POSTER_OBJECTS,
  POSTER_WIDTH,
  buildDecoyCodes,
  objectCenter,
  type PosterObject,
} from './posterData';
import { buildCrowd, drawCrowdFigure, splitCrowdByLayer } from './crowd';
import { planSeals, type StampedSeal } from './sealPlacement';
import { buildFacade, drawFacadeBack, drawFacadeFront } from './facade';
import { outlined, outlinedEllipse } from './draw';
import { createRandom, randomBetween, shuffled } from './random';
import { SMOKE_COLOR, sceneColor } from './sceneColor';
import {
  SEAL_COLORS,
  SEAL_DOT_OFFSETS,
  SEAL_DOT_OUTER_RADIUS,
  SEAL_DOT_RADIUS,
  SEAL_FOOTPRINT,
  SEAL_RING_COLOR,
  decodeSealCode,
} from './seal';

export { MAX_SCENE_SATURATION, sceneColor } from './sceneColor';

/* -------------------------------------------------------------------------- */
/* Seal stamping                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Stamps a seal centred on (centerX, centerY).
 *
 * All five rings are painted first, then all five coloured cores on top. That
 * order matters: at the nominal geometry neighbouring cores are only 1px
 * apart, and drawing ring-then-core per dot would let a later ring eat into an
 * earlier core.
 */
export function drawSeal(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  code: number,
  scale = 1,
): void {
  const digits = decodeSealCode(code);

  ctx.save();
  ctx.fillStyle = SEAL_RING_COLOR;
  for (const offset of SEAL_DOT_OFFSETS) {
    ctx.beginPath();
    ctx.arc(
      centerX + offset.dx * scale,
      centerY + offset.dy * scale,
      SEAL_DOT_OUTER_RADIUS * scale,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  SEAL_DOT_OFFSETS.forEach((offset, index) => {
    ctx.fillStyle = SEAL_COLORS[digits[index]];
    ctx.beginPath();
    ctx.arc(
      centerX + offset.dx * scale,
      centerY + offset.dy * scale,
      SEAL_DOT_RADIUS * scale,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  });
  ctx.restore();
}

/* -------------------------------------------------------------------------- */
/* Seal planning                                                              */
/* -------------------------------------------------------------------------- */

export type { StampedSeal };

/** Half a seal's footprint plus a little slack: no seal may straddle an edge. */
const SEAL_EDGE_MARGIN = SEAL_FOOTPRINT / 2 + 8;

/**
 * Decides every seal on the poster: the eight targets at their object centres,
 * then decoys on randomly chosen crowd figures.
 *
 * Two placement rules, both load bearing:
 *   - no decoy within `DECOY_EXCLUSION_RADIUS` of a target, so a tight crop
 *     around a target reads cleanly;
 *   - no two seals within `MIN_SEAL_SEPARATION`, so the decoder never mistakes
 *     one seal's dot for another seal's arm.
 */
export function planPosterSeals(seed: number = DEFAULT_POSTER_SEED): StampedSeal[] {
  const targets: StampedSeal[] = POSTER_OBJECTS.map((object) => {
    const center = objectCenter(object);
    return { code: object.sealCode, centerX: center.x, centerY: center.y, isTarget: true };
  });

  const random = createRandom(seed ^ 0xd0c0);

  return planSeals({
    targets,
    decoyCodes: buildDecoyCodes(seed),
    // Decoys ride on crowd figures: a coloured dot on a person reads as part of
    // the illustration, one floating on empty wall reads as a target marker.
    candidates: shuffled(random, buildCrowd(seed)).map((figure) => ({
      x: figure.sealX,
      y: figure.sealY,
    })),
    posterWidth: POSTER_WIDTH,
    posterHeight: POSTER_HEIGHT,
    edgeMargin: SEAL_EDGE_MARGIN,
    minSeparation: MIN_SEAL_SEPARATION,
    isClearOfTargets: (x, y) =>
      !targets.some(
        (target) => Math.hypot(target.centerX - x, target.centerY - y) < DECOY_EXCLUSION_RADIUS,
      ),
  });
}

/* -------------------------------------------------------------------------- */
/* Smoke                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A handful of off-white blobs. They are the only place the eye can rest, and
 * without them the density stops reading as deliberate and starts reading as
 * noise. Zero saturation, so they are invisible to the decoder.
 */
function drawSmoke(ctx: CanvasRenderingContext2D, seed: number): void {
  const random = createRandom(seed ^ 0x5e0be0);
  const blobCount = 4;
  for (let blob = 0; blob < blobCount; blob += 1) {
    const cx = randomBetween(random, 180, POSTER_WIDTH - 180);
    const cy = randomBetween(random, 150, 900);
    const spread = randomBetween(random, 90, 150);
    const lobes = 6 + Math.floor(random() * 4);
    for (let lobe = 0; lobe < lobes; lobe += 1) {
      const angle = (lobe / lobes) * Math.PI * 2;
      outlinedEllipse(
        ctx,
        cx + Math.cos(angle) * spread * randomBetween(random, 0.3, 0.8),
        cy + Math.sin(angle) * spread * randomBetween(random, 0.18, 0.45),
        spread * randomBetween(random, 0.42, 0.68),
        spread * randomBetween(random, 0.3, 0.5),
        SMOKE_COLOR,
        3,
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Objects                                                                    */
/* -------------------------------------------------------------------------- */

const OBJECT_OUTLINE_WIDTH = 3;

function objectShape(
  ctx: CanvasRenderingContext2D,
  buildPath: () => void,
  fill: string,
): void {
  outlined(ctx, buildPath, fill, OBJECT_OUTLINE_WIDTH);
}

/** Each object is drawn inside the bounding box declared in `posterData.ts`. */
function drawObject(ctx: CanvasRenderingContext2D, object: PosterObject): void {
  const { x, y, width: w, height: h } = object;

  switch (object.id) {
    case 'red-cap': {
      // Hue 355 sits well clear of the orange band [14, 44].
      objectShape(ctx, () => {
        ctx.ellipse(x + w * 0.45, y + h * 0.62, w * 0.36, h * 0.55, 0, Math.PI, 0);
        ctx.closePath();
      }, sceneColor(355, 0.5, 0.5));
      objectShape(ctx, () => {
        ctx.ellipse(x + w * 0.72, y + h * 0.62, w * 0.3, h * 0.16, 0, 0, Math.PI * 2);
      }, sceneColor(355, 0.5, 0.42));
      break;
    }

    case 'book': {
      objectShape(ctx, () => ctx.rect(x, y, w, h), sceneColor(265, 0.45, 0.5));
      ctx.fillStyle = sceneColor(50, 0.3, 0.95);
      ctx.fillRect(x + w * 0.5, y + h * 0.08, w * 0.46, h * 0.84);
      ctx.strokeStyle = sceneColor(230, 0.3, 0.2);
      ctx.lineWidth = OBJECT_OUTLINE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y);
      ctx.lineTo(x + w * 0.5, y + h);
      ctx.stroke();
      break;
    }

    case 'backpack': {
      objectShape(ctx, () => {
        ctx.roundRect(x, y + h * 0.2, w, h * 0.8, 22);
      }, sceneColor(205, 0.5, 0.45));
      objectShape(ctx, () => {
        ctx.roundRect(x + w * 0.18, y, w * 0.64, h * 0.34, 16);
      }, sceneColor(205, 0.5, 0.38));
      ctx.fillStyle = sceneColor(50, 0.35, 0.8);
      ctx.fillRect(x + w * 0.16, y + h * 0.6, w * 0.68, h * 0.18);
      break;
    }

    case 'cat': {
      objectShape(ctx, () => {
        ctx.ellipse(x + w * 0.55, y + h * 0.68, w * 0.4, h * 0.3, 0, 0, Math.PI * 2);
      }, sceneColor(50, 0.45, 0.5));
      objectShape(ctx, () => {
        ctx.arc(x + w * 0.26, y + h * 0.38, Math.min(w, h) * 0.26, 0, Math.PI * 2);
      }, sceneColor(50, 0.45, 0.58));
      objectShape(ctx, () => {
        ctx.moveTo(x + w * 0.08, y + h * 0.24);
        ctx.lineTo(x + w * 0.14, y + h * 0.02);
        ctx.lineTo(x + w * 0.26, y + h * 0.2);
        ctx.closePath();
      }, sceneColor(50, 0.45, 0.58));
      objectShape(ctx, () => {
        ctx.moveTo(x + w * 0.32, y + h * 0.19);
        ctx.lineTo(x + w * 0.46, y + h * 0.02);
        ctx.lineTo(x + w * 0.48, y + h * 0.26);
        ctx.closePath();
      }, sceneColor(50, 0.45, 0.58));
      break;
    }

    case 'clock': {
      objectShape(ctx, () => {
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
      }, sceneColor(50, 0.4, 0.9));
      ctx.strokeStyle = sceneColor(230, 0.3, 0.2);
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + h / 2);
      ctx.lineTo(x + w / 2, y + h * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + h / 2);
      ctx.lineTo(x + w * 0.76, y + h * 0.58);
      ctx.stroke();
      ctx.lineCap = 'butt';
      break;
    }

    case 'key': {
      objectShape(ctx, () => {
        ctx.arc(x + h * 0.5, y + h * 0.5, h * 0.42, 0, Math.PI * 2);
      }, sceneColor(48, 0.45, 0.62));
      objectShape(ctx, () => {
        ctx.rect(x + h * 0.85, y + h * 0.38, w - h * 0.9, h * 0.24);
      }, sceneColor(48, 0.45, 0.62));
      objectShape(ctx, () => {
        ctx.rect(x + w * 0.78, y + h * 0.6, w * 0.08, h * 0.28);
      }, sceneColor(48, 0.45, 0.62));
      break;
    }

    case 'ball': {
      objectShape(ctx, () => {
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
      }, sceneColor(50, 0.3, 0.95));
      ctx.fillStyle = sceneColor(230, 0.35, 0.25);
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(
          x + w / 2 + Math.cos(angle) * w * 0.28,
          y + h / 2 + Math.sin(angle) * h * 0.28,
          Math.min(w, h) * 0.09,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      break;
    }

    case 'plant': {
      objectShape(ctx, () => {
        ctx.moveTo(x + w * 0.24, y + h * 0.62);
        ctx.lineTo(x + w * 0.76, y + h * 0.62);
        ctx.lineTo(x + w * 0.68, y + h);
        ctx.lineTo(x + w * 0.32, y + h);
        ctx.closePath();
      }, sceneColor(350, 0.45, 0.55));
      for (let i = -1; i <= 1; i += 1) {
        objectShape(ctx, () => {
          ctx.ellipse(
            x + w * 0.5 + i * w * 0.24,
            y + h * (0.34 + Math.abs(i) * 0.1),
            w * 0.18,
            h * 0.24,
            i * 0.5,
            0,
            Math.PI * 2,
          );
        }, sceneColor(140, 0.45, 0.42));
      }
      break;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Poster assembly                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Renders the whole poster into a fresh offscreen canvas at native size.
 *
 * Painting order is the whole trick: architecture, then the people who live in
 * it, then the shutters and railings that put those people behind something,
 * then the street crowd, then smoke, then the eight objects, and only then the
 * seals - which is what guarantees no seal is ever occluded.
 */
export function renderPoster(seed: number = DEFAULT_POSTER_SEED): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const facade = buildFacade(seed);
  const crowd = splitCrowdByLayer(buildCrowd(seed, facade));

  drawFacadeBack(ctx, facade, seed);
  for (const figure of crowd.facade) drawCrowdFigure(ctx, figure);
  drawFacadeFront(ctx, facade);
  for (const figure of crowd.ground) drawCrowdFigure(ctx, figure);

  drawSmoke(ctx, seed);

  for (const object of POSTER_OBJECTS) drawObject(ctx, object);

  // Stamped last and centred on the object, so any crop tight enough to hold
  // the object necessarily holds its seal too.
  for (const seal of planPosterSeals(seed)) {
    drawSeal(ctx, seal.centerX, seal.centerY, seal.code);
  }

  return canvas;
}

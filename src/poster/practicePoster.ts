/**
 * The practice pictures used by the training mission and by the drills.
 *
 * They go through exactly the same pipeline as the park poster - draw, sanitise
 * the palette, then stamp a seal - which is the whole point: a drill validated
 * by a special case would prove nothing about the machinery the real missions
 * run on. Sanitising first and stamping last is not optional here either; it is
 * what stops a saturated crayon-bright shape being read as a seal dot.
 *
 * One big obvious object, one dedicated seal, a few small decorations that
 * deliberately carry no seal. That is all a tutorial picture needs.
 *
 * The drawing sticks to flat fills, arcs, ellipses and straight-line polygons -
 * no gradients, no bezier curves, no canvas transforms. That restraint buys
 * something concrete: `practicePoster.test.ts` renders these on the same
 * software rasteriser the park poster tests use and proves in plain Node that
 * each picture's seal decodes back to the drill's own code.
 */

import { sanitizePalette } from './paletteSanitizer';
import type { PosterTarget } from './posterData';
import { drawSeal } from './posterRenderer';

export type PracticeShape = 'ball' | 'star' | 'heart';

/**
 * Native size of a practice picture.
 *
 * Sized to its content, not to the park poster. The park poster is 3000px wide
 * because it is a search-and-find scene that has to survive being zoomed into;
 * a tutorial picture holds one object the child is told to look at, so a frame
 * much bigger than the object is just empty sky to get lost in. At 900x600 with
 * a 190px shape radius the object is 42% of the width and 63% of the height:
 * impossible to miss at the opening fit, which is the whole point.
 */
export const PRACTICE_POSTER_WIDTH = 900;
export const PRACTICE_POSTER_HEIGHT = 600;

/** Half-width of the big object on the full-size picture. */
export const PRACTICE_SHAPE_RADIUS = 190;

/** Side of the copy drill's card, and the radius its shape is drawn at. */
export const PRACTICE_CARD_SIZE = 520;
const CARD_SHAPE_RADIUS = 150;

export interface PracticePosterOptions {
  shape: PracticeShape;
  sealCode: number;
  /** Spanish name of the object, used as the target's mission name. */
  name: string;
  id?: string;
}

export interface PracticePoster {
  canvas: HTMLCanvasElement;
  /** The object, in the shape the decoder and the verdict already understand. */
  target: PosterTarget;
}

type ShapePainter = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
) => void;

function drawBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.fillStyle = '#d05a4e';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#f2e8d5';
  ctx.lineWidth = Math.max(6, r * 0.085);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.stroke();
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.fillStyle = '#d9a63c';
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.46;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#8a6420';
  ctx.lineWidth = Math.max(6, r * 0.06);
  ctx.stroke();
}

/**
 * Two lobes and a wedge.
 *
 * A bezier heart would be prettier, but this one is made of primitives the
 * software rasteriser can also draw, which is what keeps the drill's seal under
 * test rather than under assumption.
 */
function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.fillStyle = '#cc5f7a';

  ctx.beginPath();
  ctx.moveTo(cx - r * 1.0, cy - r * 0.24);
  ctx.lineTo(cx + r * 1.0, cy - r * 0.24);
  ctx.lineTo(cx, cy + r * 0.92);
  ctx.closePath();
  ctx.fill();

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + side * r * 0.5, cy - r * 0.3, r * 0.52, 0, Math.PI * 2);
    ctx.fill();
  }
}

const SHAPE_PAINTERS: Record<PracticeShape, ShapePainter> = {
  ball: drawBall,
  star: drawStar,
  heart: drawHeart,
};

function drawBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#d6e9f7';
  ctx.fillRect(0, 0, PRACTICE_POSTER_WIDTH, PRACTICE_POSTER_HEIGHT);

  ctx.fillStyle = '#e7f3fb';
  ctx.fillRect(0, 0, PRACTICE_POSTER_WIDTH, PRACTICE_POSTER_HEIGHT * 0.32);

  ctx.fillStyle = '#bfe0b6';
  ctx.beginPath();
  ctx.ellipse(
    PRACTICE_POSTER_WIDTH / 2,
    PRACTICE_POSTER_HEIGHT + 90,
    PRACTICE_POSTER_WIDTH * 0.85,
    210,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // A handful of pale clouds, kept well away from the centre so the big object
  // stays the only thing worth looking at.
  ctx.fillStyle = '#ffffff';
  for (const cloud of [
    { x: 110, y: 90, r: 40 },
    { x: 172, y: 104, r: 28 },
    { x: 760, y: 104, r: 44 },
    { x: 818, y: 118, r: 30 },
  ]) {
    ctx.beginPath();
    ctx.arc(cloud.x, cloud.y, cloud.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function newCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  return { canvas, ctx };
}

function targetFor(
  options: PracticePosterOptions,
  centerX: number,
  centerY: number,
  radius: number,
  idPrefix: string,
): PosterTarget {
  return {
    id: options.id ?? `${idPrefix}-${options.shape}`,
    name: options.name,
    x: centerX - radius,
    y: centerY - radius,
    width: radius * 2,
    height: radius * 2,
    sealCode: options.sealCode,
  };
}

/**
 * Renders one practice picture.
 *
 * The seal is stamped at the object's centre and at nominal scale, so the
 * decoder's reported scale means the same thing here as it does on the park
 * poster and the verdict maths carries over unchanged.
 */
export function renderPracticePoster(options: PracticePosterOptions): PracticePoster {
  const { canvas, ctx } = newCanvas(PRACTICE_POSTER_WIDTH, PRACTICE_POSTER_HEIGHT);

  const centerX = PRACTICE_POSTER_WIDTH / 2;
  const centerY = PRACTICE_POSTER_HEIGHT / 2;

  drawBackground(ctx);
  SHAPE_PAINTERS[options.shape](ctx, centerX, centerY, PRACTICE_SHAPE_RADIUS);

  const pixels = ctx.getImageData(0, 0, PRACTICE_POSTER_WIDTH, PRACTICE_POSTER_HEIGHT);
  sanitizePalette(pixels);
  ctx.putImageData(pixels, 0, 0);

  drawSeal(ctx, centerX, centerY, options.sealCode);

  return {
    canvas,
    target: targetFor(options, centerX, centerY, PRACTICE_SHAPE_RADIUS, 'practice'),
  };
}

/**
 * A small card version, for the copy drill.
 *
 * The child selects this image and presses Ctrl+C, so it has to read as one
 * card on screen yet still carry a seal at nominal size. The copy travels at
 * native resolution, which is why 520px is plenty.
 */
export function renderPracticeCard(options: PracticePosterOptions): PracticePoster {
  const size = PRACTICE_CARD_SIZE;
  const { canvas, ctx } = newCanvas(size, size);
  const center = size / 2;

  ctx.fillStyle = '#f6efdd';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#8b8360';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.rect(6, 6, size - 12, size - 12);
  ctx.stroke();

  SHAPE_PAINTERS[options.shape](ctx, center, center, CARD_SHAPE_RADIUS);

  const pixels = ctx.getImageData(0, 0, size, size);
  sanitizePalette(pixels);
  ctx.putImageData(pixels, 0, 0);

  drawSeal(ctx, center, center, options.sealCode);

  return {
    canvas,
    target: targetFor(options, center, center, CARD_SHAPE_RADIUS, 'practice-card'),
  };
}

/**
 * Shared drawing primitives.
 *
 * The look of the poster hangs on one rule: every shape gets a crisp dark
 * outline. Without it hundreds of overlapping figures read as mush. `outlined`
 * is therefore the only way the rest of the poster is allowed to paint a shape.
 */

import { OUTLINE_COLOR } from './sceneColor';

/** Stroke weight of an ordinary outline, in poster-native pixels. */
export const OUTLINE_WIDTH = 2;

/** Fills a path and strokes it with the shared outline colour. */
export function outlined(
  ctx: CanvasRenderingContext2D,
  buildPath: () => void,
  fill: string,
  lineWidth = OUTLINE_WIDTH,
): void {
  ctx.beginPath();
  buildPath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/** Outlined rectangle. */
export function outlinedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  lineWidth = OUTLINE_WIDTH,
): void {
  outlined(ctx, () => ctx.rect(x, y, width, height), fill, lineWidth);
}

/** Outlined ellipse. */
export function outlinedEllipse(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  fill: string,
  lineWidth = OUTLINE_WIDTH,
  rotation = 0,
): void {
  outlined(
    ctx,
    () => ctx.ellipse(centerX, centerY, radiusX, radiusY, rotation, 0, Math.PI * 2),
    fill,
    lineWidth,
  );
}

/** Outlined closed polygon. */
export function outlinedPolygon(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
  fill: string,
  lineWidth = OUTLINE_WIDTH,
): void {
  outlined(
    ctx,
    () => {
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
      ctx.closePath();
    },
    fill,
    lineWidth,
  );
}

/** A limb: a thick round-capped line in the given colour, then a dark outline. */
export function limb(
  ctx: CanvasRenderingContext2D,
  from: readonly [number, number],
  to: readonly [number, number],
  thickness: number,
  color: string,
): void {
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.lineWidth = thickness + OUTLINE_WIDTH * 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.stroke();
  ctx.lineCap = 'butt';
}

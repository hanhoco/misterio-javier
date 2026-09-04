/**
 * The picture behind the puzzle: Javier, drawn in code.
 *
 * Generated procedurally on purpose. The brief asks for no new art assets, and
 * a fifteen-piece jigsaw needs an image whose slices each carry something worth
 * uncovering - so the composition is arranged with the 5x3 grid in mind: face
 * across the middle band, sky and confetti along the top, the message along the
 * bottom, nothing important dead on a seam.
 *
 * Nothing decodes this image, so it does not need the palette sanitiser and can
 * be as colourful as it likes.
 */

import { createRandom } from '../poster/random';

export const REVEAL_WIDTH = 1000;
export const REVEAL_HEIGHT = 600;

/** The board's grid. Fifteen cells, one per story mission. */
export const PUZZLE_COLUMNS = 5;
export const PUZZLE_ROWS = 3;

function drawConfetti(ctx: CanvasRenderingContext2D): void {
  const random = createRandom(20260904);
  const colors = ['#ff7ab8', '#ffd166', '#8ce99a', '#74c0fc', '#e599f7'];
  for (let i = 0; i < 90; i += 1) {
    const x = random() * REVEAL_WIDTH;
    const y = random() * REVEAL_HEIGHT * 0.75;
    const size = 6 + random() * 12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(random() * Math.PI);
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    ctx.globalAlpha = 0.55 + random() * 0.35;
    ctx.fillRect(-size / 2, -size / 4, size, size / 2);
    ctx.restore();
  }
}

function drawJavier(ctx: CanvasRenderingContext2D): void {
  const cx = REVEAL_WIDTH / 2;
  const cy = 300;

  // Shoulders and shirt.
  ctx.fillStyle = '#3d7dca';
  ctx.beginPath();
  ctx.moveTo(cx - 190, REVEAL_HEIGHT - 60);
  ctx.quadraticCurveTo(cx - 170, cy + 90, cx, cy + 80);
  ctx.quadraticCurveTo(cx + 170, cy + 90, cx + 190, REVEAL_HEIGHT - 60);
  ctx.closePath();
  ctx.fill();

  // Detective coat collar, so he reads as the child's partner in the case.
  ctx.fillStyle = '#d9a441';
  ctx.beginPath();
  ctx.moveTo(cx - 120, cy + 96);
  ctx.lineTo(cx, cy + 190);
  ctx.lineTo(cx - 60, cy + 210);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 120, cy + 96);
  ctx.lineTo(cx, cy + 190);
  ctx.lineTo(cx + 60, cy + 210);
  ctx.closePath();
  ctx.fill();

  // Ears.
  ctx.fillStyle = '#e8b98d';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * 104, cy + 6, 20, 28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Face.
  ctx.fillStyle = '#f3c9a0';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 108, 124, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair.
  ctx.fillStyle = '#4a3323';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 78, 112, 66, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx - 74, cy - 44, 34, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 74, cy - 44, 34, 34, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes, with a highlight each so they look alive rather than drawn.
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx + side * 40, cy - 8, 26, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#33291f';
    ctx.beginPath();
    ctx.arc(cx + side * 42, cy - 6, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + side * 46, cy - 11, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyebrows, cheeks, nose, smile.
  ctx.strokeStyle = '#4a3323';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * 22, cy - 42);
    ctx.quadraticCurveTo(cx + side * 42, cy - 54, cx + side * 62, cy - 42);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(224, 122, 122, 0.45)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * 66, cy + 34, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = '#c99a72';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 4);
  ctx.quadraticCurveTo(cx + 8, cy + 26, cx - 4, cy + 30);
  ctx.stroke();

  ctx.strokeStyle = '#8c4a3c';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy + 40, 44, 0.22 * Math.PI, 0.78 * Math.PI);
  ctx.stroke();

  // The magnifying glass, tilted, held up beside him.
  ctx.save();
  ctx.translate(cx + 210, cy + 40);
  ctx.rotate(-0.4);
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 60);
  ctx.lineTo(0, 140);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(0, 0, 56, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMessage(ctx: CanvasRenderingContext2D): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.beginPath();
  ctx.roundRect(90, REVEAL_HEIGHT - 122, REVEAL_WIDTH - 180, 84, 26);
  ctx.fill();

  ctx.fillStyle = '#1d2340';
  ctx.font = 'bold 40px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
  ctx.fillText('¡GRACIAS, DETECTIVE!', REVEAL_WIDTH / 2, REVEAL_HEIGHT - 92);
  ctx.font = 'bold 26px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Encontraste todo lo que perdí.', REVEAL_WIDTH / 2, REVEAL_HEIGHT - 56);
}

/** Renders the finished picture. Cheap enough to call whenever it is needed. */
export function renderRevealImage(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = REVEAL_WIDTH;
  canvas.height = REVEAL_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const sky = ctx.createLinearGradient(0, 0, 0, REVEAL_HEIGHT);
  sky.addColorStop(0, '#ffe9a8');
  sky.addColorStop(0.55, '#ffd6e0');
  sky.addColorStop(1, '#cdeafc');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, REVEAL_WIDTH, REVEAL_HEIGHT);

  // Sunburst behind him, so every top-row piece has something on it.
  ctx.save();
  ctx.translate(REVEAL_WIDTH / 2, 300);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (let i = 0; i < 16; i += 1) {
    ctx.rotate((Math.PI * 2) / 16);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(700, -46);
    ctx.lineTo(700, 46);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  drawConfetti(ctx);
  drawJavier(ctx);
  drawMessage(ctx);

  return canvas;
}

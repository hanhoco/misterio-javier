/**
 * The fifteen-piece board.
 *
 * One cell per story mission, in mission order, each holding its own slice of
 * the reveal picture. A locked cell shows its number behind a cover; unlocking
 * it removes the cover, which is a class change and therefore something the
 * reduced-motion media query can turn from a flip into a plain swap.
 *
 * The board is drawn once and only ever updated in place, because it is on the
 * mission screen the whole way through and rebuilding it on every paste would
 * restart the animation on all fifteen cells.
 */

import { PUZZLE_COLUMNS, PUZZLE_ROWS, renderRevealImage } from '../game/revealImage';
import { element } from './dom';

export interface PuzzleBoard {
  root: HTMLElement;
  /** Reveals exactly these piece indices, leaving the rest covered. */
  setUnlocked(indices: readonly number[]): void;
  /** Uncovers everything: the finale. */
  revealAll(): void;
}

export interface PuzzleBoardOptions {
  /** `compact` is the strip on the mission screen; `full` is the finale. */
  variant?: 'compact' | 'full';
}

export function createPuzzleBoard(options: PuzzleBoardOptions = {}): PuzzleBoard {
  const variant = options.variant ?? 'compact';
  const reveal = renderRevealImage();
  const pieceWidth = reveal.width / PUZZLE_COLUMNS;
  const pieceHeight = reveal.height / PUZZLE_ROWS;

  const root = element('div', `puzzle puzzle--${variant}`);
  root.style.setProperty('--puzzle-columns', String(PUZZLE_COLUMNS));
  // The cell has to be the shape of the slice it holds. Hardcoding an aspect in
  // the stylesheet is how 200x200 pieces ended up squashed into 83x50 boxes.
  root.style.setProperty('--puzzle-aspect', `${pieceWidth} / ${pieceHeight}`);
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'Rompecabezas del misterio de Javier');

  const cells: HTMLElement[] = [];

  for (let index = 0; index < PUZZLE_COLUMNS * PUZZLE_ROWS; index += 1) {
    const column = index % PUZZLE_COLUMNS;
    const row = Math.floor(index / PUZZLE_COLUMNS);

    const cell = element('div', 'puzzle__cell');
    const canvas = element('canvas', 'puzzle__piece');
    canvas.width = pieceWidth;
    canvas.height = pieceHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(
        reveal,
        column * pieceWidth,
        row * pieceHeight,
        pieceWidth,
        pieceHeight,
        0,
        0,
        pieceWidth,
        pieceHeight,
      );
    }

    const cover = element('div', 'puzzle__cover', String(index + 1));
    cell.append(canvas, cover);
    root.appendChild(cell);
    cells.push(cell);
  }

  const apply = (unlocked: Set<number>) => {
    cells.forEach((cell, index) => {
      const isOpen = unlocked.has(index);
      cell.classList.toggle('is-open', isOpen);
      cell.setAttribute(
        'aria-label',
        isOpen ? `Pieza ${index + 1} descubierta` : `Pieza ${index + 1} todavía escondida`,
      );
    });
  };

  apply(new Set());

  return {
    root,
    setUnlocked(indices) {
      apply(new Set(indices));
    },
    revealAll() {
      apply(new Set(cells.map((_, index) => index)));
    },
  };
}

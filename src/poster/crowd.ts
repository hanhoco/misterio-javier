/**
 * The crowd: hundreds of little people, composed from randomised parts and
 * packed into every slot the facade offers plus the street in front of it.
 *
 * Two halves, deliberately separated:
 *   - `buildCrowd(seed)` is pure data. It decides who stands where, at what
 *     size, in what colours. No canvas, no DOM, so tests can count and inspect
 *     the crowd without rendering it.
 *   - `drawCrowdFigure` paints one figure. Every colour it uses comes from
 *     `sceneColor`, which is what keeps the whole crowd invisible to the seal
 *     decoder.
 */

import { buildFacade, STREET_Y, type Facade } from './facade';
import { POSTER_HEIGHT, POSTER_WIDTH } from './posterLayout';
import { limb, outlined, outlinedEllipse, outlinedPolygon, OUTLINE_WIDTH } from './draw';
import { OUTLINE_COLOR, sceneColor } from './sceneColor';
import {
  createRandom,
  randomBetween,
  randomChance,
  randomInt,
  randomPick,
  type Random,
} from './random';

export type FigureVariant = 'full' | 'bust';

/**
 * Which paint pass a figure belongs to. `facade` figures are painted before the
 * shutters and railings go on, so they read as being inside the building.
 */
export type FigureLayer = 'facade' | 'ground';

export type HairStyle =
  | 'bald'
  | 'short'
  | 'long'
  | 'bun'
  | 'cap'
  | 'pointed-hat'
  | 'beanie';

export type ArmPose = 'down' | 'out' | 'one-up' | 'both-up' | 'crossed';

export type Accessory = 'bag' | 'book' | 'balloon' | 'umbrella';

export interface CrowdFigure {
  /** Position in the generated order; also the tie-breaker when sorting. */
  readonly index: number;
  readonly variant: FigureVariant;
  readonly layer: FigureLayer;
  /** Horizontal centre of the figure. */
  readonly centerX: number;
  /** Ground line under the feet, or the sill line for a bust. */
  readonly baseY: number;
  /** Total drawn height, in poster-native pixels. */
  readonly height: number;
  readonly facingRight: boolean;
  readonly hairStyle: HairStyle;
  readonly armPose: ArmPose;
  readonly accessory: Accessory | null;
  readonly skinColor: string;
  readonly hairColor: string;
  readonly shirtColor: string;
  readonly trouserColor: string;
  readonly accessoryColor: string;
  /** Where a decoy seal is stamped if this figure is chosen to carry one. */
  readonly sealX: number;
  readonly sealY: number;
}

/* -------------------------------------------------------------------------- */
/* Palette                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Muted, desaturated, and every hue outside the four reserved bands
 * ([14,44], [76,106], [171,201], [291,321]). Skin tones are the awkward case:
 * the natural 20-35 degree range is inside the orange band, so they are built
 * from the safe corridors on either side (45-75 and 340-13) instead.
 */
const SKIN_COLORS = [
  sceneColor(48, 0.42, 0.78),
  sceneColor(46, 0.4, 0.68),
  sceneColor(50, 0.36, 0.58),
  sceneColor(52, 0.32, 0.46),
  sceneColor(54, 0.28, 0.34),
  sceneColor(8, 0.3, 0.7),
  sceneColor(356, 0.26, 0.6),
  sceneColor(60, 0.24, 0.5),
];

const HAIR_COLORS = [
  sceneColor(0, 0, 0.13),
  sceneColor(0, 0, 0.28),
  sceneColor(52, 0.34, 0.24),
  sceneColor(50, 0.38, 0.4),
  sceneColor(0, 0, 0.46),
  sceneColor(0, 0, 0.74),
  sceneColor(352, 0.42, 0.38),
  sceneColor(66, 0.3, 0.52),
  sceneColor(276, 0.3, 0.34),
];

const CLOTH_COLORS = [
  sceneColor(124, 0.3, 0.44),
  sceneColor(138, 0.28, 0.56),
  sceneColor(152, 0.26, 0.38),
  sceneColor(214, 0.3, 0.48),
  sceneColor(228, 0.24, 0.62),
  sceneColor(248, 0.28, 0.42),
  sceneColor(272, 0.3, 0.46),
  sceneColor(286, 0.26, 0.58),
  sceneColor(350, 0.36, 0.46),
  sceneColor(358, 0.3, 0.6),
  sceneColor(6, 0.3, 0.4),
  sceneColor(50, 0.34, 0.6),
  sceneColor(58, 0.28, 0.48),
  sceneColor(68, 0.3, 0.36),
  sceneColor(0, 0, 0.36),
  sceneColor(0, 0, 0.7),
];

const HAIR_STYLES: readonly HairStyle[] = [
  'bald',
  'short',
  'short',
  'long',
  'bun',
  'cap',
  'cap',
  'pointed-hat',
  'beanie',
];

const ARM_POSES: readonly ArmPose[] = [
  'down',
  'down',
  'out',
  'one-up',
  'both-up',
  'crossed',
];

const ACCESSORIES: readonly Accessory[] = ['bag', 'book', 'balloon', 'umbrella'];

const ACCESSORY_CHANCE = 0.2;

/* -------------------------------------------------------------------------- */
/* Crowd planning                                                             */
/* -------------------------------------------------------------------------- */

/** Rows of people filling the street in front of the building. */
const STREET_ROW_COUNT = 10;
/** Smallest and largest full figure heights, in poster-native pixels. */
const MIN_FIGURE_HEIGHT = 44;
const MAX_FIGURE_HEIGHT = 90;

function makeFigure(
  random: Random,
  index: number,
  variant: FigureVariant,
  layer: FigureLayer,
  centerX: number,
  baseY: number,
  height: number,
): CrowdFigure {
  const sealY =
    variant === 'bust' ? baseY - height * 0.45 : baseY - height * 0.44;
  return {
    index,
    variant,
    layer,
    centerX,
    baseY,
    height,
    facingRight: randomChance(random, 0.5),
    hairStyle: randomPick(random, HAIR_STYLES),
    armPose: randomPick(random, ARM_POSES),
    accessory:
      variant === 'full' && randomChance(random, ACCESSORY_CHANCE)
        ? randomPick(random, ACCESSORIES)
        : null,
    skinColor: randomPick(random, SKIN_COLORS),
    hairColor: randomPick(random, HAIR_COLORS),
    shirtColor: randomPick(random, CLOTH_COLORS),
    trouserColor: randomPick(random, CLOTH_COLORS),
    accessoryColor: randomPick(random, CLOTH_COLORS),
    sealX: centerX,
    sealY,
  };
}

/**
 * Places every figure in the scene. Deterministic in `seed`: same seed, same
 * crowd, down to the last hat.
 */
export function buildCrowd(seed: number, facade: Facade = buildFacade(seed)): CrowdFigure[] {
  const random = createRandom(seed ^ 0x1dea7);
  const figures: CrowdFigure[] = [];
  let index = 0;

  const push = (
    variant: FigureVariant,
    layer: FigureLayer,
    centerX: number,
    baseY: number,
    height: number,
  ) => {
    figures.push(makeFigure(random, index, variant, layer, centerX, baseY, height));
    index += 1;
  };

  // Faces at the windows.
  for (const slot of facade.windows) {
    if (!randomChance(random, 0.82)) continue;
    const sill = slot.y + slot.height - 6;
    push(
      'bust',
      'facade',
      slot.x + slot.width * randomBetween(random, 0.3, 0.7),
      sill,
      slot.height * randomBetween(random, 0.5, 0.66),
    );
    if (randomChance(random, 0.4)) {
      push(
        'bust',
        'facade',
        slot.x + slot.width * randomBetween(random, 0.16, 0.84),
        sill - randomBetween(random, 6, 20),
        slot.height * randomBetween(random, 0.4, 0.54),
      );
    }
  }

  // People leaning on the balconies.
  for (const slot of facade.windows) {
    if (!slot.balcony) continue;
    const standing = randomInt(random, 1, 3);
    const floorY = slot.balcony.y + slot.balcony.height - 10;
    for (let i = 0; i < standing; i += 1) {
      push(
        'full',
        'facade',
        slot.balcony.x + (slot.balcony.width * (i + 0.5)) / standing +
          randomBetween(random, -8, 8),
        floorY,
        randomBetween(random, 62, 84),
      );
    }
  }

  // Spilling out of the doorways.
  for (const door of facade.doors) {
    const count = randomInt(random, 2, 4);
    for (let i = 0; i < count; i += 1) {
      push(
        'full',
        'ground',
        door.x + (door.width * (i + 0.5)) / count + randomBetween(random, -10, 10),
        STREET_Y - randomBetween(random, 0, 8),
        randomBetween(random, 70, 92),
      );
    }
  }

  // Sitting and standing on the stoops.
  for (const door of facade.doors) {
    for (const step of door.steps) {
      const count = randomInt(random, 1, 3);
      for (let i = 0; i < count; i += 1) {
        const side = randomChance(random, 0.5) ? 0 : 1;
        const spread = step.width * 0.5;
        push(
          'full',
          'ground',
          step.x + (side === 0 ? randomBetween(random, 10, spread * 0.7) : step.width - randomBetween(random, 10, spread * 0.7)),
          step.y + step.height,
          randomBetween(random, 58, 80),
        );
      }
    }
  }

  // The street crowd, back row first so the draw order is already right.
  const firstRowY = STREET_Y - 46;
  const lastRowY = POSTER_HEIGHT + 26;
  for (let row = 0; row < STREET_ROW_COUNT; row += 1) {
    const t = row / (STREET_ROW_COUNT - 1);
    const baseY = firstRowY + (lastRowY - firstRowY) * t;
    const height = MIN_FIGURE_HEIGHT + (MAX_FIGURE_HEIGHT - MIN_FIGURE_HEIGHT) * t;
    const spacing = 86 + 44 * t;
    for (let x = -30; x < POSTER_WIDTH + 30; x += spacing) {
      push(
        'full',
        'ground',
        x + randomBetween(random, -spacing * 0.3, spacing * 0.3),
        baseY + randomBetween(random, -9, 9),
        height * randomBetween(random, 0.86, 1.12),
      );
    }
  }

  return figures;
}

/** Figures painted before the shutters and railings, then everyone else. */
export function splitCrowdByLayer(figures: readonly CrowdFigure[]): {
  facade: CrowdFigure[];
  ground: CrowdFigure[];
} {
  const byDepth = (a: CrowdFigure, b: CrowdFigure) =>
    a.baseY - b.baseY || a.index - b.index;
  return {
    facade: figures.filter((figure) => figure.layer === 'facade').sort(byDepth),
    ground: figures.filter((figure) => figure.layer === 'ground').sort(byDepth),
  };
}

/* -------------------------------------------------------------------------- */
/* Painting                                                                   */
/* -------------------------------------------------------------------------- */

export function drawCrowdFigure(ctx: CanvasRenderingContext2D, figure: CrowdFigure): void {
  if (figure.variant === 'bust') drawBust(ctx, figure);
  else drawFullFigure(ctx, figure);
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  figure: CrowdFigure,
  centerX: number,
  centerY: number,
  radius: number,
): void {
  outlinedEllipse(ctx, centerX, centerY, radius * 0.92, radius, figure.skinColor);
  drawHair(ctx, figure, centerX, centerY, radius);
  drawEyes(ctx, figure, centerX, centerY, radius);
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  figure: CrowdFigure,
  centerX: number,
  centerY: number,
  radius: number,
): void {
  const eyeRadius = Math.max(1, radius * 0.13);
  const offset = radius * 0.34;
  const shift = figure.facingRight ? radius * 0.1 : -radius * 0.1;
  ctx.fillStyle = OUTLINE_COLOR;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(centerX + side * offset + shift, centerY + radius * 0.06, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHair(
  ctx: CanvasRenderingContext2D,
  figure: CrowdFigure,
  cx: number,
  cy: number,
  r: number,
): void {
  const { hairColor, hairStyle } = figure;
  switch (hairStyle) {
    case 'bald':
      break;

    case 'short':
      outlined(
        ctx,
        () => ctx.ellipse(cx, cy - r * 0.34, r * 0.98, r * 0.72, 0, Math.PI, 0),
        hairColor,
      );
      break;

    case 'long':
      outlined(
        ctx,
        () => ctx.ellipse(cx, cy - r * 0.1, r * 1.12, r * 1.24, 0, 0, Math.PI * 2),
        hairColor,
      );
      outlinedEllipse(ctx, cx, cy + r * 0.12, r * 0.8, r * 0.86, figure.skinColor);
      break;

    case 'bun':
      outlined(
        ctx,
        () => ctx.ellipse(cx, cy - r * 0.34, r * 0.98, r * 0.66, 0, Math.PI, 0),
        hairColor,
      );
      outlinedEllipse(ctx, cx, cy - r * 1.22, r * 0.42, r * 0.42, hairColor);
      break;

    case 'cap':
      outlined(
        ctx,
        () => ctx.ellipse(cx, cy - r * 0.28, r * 1.04, r * 0.8, 0, Math.PI, 0),
        hairColor,
      );
      outlinedEllipse(
        ctx,
        cx + (figure.facingRight ? r * 0.78 : -r * 0.78),
        cy - r * 0.24,
        r * 0.7,
        r * 0.2,
        hairColor,
      );
      break;

    case 'pointed-hat':
      outlinedPolygon(
        ctx,
        [
          [cx - r * 1.15, cy - r * 0.26],
          [cx + r * 1.15, cy - r * 0.26],
          [cx + (figure.facingRight ? r * 0.3 : -r * 0.3), cy - r * 2.1],
        ],
        hairColor,
      );
      break;

    case 'beanie':
      outlined(
        ctx,
        () => ctx.ellipse(cx, cy - r * 0.2, r * 1.06, r * 0.9, 0, Math.PI, 0),
        hairColor,
      );
      outlinedEllipse(ctx, cx, cy - r * 1.06, r * 0.26, r * 0.26, hairColor);
      break;
  }
}

/**
 * Head and shoulders only, sized to sit entirely inside its window opening:
 * the drawn figure occupies exactly `[baseY - height, baseY]`. There is no
 * clipping in the renderer, so a bust that fits by construction is the only way
 * to keep a face in a window instead of pasted over the wall below it.
 */
function drawBust(ctx: CanvasRenderingContext2D, figure: CrowdFigure): void {
  const h = figure.height;
  const cx = figure.centerX;
  const headRadius = h * 0.3;

  outlinedEllipse(ctx, cx, figure.baseY - h * 0.22, h * 0.42, h * 0.22, figure.shirtColor);
  drawHead(ctx, figure, cx, figure.baseY - h + headRadius, headRadius);
}

function drawFullFigure(ctx: CanvasRenderingContext2D, figure: CrowdFigure): void {
  const h = figure.height;
  const cx = figure.centerX;
  const feetY = figure.baseY;

  const legLength = h * 0.3;
  const hipY = feetY - legLength;
  const torsoHeight = h * 0.36;
  const shoulderY = hipY - torsoHeight;
  const bodyWidth = h * 0.27;
  const headRadius = h * 0.135;
  const headY = shoulderY - headRadius * 0.95;
  const limbThickness = Math.max(2.5, h * 0.075);
  const direction = figure.facingRight ? 1 : -1;

  // Legs.
  for (const side of [-1, 1]) {
    limb(
      ctx,
      [cx + side * bodyWidth * 0.22, hipY],
      [cx + side * bodyWidth * 0.3, feetY],
      limbThickness,
      figure.trouserColor,
    );
  }

  // Torso.
  outlinedPolygon(
    ctx,
    [
      [cx - bodyWidth * 0.5, shoulderY + bodyWidth * 0.18],
      [cx - bodyWidth * 0.34, shoulderY],
      [cx + bodyWidth * 0.34, shoulderY],
      [cx + bodyWidth * 0.5, shoulderY + bodyWidth * 0.18],
      [cx + bodyWidth * 0.44, hipY],
      [cx - bodyWidth * 0.44, hipY],
    ],
    figure.shirtColor,
  );

  // Arms.
  const hands = armTargets(figure, cx, shoulderY, hipY, bodyWidth, h);
  for (let i = 0; i < 2; i += 1) {
    const side = i === 0 ? -1 : 1;
    limb(
      ctx,
      [cx + side * bodyWidth * 0.46, shoulderY + h * 0.04],
      hands[i],
      limbThickness * 0.85,
      figure.shirtColor,
    );
  }

  drawHead(ctx, figure, cx, headY, headRadius);

  if (figure.accessory) {
    drawAccessory(ctx, figure, hands[figure.facingRight ? 1 : 0], h, direction);
  }
}

/** Left hand, then right hand, in poster coordinates. */
function armTargets(
  figure: CrowdFigure,
  cx: number,
  shoulderY: number,
  hipY: number,
  bodyWidth: number,
  h: number,
): [[number, number], [number, number]] {
  const down: [number, number][] = [
    [cx - bodyWidth * 0.72, hipY + h * 0.05],
    [cx + bodyWidth * 0.72, hipY + h * 0.05],
  ];
  switch (figure.armPose) {
    case 'down':
      return [down[0], down[1]];
    case 'out':
      return [
        [cx - bodyWidth * 1.25, shoulderY + h * 0.11],
        [cx + bodyWidth * 1.25, shoulderY + h * 0.11],
      ];
    case 'one-up':
      return figure.facingRight
        ? [down[0], [cx + bodyWidth * 0.85, shoulderY - h * 0.2]]
        : [[cx - bodyWidth * 0.85, shoulderY - h * 0.2], down[1]];
    case 'both-up':
      return [
        [cx - bodyWidth * 0.8, shoulderY - h * 0.22],
        [cx + bodyWidth * 0.8, shoulderY - h * 0.22],
      ];
    case 'crossed':
      return [
        [cx + bodyWidth * 0.2, hipY - h * 0.06],
        [cx - bodyWidth * 0.2, hipY - h * 0.06],
      ];
  }
}

function drawAccessory(
  ctx: CanvasRenderingContext2D,
  figure: CrowdFigure,
  hand: readonly [number, number],
  h: number,
  direction: number,
): void {
  const [hx, hy] = hand;
  switch (figure.accessory) {
    case 'bag':
      outlined(
        ctx,
        () => ctx.rect(hx - h * 0.08, hy, h * 0.16, h * 0.16),
        figure.accessoryColor,
      );
      break;

    case 'book':
      outlined(
        ctx,
        () => ctx.rect(hx - h * 0.1, hy - h * 0.04, h * 0.2, h * 0.13),
        figure.accessoryColor,
      );
      break;

    case 'balloon':
      ctx.strokeStyle = OUTLINE_COLOR;
      ctx.lineWidth = OUTLINE_WIDTH * 0.6;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + direction * h * 0.06, hy - h * 0.34);
      ctx.stroke();
      outlinedEllipse(
        ctx,
        hx + direction * h * 0.06,
        hy - h * 0.44,
        h * 0.11,
        h * 0.13,
        figure.accessoryColor,
      );
      break;

    case 'umbrella':
      ctx.strokeStyle = OUTLINE_COLOR;
      ctx.lineWidth = OUTLINE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(hx, hy + h * 0.06);
      ctx.lineTo(hx, hy - h * 0.3);
      ctx.stroke();
      outlined(
        ctx,
        () => ctx.ellipse(hx, hy - h * 0.3, h * 0.22, h * 0.16, 0, Math.PI, 0),
        figure.accessoryColor,
      );
      break;

    case null:
      break;
  }
}

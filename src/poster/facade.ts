/**
 * The building the whole scene hangs on: a head-on facade with four storeys,
 * rows of shuttered windows, balconies, street doors and their stoops.
 *
 * This module is pure geometry plus two paint passes. It publishes the slots
 * (windows, balconies, doorways, steps) that `crowd.ts` fills with people, so
 * the two never have to agree on coordinates by hand.
 */

import { POSTER_HEIGHT, POSTER_WIDTH } from './posterLayout';
import { outlined, outlinedRect, OUTLINE_WIDTH } from './draw';
import { sceneColor } from './sceneColor';
import { createRandom, randomBetween, randomChance, randomPick } from './random';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Top of the roof cornice. */
const ROOF_TOP = 64;
/** Height of the cornice slab that caps the facade. */
const CORNICE_HEIGHT = 52;
/** Y where the facade meets the street. */
export const STREET_Y = 1212;

const FLOOR_COUNT = 4;
const FLOOR_HEIGHT = (STREET_Y - ROOF_TOP - CORNICE_HEIGHT) / FLOOR_COUNT;

/** Vertical bays across the facade; one window (or door) per bay per floor. */
const BAY_COUNT = 12;
const BAY_WIDTH = POSTER_WIDTH / BAY_COUNT;

const WINDOW_WIDTH = 112;
const WINDOW_HEIGHT = 136;
/** Distance from the top of a floor band down to the top of its window. */
const WINDOW_TOP_INSET = 58;

const DOOR_WIDTH = 134;
const DOOR_HEIGHT = 206;
/** Bays whose ground floor is a door instead of a window. */
const DOOR_BAYS = [1, 4, 7, 10] as const;

const STEP_COUNT = 3;
const STEP_HEIGHT = 17;

export interface WindowSlot extends Rect {
  /** 0 is the ground floor. */
  floor: number;
  bay: number;
  hasShutters: boolean;
  /** Ledge people can stand on, when this window opens onto one. */
  balcony: Rect | null;
  shutterColor: string;
  frameColor: string;
}

export interface DoorSlot extends Rect {
  bay: number;
  /** Steps from the doorway down to the street, top step first. */
  steps: Rect[];
  doorColor: string;
}

export interface Facade {
  wallColor: string;
  trimColor: string;
  bandColors: string[];
  windows: WindowSlot[];
  doors: DoorSlot[];
  streetY: number;
}

/** Top edge of floor `index` (0 is the ground floor). */
function floorTop(index: number): number {
  return STREET_Y - (index + 1) * FLOOR_HEIGHT;
}

/** Muted, desaturated facade tones. Every hue sits outside the reserved bands. */
const WALL_HUES = [50, 56, 128, 215, 268, 352] as const;
const SHUTTER_HUES = [138, 208, 274, 352, 62] as const;
const DOOR_HUES = [352, 268, 138, 210, 55] as const;

export function buildFacade(seed: number): Facade {
  const random = createRandom(seed ^ 0x5eed1);

  const wallHue = randomPick(random, WALL_HUES);
  const wallColor = sceneColor(wallHue, 0.26, 0.66);
  const trimColor = sceneColor(wallHue, 0.2, 0.52);
  const bandColors = Array.from({ length: FLOOR_COUNT }, (_, floor) =>
    sceneColor(wallHue, 0.24, 0.6 + floor * 0.035),
  );

  const windows: WindowSlot[] = [];
  const doors: DoorSlot[] = [];

  for (let floor = 0; floor < FLOOR_COUNT; floor += 1) {
    for (let bay = 0; bay < BAY_COUNT; bay += 1) {
      const centerX = bay * BAY_WIDTH + BAY_WIDTH / 2;

      if (floor === 0 && (DOOR_BAYS as readonly number[]).includes(bay)) {
        const door: DoorSlot = {
          bay,
          x: centerX - DOOR_WIDTH / 2,
          y: STREET_Y - DOOR_HEIGHT,
          width: DOOR_WIDTH,
          height: DOOR_HEIGHT,
          doorColor: sceneColor(randomPick(random, DOOR_HUES), 0.34, 0.42),
          steps: Array.from({ length: STEP_COUNT }, (_, step) => ({
            x: centerX - DOOR_WIDTH / 2 - 18 - step * 22,
            y: STREET_Y + step * STEP_HEIGHT,
            width: DOOR_WIDTH + 36 + step * 44,
            height: STEP_HEIGHT,
          })),
        };
        doors.push(door);
        continue;
      }

      const y = floorTop(floor) + WINDOW_TOP_INSET;
      const hasBalcony = floor >= 1;
      windows.push({
        floor,
        bay,
        x: centerX - WINDOW_WIDTH / 2,
        y,
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        hasShutters: randomChance(random, 0.55),
        shutterColor: sceneColor(randomPick(random, SHUTTER_HUES), 0.32, 0.44),
        frameColor: sceneColor(wallHue, 0.18, 0.86),
        balcony: hasBalcony
          ? {
              x: centerX - WINDOW_WIDTH / 2 - 26,
              y: y + WINDOW_HEIGHT - 4,
              width: WINDOW_WIDTH + 52,
              height: 44,
            }
          : null,
      });
    }
  }

  return { wallColor, trimColor, bandColors, windows, doors, streetY: STREET_Y };
}

/* -------------------------------------------------------------------------- */
/* Paint passes                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Everything behind the people: sky, wall, floor bands, window recesses and
 * open doorways.
 */
export function drawFacadeBack(ctx: CanvasRenderingContext2D, facade: Facade, seed: number): void {
  const random = createRandom(seed ^ 0x5eed2);

  // Sky strip above the roof.
  ctx.fillStyle = sceneColor(212, 0.3, 0.82);
  ctx.fillRect(0, 0, POSTER_WIDTH, ROOF_TOP + 8);

  // Wall.
  ctx.fillStyle = facade.wallColor;
  ctx.fillRect(0, ROOF_TOP, POSTER_WIDTH, STREET_Y - ROOF_TOP);

  // Cornice.
  outlinedRect(ctx, -6, ROOF_TOP, POSTER_WIDTH + 12, CORNICE_HEIGHT, facade.trimColor, 3);

  // One tinted band per storey, so the floors read apart at a glance.
  for (let floor = 0; floor < FLOOR_COUNT; floor += 1) {
    const top = floorTop(floor);
    ctx.fillStyle = facade.bandColors[floor];
    ctx.fillRect(0, top, POSTER_WIDTH, FLOOR_HEIGHT);
    // Ledge line under each storey.
    outlinedRect(ctx, -6, top + FLOOR_HEIGHT - 14, POSTER_WIDTH + 12, 14, facade.trimColor, 2);
  }

  // Brick speckle: low-contrast texture so the wall is not a flat slab.
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = sceneColor(
      randomPick(random, WALL_HUES),
      0.16,
      randomBetween(random, 0.52, 0.74),
      0.35,
    );
    const bx = random() * POSTER_WIDTH;
    const by = ROOF_TOP + random() * (STREET_Y - ROOF_TOP);
    ctx.fillRect(bx, by, randomBetween(random, 14, 34), randomBetween(random, 5, 10));
  }

  // Window recesses.
  for (const slot of facade.windows) {
    outlinedRect(ctx, slot.x - 7, slot.y - 7, slot.width + 14, slot.height + 14, slot.frameColor, 3);
    outlinedRect(ctx, slot.x, slot.y, slot.width, slot.height, sceneColor(228, 0.22, 0.32), 2);
  }

  // Doorways.
  for (const door of facade.doors) {
    outlinedRect(ctx, door.x - 10, door.y - 12, door.width + 20, door.height + 12, facade.trimColor, 3);
    outlinedRect(ctx, door.x, door.y, door.width, door.height, sceneColor(228, 0.2, 0.26), 2);
    // The leaf, swung open against the left jamb.
    outlinedRect(ctx, door.x, door.y, door.width * 0.28, door.height, door.doorColor, 2);
  }

  // Street.
  ctx.fillStyle = sceneColor(48, 0.16, 0.66);
  ctx.fillRect(0, STREET_Y, POSTER_WIDTH, POSTER_HEIGHT - STREET_Y);
  outlinedRect(ctx, -6, STREET_Y - 4, POSTER_WIDTH + 12, 12, facade.trimColor, 2);

  // Paving speckle.
  for (let i = 0; i < 700; i += 1) {
    ctx.fillStyle = sceneColor(
      randomPick(random, [48, 56, 215, 128]),
      0.14,
      randomBetween(random, 0.56, 0.74),
      0.4,
    );
    const px = random() * POSTER_WIDTH;
    const py = STREET_Y + random() * (POSTER_HEIGHT - STREET_Y);
    ctx.fillRect(px, py, randomBetween(random, 18, 46), randomBetween(random, 6, 12));
  }

  // Stoops, drawn before the crowd so people stand on them.
  for (const door of facade.doors) {
    for (let i = door.steps.length - 1; i >= 0; i -= 1) {
      const step = door.steps[i];
      outlinedRect(ctx, step.x, step.y, step.width, step.height + 6, facade.trimColor, 2);
    }
  }
}

/**
 * Everything in front of the people: shutters, glazing bars and balcony
 * railings. Painting these last is what makes a figure look like it is leaning
 * out of a window rather than pasted over it.
 */
export function drawFacadeFront(ctx: CanvasRenderingContext2D, facade: Facade): void {
  for (const slot of facade.windows) {
    // Glazing bar across the lower third.
    ctx.strokeStyle = slot.frameColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(slot.x, slot.y + slot.height * 0.66);
    ctx.lineTo(slot.x + slot.width, slot.y + slot.height * 0.66);
    ctx.stroke();

    if (slot.hasShutters) {
      const shutterWidth = 26;
      outlinedRect(ctx, slot.x - shutterWidth - 6, slot.y - 6, shutterWidth, slot.height + 12, slot.shutterColor, 2);
      outlinedRect(ctx, slot.x + slot.width + 6, slot.y - 6, shutterWidth, slot.height + 12, slot.shutterColor, 2);
    }

    if (slot.balcony) {
      drawRailing(ctx, slot.balcony, facade.trimColor);
    }
  }
}

function drawRailing(ctx: CanvasRenderingContext2D, balcony: Rect, color: string): void {
  outlinedRect(ctx, balcony.x, balcony.y + balcony.height - 12, balcony.width, 12, color, 2);
  outlinedRect(ctx, balcony.x, balcony.y, balcony.width, 9, color, 2);
  const barCount = 9;
  for (let i = 0; i < barCount; i += 1) {
    const bx = balcony.x + 6 + (i * (balcony.width - 12)) / (barCount - 1);
    outlined(
      ctx,
      () => ctx.rect(bx - 2.5, balcony.y, 5, balcony.height - 8),
      color,
      OUTLINE_WIDTH,
    );
  }
}


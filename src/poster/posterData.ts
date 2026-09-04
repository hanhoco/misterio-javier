/**
 * Poster catalogue. This is DATA, not drawing code: it owns the layout, and the
 * renderer reads its coordinates instead of duplicating them. Every bounding
 * box below is derived from the grid constants, never hand typed twice.
 */

import { createRandom } from './random';
import { SEAL_CODE_COUNT, encodeSealCode, type SealDigits } from './seal';
import { POSTER_HEIGHT, POSTER_WIDTH } from './posterLayout';

export { POSTER_HEIGHT, POSTER_WIDTH };

/** The seed the app renders with. Change it and the whole crowd is new. */
export const DEFAULT_POSTER_SEED = 20260903;

const GRID_COLUMNS = 4;
const GRID_ROWS = 2;
const CELL_WIDTH = POSTER_WIDTH / GRID_COLUMNS;
const CELL_HEIGHT = POSTER_HEIGHT / GRID_ROWS;

/** Kind of primitive drawing routine the renderer should use for an object. */
export type PosterObjectShape =
  | 'red-cap'
  | 'book'
  | 'backpack'
  | 'cat'
  | 'clock'
  | 'key'
  | 'ball'
  | 'plant';

/**
 * Everything a consumer downstream of the poster needs from a findable object:
 * a name to put in the mission line, a box to grade the crop against, and the
 * code stamped on it.
 *
 * It is deliberately poster-agnostic. The procedural poster and the image
 * poster (`parkPosterData.ts`) both produce these, which is what lets the
 * decoder, the verdict and the whole UI stay unaware of which one is on screen.
 */
export interface PosterTarget {
  /** Stable machine identifier. */
  id: string;
  /** User facing name, Spanish. */
  name: string;
  /** Bounding box in poster-native pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The base-4 code stamped on this object. */
  sealCode: number;
}

/** A target of the procedural poster, whose id also selects a drawing routine. */
export interface PosterObject extends PosterTarget {
  id: PosterObjectShape;
}

interface PosterObjectDefinition {
  id: PosterObjectShape;
  name: string;
  /** Grid slot, read left to right then top to bottom. */
  column: number;
  row: number;
  /** Size of the object inside its cell, in poster-native pixels. */
  width: number;
  height: number;
  /** Deterministic offset from the cell centre, so the scene is not a grid. */
  offsetX: number;
  offsetY: number;
  /** Seal digits: centre, up, right, down, left. */
  digits: SealDigits;
}

/**
 * The eight findable objects. They are only a little larger than a crowd figure
 * (44-90px tall), which is what makes them genuinely camouflaged: big enough to
 * recognise once you are looking at them, small enough to disappear into the
 * scene until you do.
 *
 * The grid cell plus a bounded offset is what keeps them scattered and
 * guarantees, by construction, that no two bounding boxes can overlap.
 */
const OBJECT_DEFINITIONS: readonly PosterObjectDefinition[] = [
  { id: 'red-cap',  name: 'la gorra roja', column: 0, row: 0, width: 150, height: 104, offsetX: -150, offsetY: -120, digits: [0, 1, 2, 3, 0] },
  { id: 'book',     name: 'el libro',      column: 1, row: 0, width: 140, height: 120, offsetX:  130, offsetY:   90, digits: [1, 2, 3, 0, 1] },
  { id: 'backpack', name: 'la mochila',    column: 2, row: 0, width: 130, height: 160, offsetX: -110, offsetY:  140, digits: [2, 3, 0, 1, 2] },
  { id: 'cat',      name: 'el gato',       column: 3, row: 0, width: 170, height: 130, offsetX:   90, offsetY: -150, digits: [3, 0, 1, 2, 3] },
  { id: 'clock',    name: 'el reloj',      column: 0, row: 1, width: 140, height: 140, offsetX:  140, offsetY: -160, digits: [0, 3, 2, 1, 0] },
  { id: 'key',      name: 'la llave',      column: 1, row: 1, width: 170, height:  96, offsetX: -130, offsetY:  150, digits: [1, 0, 3, 2, 1] },
  { id: 'ball',     name: 'la pelota',     column: 2, row: 1, width: 130, height: 130, offsetX:  120, offsetY:  120, digits: [2, 1, 0, 3, 2] },
  { id: 'plant',    name: 'la planta',     column: 3, row: 1, width: 140, height: 170, offsetX: -140, offsetY: -140, digits: [3, 2, 1, 0, 3] },
];

function toPosterObject(definition: PosterObjectDefinition): PosterObject {
  const cellCenterX = definition.column * CELL_WIDTH + CELL_WIDTH / 2;
  const cellCenterY = definition.row * CELL_HEIGHT + CELL_HEIGHT / 2;
  return {
    id: definition.id,
    name: definition.name,
    x: cellCenterX + definition.offsetX - definition.width / 2,
    y: cellCenterY + definition.offsetY - definition.height / 2,
    width: definition.width,
    height: definition.height,
    sealCode: encodeSealCode(definition.digits),
  };
}

export const POSTER_OBJECTS: readonly PosterObject[] =
  OBJECT_DEFINITIONS.map(toPosterObject);

/** Centre of an object's bounding box: where its seal is stamped. */
export function objectCenter(object: PosterTarget): { x: number; y: number } {
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

export function findObjectById(id: string): PosterObject | undefined {
  return POSTER_OBJECTS.find((object) => object.id === id);
}

export function findObjectBySealCode(code: number): PosterObject | undefined {
  return POSTER_OBJECTS.find((object) => object.sealCode === code);
}

/* -------------------------------------------------------------------------- */
/* Decoy seals                                                                */
/* -------------------------------------------------------------------------- */

/**
 * How many crowd figures carry a seal that leads nowhere.
 *
 * Without decoys the game quietly breaks: a child would notice that seals only
 * ever appear on the eight answers, and would hunt for coloured dots instead of
 * for the object they were asked to find. Camouflage is the whole point.
 */
export const DECOY_SEAL_COUNT = 52;

/**
 * No decoy may be stamped within this distance of a target's centre. It keeps a
 * tight crop around a target unambiguous, which is what the round-trip test
 * checks and what a child experiences as "the answer just works".
 */
export const DECOY_EXCLUSION_RADIUS = 240;

/** Minimum gap between any two stamped seals, so no seal borrows another's arm. */
export const MIN_SEAL_SEPARATION = 70;

/**
 * Draws `count` codes from the 1024-code space, guaranteed distinct from each
 * other and from every code in `reserved`.
 *
 * Poster-agnostic on purpose: the image poster has its own targets and its own
 * decoy budget, and reimplementing this for it would be two chances to get the
 * "never collide with a target" rule wrong instead of one.
 */
export function drawDecoyCodes(
  seed: number,
  count: number,
  reserved: Iterable<number>,
): number[] {
  const random = createRandom(seed ^ 0xdec0);
  const taken = new Set<number>(reserved);
  const codes: number[] = [];
  while (codes.length < count) {
    const code = Math.floor(random() * SEAL_CODE_COUNT);
    if (taken.has(code)) continue;
    taken.add(code);
    codes.push(code);
  }
  return codes;
}

/**
 * Draws `DECOY_SEAL_COUNT` codes from the 1024-code space, guaranteed distinct
 * from each other and from all eight target codes.
 */
export function buildDecoyCodes(seed: number): number[] {
  return drawDecoyCodes(
    seed,
    DECOY_SEAL_COUNT,
    POSTER_OBJECTS.map((object) => object.sealCode),
  );
}

/** The decoy codes used by the poster the app ships with. */
export const POSTER_DECOY_CODES: readonly number[] = buildDecoyCodes(DEFAULT_POSTER_SEED);

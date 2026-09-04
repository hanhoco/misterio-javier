/**
 * Catalogue for the park poster - the illustration the game actually ships
 * with, loaded from `assets/park-source.png`.
 *
 * This is DATA, not drawing code. `imagePoster.ts` reads these boxes to stamp
 * seals; nothing here touches a canvas or the DOM, so the whole catalogue is
 * importable from plain Node for tests.
 */

import {
  SEAL_FOOTPRINT,
  encodeSealCode,
  type SealDigits,
} from './seal';
import { drawDecoyCodes, type PosterTarget } from './posterData';
import { createRandom } from './random';

/* -------------------------------------------------------------------------- */
/* The source image and its crop                                              */
/* -------------------------------------------------------------------------- */

/** Native size of `assets/park-source.png`. */
export const PARK_SOURCE_WIDTH = 1024;
export const PARK_SOURCE_HEIGHT = 559;

/**
 * The illustration ends here; everything to the right is the baked-in "FIND:"
 * legend panel that lists the hidden objects.
 *
 * That panel has to go. The app hands out one mission at a time, and a panel
 * naming every answer turns the search into reading. Measured off the source by
 * scanning column means: columns 0-926 are illustration, column 927 is the
 * antialiased edge of the panel's black rule, column 928 is the rule itself
 * (RGB 4,2,0) and from 929 on it is the panel's cream paper (RGB ~246,238,191).
 * Cropping to 927 keeps the whole picture and none of the rule.
 */
export const PARK_ILLUSTRATION_WIDTH = 927;

/** The cropped illustration's size, which every normalised box is relative to. */
export const PARK_CROP_WIDTH = PARK_ILLUSTRATION_WIDTH;
export const PARK_CROP_HEIGHT = PARK_SOURCE_HEIGHT;

/* -------------------------------------------------------------------------- */
/* The rendered poster                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Width the poster is rendered at, in poster-native pixels.
 *
 * The cropped source is only 927px wide, so every pixel here is invented by the
 * resampler and the result is soft no matter what number we pick. 3000 is a
 * 3.24x upscale: enough that a 48px seal sits on roughly a 15px patch of
 * original artwork (so seals never swamp the object they mark), and enough that
 * the smallest target on the list - the kite, 27x34 source pixels - becomes
 * about 87x110, which comfortably holds a seal. Going to 4000 buys no detail
 * that is not already gone and only makes the mush larger.
 */
export const PARK_POSTER_WIDTH = 3000;

/** Derived so the poster never distorts the illustration's aspect ratio. */
export const PARK_POSTER_SCALE = PARK_POSTER_WIDTH / PARK_CROP_WIDTH;
export const PARK_POSTER_HEIGHT = Math.round(PARK_CROP_HEIGHT * PARK_POSTER_SCALE);

/** The seed the park poster's decoys are drawn with. */
export const DEFAULT_PARK_SEED = 20260903;

/* -------------------------------------------------------------------------- */
/* Targets                                                                    */
/* -------------------------------------------------------------------------- */

/** A box in normalised 0-1 coordinates, relative to the CROPPED illustration. */
export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParkTargetDefinition extends NormalizedBox {
  /** Stable machine identifier. English, like every other identifier. */
  id: string;
  /** User facing name, as it reads in the mission line. */
  name: string;
  /** Seal digits: centre, up, right, down, left. */
  digits: SealDigits;
}

/**
 * The fifteen findable objects, measured off the cropped illustration by eye
 * and stored normalised so they survive any change to `PARK_POSTER_WIDTH`.
 *
 * The comment on each line is the box in cropped-source pixels (927x559), which
 * is the unit they were actually measured in; the normalised values are those
 * divided by 927 and 559. Boxes are kept clear of each other by construction -
 * `parkPoster.test.ts` proves it - because two overlapping boxes would put two
 * seals inside one crop and make the verdict ambiguous.
 *
 * Anything too small to carry a 48px seal at `PARK_POSTER_WIDTH` is left out on
 * purpose: the whistle, the earring and the squirrel's wagon are all a handful
 * of source pixels across and could not hold one.
 */
const PARK_TARGET_DEFINITIONS: readonly ParkTargetDefinition[] = [
  // x=61  y=10   w=27   h=34   - the red and yellow kite in the top-left sky.
  { id: 'kite', name: 'the yellow kite', x: 0.06581, y: 0.01789, width: 0.02913, height: 0.06082, digits: [0, 0, 1, 2, 3] },
  // x=160 y=100  w=106  h=122  - the red-roofed tower and the grey slide.
  { id: 'slide', name: 'the playground slide', x: 0.17260, y: 0.17889, width: 0.11435, height: 0.21824, digits: [0, 1, 3, 2, 1] },
  // x=274 y=132  w=76   h=80   - the swing frame right of the playground.
  { id: 'swings', name: 'the swings', x: 0.29558, y: 0.23614, width: 0.08199, height: 0.14311, digits: [0, 2, 1, 3, 2] },
  // x=138 y=302  w=102  h=86   - the water, west of the bridge.
  { id: 'pond', name: 'the duck pond', x: 0.14887, y: 0.54025, width: 0.11003, height: 0.15385, digits: [0, 3, 2, 1, 3] },
  // x=246 y=293  w=92   h=51   - the arched wooden footbridge.
  { id: 'bridge', name: 'the wooden bridge', x: 0.26537, y: 0.52415, width: 0.09925, height: 0.09123, digits: [1, 0, 2, 3, 1] },
  // x=415 y=120  w=105  h=124  - trunk and lower canopy of the central oak.
  { id: 'oak', name: 'the big oak tree in the middle', x: 0.44768, y: 0.21467, width: 0.11327, height: 0.22182, digits: [1, 1, 3, 0, 2] },
  // x=340 y=248  w=110  h=44   - the red-checked picnic blanket under the oak.
  { id: 'pinkBlanket', name: 'the pink picnic blanket', x: 0.36678, y: 0.44365, width: 0.11866, height: 0.07871, digits: [1, 2, 0, 3, 3] },
  // x=32  y=498  w=106  h=46   - the blue-checked blanket, bottom left.
  { id: 'blueBlanket', name: 'the blue picnic blanket', x: 0.03452, y: 0.89087, width: 0.11435, height: 0.08229, digits: [1, 3, 1, 2, 0] },
  // x=618 y=126  w=115  h=86   - the yellow "FIELD FEASTS" truck by the school.
  { id: 'yellowTruck', name: 'the yellow food truck', x: 0.66667, y: 0.22540, width: 0.12406, height: 0.15385, digits: [2, 0, 3, 1, 2] },
  // x=588 y=456  w=121  h=90   - the white and orange food truck, bottom right.
  { id: 'whiteTruck', name: 'the white food truck', x: 0.63430, y: 0.81574, width: 0.13053, height: 0.16100, digits: [2, 1, 2, 0, 3] },
  // x=841 y=134  w=72   h=36   - the school bus on the road. Ends at x=913,
  // fourteen pixels clear of the crop line, so the crop does not clip it.
  { id: 'schoolBus', name: 'the school bus', x: 0.90723, y: 0.23971, width: 0.07767, height: 0.06440, digits: [2, 2, 3, 3, 0] },
  // x=668 y=50   w=245 h=72    - the brick school with the clock tower.
  { id: 'school', name: 'the school building', x: 0.72060, y: 0.08945, width: 0.26429, height: 0.12880, digits: [2, 3, 0, 2, 1] },
  // x=531 y=305  w=97   h=145  - the red-roofed bandstand with the musicians.
  // Named for the musicians, not the roof: there is no carousel in this
  // illustration, and a child sent to find one would search forever.
  { id: 'carousel', name: 'the band stand', x: 0.57282, y: 0.54562, width: 0.10464, height: 0.25939, digits: [3, 0, 1, 3, 2] },
  // x=631 y=320  w=81   h=80   - the near soccer goal and its net.
  { id: 'goal', name: 'the soccer goal', x: 0.68069, y: 0.57245, width: 0.08738, height: 0.14311, digits: [3, 1, 0, 1, 3] },
  // x=760 y=390  w=155  h=75   - the vegetable beds along the right fence.
  { id: 'garden', name: 'the vegetable garden', x: 0.81985, y: 0.69767, width: 0.16721, height: 0.13417, digits: [3, 2, 2, 0, 1] },
];

/** A park target, in poster-native pixels, ready for the decoder and verdict. */
export interface ParkTarget extends PosterTarget {
  /** The box it came from, still normalised, for the marking tool round-trip. */
  normalized: NormalizedBox;
}

function toParkTarget(definition: ParkTargetDefinition): ParkTarget {
  return {
    id: definition.id,
    name: definition.name,
    x: definition.x * PARK_POSTER_WIDTH,
    y: definition.y * PARK_POSTER_HEIGHT,
    width: definition.width * PARK_POSTER_WIDTH,
    height: definition.height * PARK_POSTER_HEIGHT,
    sealCode: encodeSealCode(definition.digits),
    normalized: {
      x: definition.x,
      y: definition.y,
      width: definition.width,
      height: definition.height,
    },
  };
}

export const PARK_TARGETS: readonly ParkTarget[] =
  PARK_TARGET_DEFINITIONS.map(toParkTarget);

/** The raw definitions, for the marking tool's "which codes are free" question. */
export const PARK_TARGET_DEFINITION_LIST: readonly ParkTargetDefinition[] =
  PARK_TARGET_DEFINITIONS;

export function findParkTargetById(id: string): ParkTarget | undefined {
  return PARK_TARGETS.find((target) => target.id === id);
}

export function findParkTargetBySealCode(code: number): ParkTarget | undefined {
  return PARK_TARGETS.find((target) => target.sealCode === code);
}

/* -------------------------------------------------------------------------- */
/* Decoy seals                                                                */
/* -------------------------------------------------------------------------- */

/**
 * How many crowd figures carry a seal that leads nowhere.
 *
 * The park poster is 5.4 megapixels against the procedural poster's 3.8, and it
 * is far busier, so it takes a few more decoys before a child stops treating
 * "a coloured dot" as the answer and starts looking for the object.
 */
export const PARK_DECOY_SEAL_COUNT = 24;

/** Minimum gap between any two stamped seals, so no seal borrows another's arm. */
export const PARK_MIN_SEAL_SEPARATION = 90;

/**
 * How far outside a target's own box a decoy must stay.
 *
 * A margin, not a radius: the targets range from a 27px kite to a 245px school
 * building, and a circle wide enough to protect the school would sterilise a
 * third of the poster. The value is the crop slack a child gets plus a whole
 * seal footprint, so a crop that holds the target holds only the target's seal.
 */
export const PARK_DECOY_EXCLUSION_MARGIN = 60 + SEAL_FOOTPRINT;

/** Half a seal's footprint plus slack: no seal may straddle a poster edge. */
export const PARK_SEAL_EDGE_MARGIN = SEAL_FOOTPRINT / 2 + 8;

/** How many random sites to try before giving up on placing the decoys. */
const PARK_DECOY_CANDIDATE_COUNT = 6000;

/**
 * Draws `PARK_DECOY_SEAL_COUNT` codes, guaranteed distinct from each other and
 * from all fifteen park target codes.
 */
export function buildParkDecoyCodes(seed: number = DEFAULT_PARK_SEED): number[] {
  return drawDecoyCodes(
    seed,
    PARK_DECOY_SEAL_COUNT,
    PARK_TARGETS.map((target) => target.sealCode),
  );
}

/** The decoy codes used by the park poster the app ships with. */
export const PARK_DECOY_CODES: readonly number[] = buildParkDecoyCodes(DEFAULT_PARK_SEED);

/**
 * Candidate decoy sites: deterministic points scattered over the whole poster.
 *
 * The procedural poster hangs its decoys on crowd figures, which it knows the
 * coordinates of. Here the artwork is opaque pixels, so the best we can do is
 * scatter - and because the park illustration is wall-to-wall people, benches,
 * ducks and vegetables, a scattered point lands on something almost every time.
 */
export function buildParkDecoySites(
  seed: number = DEFAULT_PARK_SEED,
): Array<{ x: number; y: number }> {
  const random = createRandom(seed ^ 0x9a12);
  const sites: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < PARK_DECOY_CANDIDATE_COUNT; i += 1) {
    sites.push({
      x: random() * PARK_POSTER_WIDTH,
      y: random() * PARK_POSTER_HEIGHT,
    });
  }
  return sites;
}

/** True when a decoy at this point would stay out of every target's crop. */
export function isClearOfParkTargets(x: number, y: number): boolean {
  return !PARK_TARGETS.some(
    (target) =>
      x >= target.x - PARK_DECOY_EXCLUSION_MARGIN &&
      x <= target.x + target.width + PARK_DECOY_EXCLUSION_MARGIN &&
      y >= target.y - PARK_DECOY_EXCLUSION_MARGIN &&
      y <= target.y + target.height + PARK_DECOY_EXCLUSION_MARGIN,
  );
}

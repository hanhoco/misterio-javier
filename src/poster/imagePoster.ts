/**
 * Turns a supplied illustration into a playable poster, entirely in the
 * browser and with no extra dependencies.
 *
 * The pipeline, in order, and every step is load bearing:
 *
 *   1. Crop off the legend panel baked into the right edge of the source. It
 *      names every hidden object, and the app hands out one mission at a time.
 *   2. Upscale the crop onto an offscreen canvas at `PARK_POSTER_WIDTH`. The
 *      result is soft - the source is only 927px wide after the crop - and that
 *      is a known, accepted trade: it is the user's own artwork.
 *   3. Sanitise the palette, so no pixel of the illustration can be mistaken
 *      for a seal dot. See `paletteSanitizer.ts`.
 *   4. Stamp the seals: one centred on each target, plus decoys scattered
 *      clear of them, using the same placement rules as the procedural poster.
 *
 * Steps 3 and 4 are pure and DOM-free, so the tests exercise the real code.
 * Only step 2 needs a canvas.
 */

import {
  DEFAULT_PARK_SEED,
  PARK_CROP_HEIGHT,
  PARK_CROP_WIDTH,
  PARK_ILLUSTRATION_WIDTH,
  PARK_MIN_SEAL_SEPARATION,
  PARK_POSTER_HEIGHT,
  PARK_POSTER_WIDTH,
  PARK_SEAL_EDGE_MARGIN,
  PARK_SOURCE_WIDTH,
  PARK_TARGETS,
  buildParkDecoyCodes,
  buildParkDecoySites,
  isClearOfParkTargets,
} from './parkPosterData';
import { objectCenter } from './posterData';
import { sanitizePalette, type SanitizeStats } from './paletteSanitizer';
import { planSeals, type StampedSeal } from './sealPlacement';
import { drawSeal } from './posterRenderer';

export { PARK_POSTER_HEIGHT, PARK_POSTER_WIDTH };

/**
 * Decides every seal on the park poster. Pure: no canvas, no image, no DOM.
 *
 * Targets first, at the exact centre of their box - which is what guarantees
 * that any crop tight enough to hold the object also holds its seal - then
 * decoys on scattered sites that clear every target's crop region.
 */
export function planParkSeals(seed: number = DEFAULT_PARK_SEED): StampedSeal[] {
  const targets: StampedSeal[] = PARK_TARGETS.map((target) => {
    const center = objectCenter(target);
    return { code: target.sealCode, centerX: center.x, centerY: center.y, isTarget: true };
  });

  return planSeals({
    targets,
    decoyCodes: buildParkDecoyCodes(seed),
    candidates: buildParkDecoySites(seed),
    posterWidth: PARK_POSTER_WIDTH,
    posterHeight: PARK_POSTER_HEIGHT,
    edgeMargin: PARK_SEAL_EDGE_MARGIN,
    minSeparation: PARK_MIN_SEAL_SEPARATION,
    isClearOfTargets: isClearOfParkTargets,
  });
}

/* -------------------------------------------------------------------------- */
/* Browser pipeline                                                           */
/* -------------------------------------------------------------------------- */

export interface ImagePosterOptions {
  /** URL of the source illustration, legend panel and all. */
  sourceUrl: string;
  /** Seed for the decoy draw and their scatter. */
  seed?: number;
}

export interface ImagePosterResult {
  canvas: HTMLCanvasElement;
  seals: StampedSeal[];
  sanitizer: SanitizeStats;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () =>
      reject(new Error(`Could not load the illustration: ${url}`)),
    );
    image.src = url;
  });
}

/**
 * Where the legend panel starts in *this* image.
 *
 * Expressed as a fraction of the source width rather than a fixed column, so a
 * re-export of the same artwork at a different resolution still gets cropped in
 * the same place instead of silently keeping a slice of the panel.
 */
export function legendCropWidth(sourceWidth: number): number {
  return Math.round(sourceWidth * (PARK_ILLUSTRATION_WIDTH / PARK_SOURCE_WIDTH));
}

/**
 * Renders the whole park poster into a fresh offscreen canvas at native size.
 *
 * Awaiting this is not instant: the upscale writes 5.4 million pixels and the
 * sanitiser then reads all of them back. The caller is expected to be showing a
 * loading state while it runs.
 */
export async function renderImagePoster(
  options: ImagePosterOptions,
): Promise<ImagePosterResult> {
  const seed = options.seed ?? DEFAULT_PARK_SEED;
  const image = await loadImage(options.sourceUrl);

  const sourceWidth = image.naturalWidth || PARK_SOURCE_WIDTH;
  const sourceHeight = image.naturalHeight || PARK_CROP_HEIGHT;
  const cropWidth = legendCropWidth(sourceWidth);

  const canvas = document.createElement('canvas');
  canvas.width = PARK_POSTER_WIDTH;
  canvas.height = PARK_POSTER_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');

  // Step 1 and 2: crop the legend off and upscale what is left.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    0,
    0,
    cropWidth,
    sourceHeight,
    0,
    0,
    PARK_POSTER_WIDTH,
    PARK_POSTER_HEIGHT,
  );

  // Step 3: make the illustration invisible to the decoder.
  const pixels = ctx.getImageData(0, 0, PARK_POSTER_WIDTH, PARK_POSTER_HEIGHT);
  const sanitizer = sanitizePalette(pixels);
  ctx.putImageData(pixels, 0, 0);

  // Step 4: stamp last, so nothing can occlude a seal.
  const seals = planParkSeals(seed);
  for (const seal of seals) {
    drawSeal(ctx, seal.centerX, seal.centerY, seal.code);
  }

  return { canvas, seals, sanitizer };
}

/**
 * The poster with the legend cropped and the palette sanitised, but no seals
 * on it. This is what the marking tool draws boxes over: seals would only get
 * in the way of judging where an object actually starts and ends.
 */
export async function renderImagePosterBackground(
  options: Pick<ImagePosterOptions, 'sourceUrl'>,
): Promise<HTMLCanvasElement> {
  const image = await loadImage(options.sourceUrl);
  const sourceWidth = image.naturalWidth || PARK_SOURCE_WIDTH;
  const sourceHeight = image.naturalHeight || PARK_CROP_HEIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = PARK_POSTER_WIDTH;
  canvas.height = PARK_POSTER_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    0,
    0,
    legendCropWidth(sourceWidth),
    sourceHeight,
    0,
    0,
    PARK_POSTER_WIDTH,
    PARK_POSTER_HEIGHT,
  );

  const pixels = ctx.getImageData(0, 0, PARK_POSTER_WIDTH, PARK_POSTER_HEIGHT);
  sanitizePalette(pixels);
  ctx.putImageData(pixels, 0, 0);

  return canvas;
}

/** Re-exported so callers do not have to reach into two modules for the geometry. */
export { PARK_CROP_HEIGHT, PARK_CROP_WIDTH };

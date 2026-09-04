/**
 * Where seals go, for any poster.
 *
 * The two placement rules below are what make a crop readable, and they are the
 * same whether the artwork underneath was drawn by `posterRenderer.ts` or
 * loaded from a PNG. Keeping them in one poster-agnostic module means the image
 * poster inherits the invariants the procedural poster's tests already guard,
 * instead of growing a second, subtly different copy of them.
 *
 * No DOM here, so it is importable from plain Node for tests.
 */

/** One seal actually painted onto a poster. */
export interface StampedSeal {
  code: number;
  centerX: number;
  centerY: number;
  /** True for a findable target, false for a camouflage decoy. */
  isTarget: boolean;
}

/** A position a decoy may be stamped on, in poster-native pixels. */
export interface SealSite {
  x: number;
  y: number;
}

export interface SealPlacementOptions {
  /** The targets, already placed. Decoys are fitted around them. */
  targets: readonly StampedSeal[];
  /** Codes to hand out to decoys, in order. Placement stops when they run out. */
  decoyCodes: readonly number[];
  /** Positions a decoy is allowed to take, best first. */
  candidates: readonly SealSite[];
  posterWidth: number;
  posterHeight: number;
  /** No seal centre closer than this to a poster edge, so none straddles it. */
  edgeMargin: number;
  /** Minimum gap between any two stamped seals. */
  minSeparation: number;
  /**
   * True when a decoy at this point would not pollute any target's crop.
   *
   * A predicate rather than a radius because the two posters need different
   * shapes: the procedural targets are all about the same size (a circle is
   * right), while the park targets range from a 27px kite to a 245px school
   * building (a circle sized for the school would sterilise the poster).
   */
  isClearOfTargets: (x: number, y: number) => boolean;
}

/**
 * Decides every seal on a poster: the targets exactly where they were asked
 * for, then decoys on the first candidate sites that satisfy both rules.
 *
 *   - no decoy inside a target's crop region, so a tight crop around a target
 *     reads cleanly;
 *   - no two seals within `minSeparation`, so the decoder never mistakes one
 *     seal's dot for another seal's arm.
 */
export function planSeals(options: SealPlacementOptions): StampedSeal[] {
  const {
    targets,
    decoyCodes,
    candidates,
    posterWidth,
    posterHeight,
    edgeMargin,
    minSeparation,
    isClearOfTargets,
  } = options;

  const placed: StampedSeal[] = [...targets];
  let decoyCount = 0;

  for (const site of candidates) {
    if (decoyCount >= decoyCodes.length) break;
    const { x, y } = site;
    if (
      x < edgeMargin ||
      x > posterWidth - edgeMargin ||
      y < edgeMargin ||
      y > posterHeight - edgeMargin
    ) {
      continue;
    }
    if (!isClearOfTargets(x, y)) continue;
    const tooCloseToSeal = placed.some(
      (seal) => Math.hypot(seal.centerX - x, seal.centerY - y) < minSeparation,
    );
    if (tooCloseToSeal) continue;

    placed.push({ code: decoyCodes[decoyCount], centerX: x, centerY: y, isTarget: false });
    decoyCount += 1;
  }

  return placed;
}

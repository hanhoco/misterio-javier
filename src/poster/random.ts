/**
 * Deterministic pseudo-random source.
 *
 * The whole poster is generated from a single integer seed: same seed, same
 * pixels, forever. That is not a nicety, it is what makes the poster testable
 * (pixel hashes, palette scans, seal round-trips) and what lets a teacher get a
 * brand new scene by changing one number.
 *
 * mulberry32: 32-bit state, excellent avalanche for its size, four lines long.
 */
export type Random = () => number;

/** Creates a generator producing floats in [0, 1). */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [min, max). */
export function randomBetween(random: Random, min: number, max: number): number {
  return min + random() * (max - min);
}

/** Uniform integer in [min, max]. */
export function randomInt(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/** Picks one element. The array must not be empty. */
export function randomPick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

/** True with the given probability. */
export function randomChance(random: Random, probability: number): boolean {
  return random() < probability;
}

/** Fisher-Yates on a copy, so the caller's array is untouched. */
export function shuffled<T>(random: Random, items: readonly T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

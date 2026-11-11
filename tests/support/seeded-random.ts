/**
 * Deterministic PRNG (mulberry32) for property-style tests. A fixed seed
 * keeps every "random" sample reproducible: a failing run can be replayed
 * byte-for-byte, and CI flakes are traceable to a seed instead of drowned
 * in randomness.
 */
export type SeededRandom = () => number;

export function makeRandom(seed: number): SeededRandom {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks one element uniformly at random. */
export function pick<T>(random: SeededRandom, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}

/** Uniform integer in `[0, max)`. */
export function intBelow(random: SeededRandom, max: number): number {
  return Math.floor(random() * max);
}

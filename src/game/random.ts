/** Anything that carries the random generator's state, like the game state. */
export type RandomSource = { randomState: number };

/** The generator state for a seed. */
export function seedRandom(seed: number): number {
    return seed >>> 0;
}

/**
 * The next random value in [0, 1) from a seeded generator (mulberry32), advancing the state stored in `source`. Only
 * integer operations, so every machine gets the same sequence.
 */
export function nextRandom(source: RandomSource): number {
    source.randomState = (source.randomState + 0x6d2b79f5) >>> 0;
    let value = source.randomState;

    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

/** A random integer in [0, count). */
export function nextRandomInteger(source: RandomSource, count: number): number {
    return Math.floor(nextRandom(source) * count);
}

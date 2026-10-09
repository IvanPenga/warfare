// Deterministic noise and random numbers. Pure math, so the level generator, the renderer and (later) the game rules
// can all use it.

/** Integer hash with good bit mixing. Returns an unsigned 32-bit integer. */
export function hashInteger(value: number): number {
    let hash = value | 0;

    hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
    hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);

    return (hash ^ (hash >>> 16)) >>> 0;
}

/** A deterministic value in [0, 1) for a grid position and seed. */
export function hash2d(x: number, y: number, seed = 0): number {
    return hashInteger(hashInteger(hashInteger(seed) ^ x) ^ y) / 4294967296;
}

/** A seeded random number generator (mulberry32) returning values in [0, 1). */
export function createRandom(seed: number): () => number {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;

        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

/** Smooth 1D value noise in [0, 1). */
export function valueNoise(x: number, seed: number): number {
    const cell = Math.floor(x);
    const start = hash2d(cell, 0, seed);
    const end = hash2d(cell + 1, 0, seed);

    return start + (end - start) * smoothstep(x - cell);
}

/** Several octaves of 1D value noise, each twice as detailed and half as strong, in [0, 1). */
export function fractalNoise(x: number, octaves: number, seed: number): number {
    let sum = 0;
    let amplitude = 1;
    let total = 0;

    for (let octave = 0; octave < octaves; octave++) {
        sum += valueNoise(x * 2 ** octave, seed + octave) * amplitude;
        total += amplitude;
        amplitude /= 2;
    }

    return sum / total;
}

/** Smooth 2D value noise in [0, 1). */
export function valueNoise2d(x: number, y: number, seed: number): number {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const tx = smoothstep(x - cellX);
    const ty = smoothstep(y - cellY);
    const top = hash2d(cellX, cellY, seed) + (hash2d(cellX + 1, cellY, seed) - hash2d(cellX, cellY, seed)) * tx;
    const bottom =
        hash2d(cellX, cellY + 1, seed) + (hash2d(cellX + 1, cellY + 1, seed) - hash2d(cellX, cellY + 1, seed)) * tx;

    return top + (bottom - top) * ty;
}

/** Smooth 1D value noise in [0, 1) that repeats every `period` units, so images built from it tile seamlessly. */
export function periodicNoise(x: number, period: number, seed: number): number {
    const cell = Math.floor(x);
    const wrap = (index: number) => ((index % period) + period) % period;
    const start = hash2d(wrap(cell), 0, seed);
    const end = hash2d(wrap(cell + 1), 0, seed);

    return start + (end - start) * smoothstep(x - cell);
}

/** Several octaves of periodic noise, each twice as detailed and half as strong. Still repeats every `period`. */
export function periodicFbm(x: number, period: number, octaves: number, seed: number): number {
    let sum = 0;
    let amplitude = 1;
    let total = 0;

    for (let octave = 0; octave < octaves; octave++) {
        const scale = 2 ** octave;

        sum += periodicNoise(x * scale, period * scale, seed + octave) * amplitude;
        total += amplitude;
        amplitude /= 2;
    }

    return sum / total;
}

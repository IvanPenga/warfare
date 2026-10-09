import { addBedrockBorder, getDefaultSpawnZone, type Level } from './level.ts';
import { fractalNoise, valueNoise2d } from './noise.ts';
import { materialIds } from './materials.ts';

export type TerrainOptions = {
    seed: number;
    /** Average height of the ground, as a fraction of the level height. */
    groundLevel: number;
    /** How far hills rise and valleys drop from the average, as a fraction of the level height. */
    hilliness: number;
    /** 1 gives a few long smooth hills; higher values give more, bumpier ones. */
    roughness: number;
    /** Share of the underground that is hollowed out into caves, 0 to 1. */
    caves: number;
    /** Share of the underground that is rock instead of dirt, 0 to 1. */
    rock: number;
    /** Mirror the left half onto the right, so both sides get the same terrain. */
    symmetric: boolean;
};

export const defaultTerrainOptions: TerrainOptions = {
    seed: 1,
    groundLevel: 0.4,
    hilliness: 0.2,
    roughness: 2,
    caves: 0.15,
    rock: 0.2,
    symmetric: true
};

/** Slider limits for the number options, for the editor. */
export const terrainOptionRanges = {
    groundLevel: { min: 0.1, max: 0.8, step: 0.05 },
    hilliness: { min: 0, max: 0.4, step: 0.02 },
    roughness: { min: 1, max: 5, step: 1 },
    caves: { min: 0, max: 0.5, step: 0.05 },
    rock: { min: 0, max: 0.6, step: 0.05 }
} as const satisfies Partial<Record<keyof TerrainOptions, { min: number; max: number; step: number }>>;

/** Caves start this many cells below the surface, so the ground tanks stand on stays solid. */
const caveDepth = 4;
/** Rock starts this many cells below the surface. */
const rockDepth = 3;
/** The surface stays this many cells away from the top of the level and from the bedrock floor. */
const surfaceMargin = 3;

/** The row of the topmost terrain cell in each column. */
function getSurface(level: Pick<Level, 'width' | 'height'>, options: TerrainOptions, x: number): number {
    const hillCount = 1 + options.roughness * 1.5;
    const octaves = 1 + options.roughness;
    const noise = fractalNoise((x / level.width) * hillCount, octaves, options.seed);
    const height = options.groundLevel + (noise - 0.5) * 2 * options.hilliness;
    const row = Math.round(level.height * (1 - height));

    return Math.min(level.height - 1 - surfaceMargin, Math.max(surfaceMargin, row));
}

/** Two octaves of 2D noise, the second shifted so the lattice of the first does not show as straight bands. */
function blobNoise(x: number, y: number, seed: number): number {
    return (valueNoise2d(x, y, seed) * 2 + valueNoise2d(x * 2.3 + 17.1, y * 2.3 + 5.7, seed + 1)) / 3;
}

/** The value that `share` of the values are above: the cut-off that turns that share of cells into caves or rock. */
function getThreshold(values: number[], share: number): number {
    if (share <= 0 || values.length === 0) {
        return Infinity;
    }
    const sorted = [...values].sort((a, b) => a - b);

    return sorted[Math.min(sorted.length - 1, Math.floor((1 - share) * sorted.length))];
}

/**
 * A copy of the level with new terrain on both layers: hills of dirt with rock and caves underground, a
 * bedrock border and the default spawn zones. Name, size and background stay. The same options always give the same
 * terrain.
 */
export function generateTerrain(level: Level, options: TerrainOptions): Level {
    const { width, height } = level;
    const mirror = (x: number) => (options.symmetric && x >= width / 2 ? width - 1 - x : x);
    const surfaces = Array.from({ length: width }, (_, x) => getSurface(level, options, mirror(x)));
    const caveNoise = (x: number, y: number) => blobNoise(mirror(x) / 10, y / 6, options.seed + 101);
    const rockNoise = (x: number, y: number) => blobNoise(mirror(x) / 7, y / 7, options.seed + 202);
    const underground = (minimumDepth: number) => {
        const cells: { x: number; y: number }[] = [];

        for (let y = 0; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                if (y - surfaces[x] >= minimumDepth) {
                    cells.push({ x, y });
                }
            }
        }

        return cells;
    };
    const caveThreshold = getThreshold(
        underground(caveDepth).map(({ x, y }) => caveNoise(x, y)),
        options.caves
    );
    const rockThreshold = getThreshold(
        underground(rockDepth).map(({ x, y }) => rockNoise(x, y)),
        options.rock
    );
    const terrain: number[][] = [];
    const backWall: number[][] = [];

    for (let y = 0; y < height; y++) {
        const terrainRow = new Array<number>(width).fill(materialIds.air);
        const backRow = new Array<number>(width).fill(materialIds.air);

        for (let x = 0; x < width; x++) {
            const depth = y - surfaces[x];

            if (depth < 0) {
                continue;
            }
            if (depth === 0) {
                terrainRow[x] = materialIds.dirt;
                continue;
            }
            backRow[x] = materialIds.dirt;
            if (depth >= caveDepth && caveNoise(x, y) >= caveThreshold) {
                continue;
            }
            terrainRow[x] =
                depth >= rockDepth && rockNoise(x, y) >= rockThreshold ? materialIds.rock : materialIds.dirt;
        }
        terrain.push(terrainRow);
        backWall.push(backRow);
    }
    const generated: Level = { ...level, layers: { backWall, terrain } };

    addBedrockBorder(generated);
    generated.spawnZones = {
        left: getDefaultSpawnZone(level, 'left'),
        right: getDefaultSpawnZone(level, 'right')
    };

    return generated;
}

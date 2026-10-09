import { describe, expect, it } from 'vitest';
import { createLevel, parseLevel } from './level';
import { lintLevel } from './lint';
import { defaultTerrainOptions, generateTerrain } from './terrain-generator';
import { materialIds } from './materials';

const level = createLevel('test', 'Test', 160, 60);

function countTiles(rows: number[][], tileId: number): number {
    return rows.flat().filter((id) => id === tileId).length;
}

describe('generateTerrain', () => {
    it('gives the same terrain for the same options and different terrain for another seed', () => {
        const first = generateTerrain(level, defaultTerrainOptions);

        expect(generateTerrain(level, defaultTerrainOptions)).toEqual(first);
        expect(generateTerrain(level, { ...defaultTerrainOptions, seed: 2 }).layers).not.toEqual(first.layers);
    });

    it('makes a valid level without problems', () => {
        const generated = generateTerrain(level, defaultTerrainOptions);

        expect(parseLevel(generated)).toEqual(generated);
        expect(lintLevel(generated)).toEqual([]);
    });

    it('mirrors the terrain when symmetric', () => {
        const { terrain } = generateTerrain(level, { ...defaultTerrainOptions, caves: 0.4, rock: 0.4 }).layers;

        for (const row of terrain) {
            expect(row).toEqual([...row].reverse());
        }
    });

    it('puts dirt on top of every column and a back wall behind the underground', () => {
        const generated = generateTerrain(level, defaultTerrainOptions);
        const { terrain, backWall } = generated.layers;

        for (let x = 1; x < level.width - 1; x++) {
            const surface = terrain.findIndex((row) => row[x] !== materialIds.air);

            expect(terrain[surface][x]).toBe(materialIds.dirt);
            expect(backWall[surface][x]).toBe(materialIds.air);
            expect(backWall[surface + 1][x]).toBe(materialIds.dirt);
        }
    });

    it('adds more caves and rock when asked', () => {
        const plain = generateTerrain(level, { ...defaultTerrainOptions, caves: 0, rock: 0 });
        const rough = generateTerrain(level, { ...defaultTerrainOptions, caves: 0.5, rock: 0.6 });
        const holes = (generated: typeof level) =>
            countTiles(generated.layers.backWall, materialIds.dirt) -
            countTiles(generated.layers.terrain, materialIds.dirt) -
            countTiles(generated.layers.terrain, materialIds.rock);

        expect(countTiles(plain.layers.terrain, materialIds.rock)).toBe(0);
        expect(countTiles(rough.layers.terrain, materialIds.rock)).toBeGreaterThan(200);
        expect(holes(rough)).toBeGreaterThan(holes(plain) + 200);
    });
});

import { describe, expect, it } from 'vitest';
import { tankTypeIds } from '../game/tank-types';
import { turretHeight } from '../game/tanks';
import { outlineColor, type SpriteGrid } from './pixel-grid';
import { buildTankSprite } from './tank-sprites';

function getPixel(grid: SpriteGrid, x: number, y: number) {
    const column = x + grid.originX;
    const row = y + grid.height;

    if (column < 0 || column >= grid.width || row < 0 || row >= grid.height) {
        return null;
    }

    return grid.pixels[row * grid.width + column];
}

describe('buildTankSprite', () => {
    for (const typeId of tankTypeIds) {
        it(`draws the ${typeId} standing on the ground with an outline`, () => {
            const grid = buildTankSprite(typeId, '#4f8dff');
            const filled = grid.pixels.filter(Boolean).length;

            expect(filled).toBeGreaterThan(100);
            // Something stands on the row just above the ground.
            expect(grid.pixels.slice((grid.height - 1) * grid.width).some(Boolean)).toBe(true);
            // Nothing is cut off at the sides or the top: the outermost columns and the top row stay empty.
            for (let row = 0; row < grid.height; row++) {
                expect(grid.pixels[row * grid.width]).toBeNull();
                expect(grid.pixels[row * grid.width + grid.width - 1]).toBeNull();
            }
            expect(grid.pixels.slice(0, grid.width).every((pixel) => pixel === null)).toBe(true);
            // Every part pixel at the edge of the silhouette has outline next to it.
            for (let y = -grid.height; y < 0; y++) {
                for (let x = -grid.originX; x < grid.width - grid.originX; x++) {
                    const pixel = getPixel(grid, x, y);

                    if (pixel && pixel !== outlineColor) {
                        for (const [dx, dy] of [
                            [1, 0],
                            [-1, 0],
                            [0, -1]
                        ]) {
                            expect(getPixel(grid, x + dx, y + dy)).not.toBeNull();
                        }
                    }
                }
            }
        });

        it(`puts part of the ${typeId} at the turret pivot`, () => {
            const grid = buildTankSprite(typeId, '#ff5a4f');

            expect(getPixel(grid, 0, -turretHeight) ?? getPixel(grid, -1, -turretHeight)).not.toBeNull();
        });
    }
});

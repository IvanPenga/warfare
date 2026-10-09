import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createLevel, fillRectangle, tileSize } from '../level/level';
import { materialIds } from '../level/materials';
import { carveCrater, createTerrainMask, getMaterialAt, isAreaSolid } from './terrain-mask';

// 40 × 20 cells: dirt from row 15 down, bedrock border.
const level = createLevel('test', 'Test', 40, 20);

describe('createTerrainMask', () => {
    it('keeps flat ground and the border on the cell edges', () => {
        const mask = createTerrainMask(level);

        expect(mask.width).toBe(40 * tileSize);
        expect(mask.height).toBe(20 * tileSize);
        expect(getMaterialAt(mask, 100, 15 * tileSize - 1)).toBe(materialIds.air);
        expect(getMaterialAt(mask, 100, 15 * tileSize)).toBe(materialIds.dirt);
        expect(getMaterialAt(mask, 5, 5)).toBe(materialIds.bedrock);
        expect(getMaterialAt(mask, tileSize - 1, 5)).toBe(materialIds.bedrock);
        expect(getMaterialAt(mask, tileSize, 5)).toBe(materialIds.air);
    });

    it('turns a step of one cell into a slope that rises at most two pixels per pixel', () => {
        const stepped = produce(level, (draft) =>
            fillRectangle(draft, 'terrain', { x: 20, y: 14 }, { x: 38, y: 14 }, materialIds.rock)
        );
        const mask = createTerrainMask(stepped);
        const surface = (x: number) => {
            let y = 0;

            while (getMaterialAt(mask, x, y) === materialIds.air) {
                y++;
            }

            return y;
        };

        // The step is at x = 320. Away from it the ground stays on the cell edges.
        expect(surface(310)).toBe(15 * tileSize);
        expect(surface(330)).toBe(14 * tileSize);
        for (let x = 300; x < 340; x++) {
            expect(surface(x) - surface(x + 1)).toBeGreaterThanOrEqual(0);
            expect(surface(x) - surface(x + 1)).toBeLessThanOrEqual(2);
        }
    });
});

describe('carveCrater', () => {
    it('removes dirt in a circle and reports the changed area', () => {
        const mask = createTerrainMask(level);
        const centerY = 15 * tileSize;
        const area = carveCrater(mask, 200, centerY, 20);

        expect(area).toEqual({ x: 180, y: centerY - 20, width: 41, height: 41 });
        expect(getMaterialAt(mask, 200, centerY + 18)).toBe(materialIds.air);
        expect(getMaterialAt(mask, 200, centerY + 21)).toBe(materialIds.dirt);
        expect(getMaterialAt(mask, 219, centerY + 10)).toBe(materialIds.dirt);
        expect(isAreaSolid(mask, 195, centerY, 10, 10)).toBe(false);
    });

    it('takes a smaller bite out of rock and never touches bedrock', () => {
        const rocky = produce(level, (draft) =>
            fillRectangle(draft, 'terrain', { x: 1, y: 10 }, { x: 38, y: 18 }, materialIds.rock)
        );
        const mask = createTerrainMask(rocky);

        carveCrater(mask, 200, 12 * tileSize, 20);
        expect(getMaterialAt(mask, 200, 12 * tileSize + 11)).toBe(materialIds.air);
        expect(getMaterialAt(mask, 200, 12 * tileSize + 13)).toBe(materialIds.rock);

        carveCrater(mask, 8, 100, 30);
        expect(getMaterialAt(mask, 8, 100)).toBe(materialIds.bedrock);
    });
});

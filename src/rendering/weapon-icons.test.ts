import { describe, expect, it } from 'vitest';
import { weaponIds } from '../game/weapons';
import { outlineColor } from './pixel-grid';
import { buildWeaponIcon } from './weapon-icons';

describe('buildWeaponIcon', () => {
    for (const weaponId of weaponIds) {
        it(`draws an outlined ${weaponId} that fits inside the icon`, () => {
            const grid = buildWeaponIcon(weaponId);
            const { width, height, pixels } = grid;

            expect(pixels.filter((pixel) => pixel && pixel !== outlineColor).length).toBeGreaterThan(60);
            // The border stays empty, so no part or outline is cut off.
            for (let row = 0; row < height; row++) {
                expect(pixels[row * width]).toBeNull();
                expect(pixels[row * width + width - 1]).toBeNull();
            }
            for (let column = 0; column < width; column++) {
                expect(pixels[column]).toBeNull();
                expect(pixels[(height - 1) * width + column]).toBeNull();
            }
        });
    }
});

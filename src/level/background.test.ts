import { describe, expect, it } from 'vitest';
import { backgroundPresetNames, backgroundPresets, getHorizonY } from './background';

describe('getHorizonY', () => {
    it('returns the median top of the ground in world pixels', () => {
        const terrain = [
            [0, 0, 0, 0, 1],
            [0, 0, 1, 0, 1],
            [1, 0, 1, 1, 1],
            [1, 1, 1, 1, 1]
        ];

        // Column tops: 2, 3, 1, 2, 0. Sorted 0, 1, 2, 2, 3: the median is row 2.
        expect(getHorizonY(terrain, 16)).toBe(32);
    });

    it('puts the horizon at the bottom of a level without ground', () => {
        expect(
            getHorizonY(
                [
                    [0, 0],
                    [0, 0]
                ],
                16
            )
        ).toBe(32);
    });
});

describe('backgroundPresets', () => {
    it('keeps the stored preset names in their order', () => {
        expect(backgroundPresetNames.slice(0, 3)).toEqual(['day', 'dusk', 'night']);
    });

    it('starts every preset with a sky and orders the layers back to front', () => {
        for (const name of backgroundPresetNames) {
            const layers = backgroundPresets[name];
            const factors = layers.map((layer) => layer.factor);

            expect(layers[0].type).toBe('sky');
            expect(factors).toEqual([...factors].sort((a, b) => a - b));
            expect(factors.every((factor) => factor >= 0 && factor <= 1)).toBe(true);
        }
    });
});

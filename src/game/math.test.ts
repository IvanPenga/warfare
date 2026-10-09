import { describe, expect, it } from 'vitest';
import { cosDegrees, sinDegrees } from './math';

describe('sinDegrees / cosDegrees', () => {
    it('matches Math.sin and Math.cos closely over several turns', () => {
        for (let degrees = -720; degrees <= 720; degrees += 0.7) {
            const radians = (degrees * Math.PI) / 180;

            expect(Math.abs(sinDegrees(degrees) - Math.sin(radians))).toBeLessThan(1e-14);
            expect(Math.abs(cosDegrees(degrees) - Math.cos(radians))).toBeLessThan(1e-14);
        }
    });

    it('is exact at the quarter turns that aiming uses as limits', () => {
        expect(sinDegrees(0)).toBe(0);
        expect(sinDegrees(90)).toBe(1);
        expect(sinDegrees(180)).toBe(0);
        expect(cosDegrees(0)).toBe(1);
    });
});

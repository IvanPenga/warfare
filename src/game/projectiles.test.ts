import { describe, expect, it } from 'vitest';
import { tileSize } from '../level/level';
import { applyCommand, stepGame } from './game-state';
import { traceShotStart } from './projectiles';
import { getBarrelTip } from './tanks';
import { activateTank, clearTanks, createMatch } from './test-match';

describe('traceShotStart', () => {
    it('follows the path the real shot flies', () => {
        const state = createMatch();
        const tank = activateTank(state, 'heavy', 20 * tileSize);

        clearTanks(state, [tank]);
        tank.angle = 60;
        tank.power = 70;
        const points = traceShotStart(state, tank, 90, 9);

        expect(points[0]).toEqual(getBarrelTip(tank));
        expect(points.length).toBe(11);
        applyCommand(state, { type: 'fire' });
        const flown: { x: number; y: number }[] = [];

        for (let step = 0; step < 60; step++) {
            stepGame(state);
            flown.push(...state.projectiles.map((projectile) => ({ x: projectile.x, y: projectile.y })));
        }
        for (const point of points.slice(1)) {
            const closest = Math.min(...flown.map((spot) => Math.hypot(spot.x - point.x, spot.y - point.y)));

            expect(closest).toBeLessThan(3);
        }
    });

    it('stops at the ground and leaves the state alone', () => {
        const state = createMatch();
        const tank = activateTank(state, 'heavy', 20 * tileSize);

        tank.facing = 1;
        tank.angle = 0;
        tank.power = 5;
        const cells = state.terrain.cells.slice();
        const points = traceShotStart(state, tank, 90, 9);

        expect(points.length).toBeLessThan(4);
        expect(state.projectiles).toEqual([]);
        expect(state.terrain.cells).toEqual(cells);
    });
});

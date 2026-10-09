import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { fillRectangle, tileSize } from '../level/level';
import { materialIds } from '../level/materials';
import { carveCrater } from '../terrain/terrain-mask';
import { applyCommand, getActiveTank, stepGame, turnEndDelay, turnTimeLimit } from './game-state';
import { tankTypeIds, tankTypes } from './tank-types';
import { stepDuration } from './tanks';
import {
    clearTanks,
    createMatch,
    flatLevel,
    getTank,
    groundY,
    run,
    runUntilTurnEnds,
    activateTank
} from './test-match';

describe('createGameState', () => {
    it('places one tank of each type per side inside the spawn zones, the same for the same seed', () => {
        const state = createMatch();

        expect(state.tanks).toHaveLength(10);
        for (const side of ['left', 'right'] as const) {
            const tanks = state.tanks.filter((tank) => tank.side === side);
            const zone = flatLevel.spawnZones[side];

            expect(tanks.map((tank) => tank.typeId).sort()).toEqual([...tankTypeIds].sort());
            for (const tank of tanks) {
                expect(tank.x).toBeGreaterThanOrEqual(zone.x * tileSize);
                expect(tank.x).toBeLessThanOrEqual((zone.x + zone.width) * tileSize);
                // Next to the bedrock walls the smoothed corner can lift a tank a pixel or two.
                expect(tank.y).toBeGreaterThan(groundY - 4);
                expect(tank.onGround).toBe(true);
                expect(tank.health).toBe(tankTypes[tank.typeId].health);
            }
        }
        expect(createMatch().tanks).toEqual(state.tanks);
        expect(createMatch(flatLevel, 2).tanks).not.toEqual(state.tanks);
    });

    it('starts with player 1 once the tanks have landed', () => {
        const state = createMatch();

        expect(state.phase).toBe('aiming');
        expect(state.turn).toMatchObject({ side: 'left', number: 1, locked: false });
        expect(getActiveTank(state)?.side).toBe('left');
    });
});

describe('choosing and driving a tank', () => {
    it('can switch tanks until the chosen one moves or aims, and never to an enemy tank', () => {
        const state = createMatch();
        const heavy = getTank(state, 'left', 'heavy');
        const scout = getTank(state, 'left', 'scout');

        applyCommand(state, { type: 'selectTank', tankId: getTank(state, 'right', 'heavy').id });
        expect(getActiveTank(state)?.side).toBe('left');
        applyCommand(state, { type: 'selectTank', tankId: heavy.id });
        expect(state.turn.tankId).toBe(heavy.id);

        run(state, 0.2, { angleUp: true });
        applyCommand(state, { type: 'selectTank', tankId: scout.id });
        expect(state.turn.tankId).toBe(heavy.id);
        expect(state.turn.locked).toBe(true);
    });

    it('keeps a selected weapon per tank and fires it', () => {
        const state = createMatch();
        const assault = activateTank(state, 'assault', 20 * tileSize);
        const scout = getTank(state, 'left', 'scout');

        expect(assault.selectedWeaponId).toBe('cluster');
        applyCommand(state, { type: 'selectWeapon', weaponId: 'shell' });
        expect(assault.selectedWeaponId).toBe('shell');

        applyCommand(state, { type: 'selectTank', tankId: scout.id });
        expect(scout.selectedWeaponId).toBe('bouncer');
        applyCommand(state, { type: 'selectTank', tankId: assault.id });
        applyCommand(state, { type: 'selectWeapon', weaponId: 'mortar' });
        expect(assault.selectedWeaponId).toBe('shell');

        applyCommand(state, { type: 'fire' });
        expect(state.projectiles[0]?.weaponId).toBe('shell');
    });

    it('drives at the speed of the tank type and uses one fuel per pixel', () => {
        const state = createMatch();
        const scout = activateTank(state, 'scout', 20 * tileSize);
        const startX = scout.x;

        run(state, 2, { right: true });

        expect(scout.x - startX).toBe(2 * tankTypes.scout.speed);
        expect(scout.fuel).toBe(tankTypes.scout.fuel - 2 * tankTypes.scout.speed);
    });

    it('stops when the fuel is used up, but can still turn around', () => {
        const state = createMatch();
        const heavy = activateTank(state, 'heavy', 20 * tileSize);
        const startX = heavy.x;

        run(state, tankTypes.heavy.fuel / tankTypes.heavy.speed + 1, { right: true });
        expect(heavy.fuel).toBe(0);
        expect(heavy.x - startX).toBe(tankTypes.heavy.fuel);

        run(state, 0.1, { left: true });
        expect(heavy.facing).toBe(-1);
        expect(heavy.x - startX).toBe(tankTypes.heavy.fuel);
    });

    it('climbs a step of one cell but not a cliff of two', () => {
        const stairs = produce(flatLevel, (draft) => {
            fillRectangle(draft, 'terrain', { x: 44, y: 29 }, { x: 70, y: 29 }, materialIds.dirt);
            fillRectangle(draft, 'terrain', { x: 50, y: 27 }, { x: 70, y: 28 }, materialIds.dirt);
        });
        const state = createMatch(stairs);
        const tank = activateTank(state, 'assault', 40 * tileSize);

        run(state, 6, { right: true });

        // It gets up the first step and a little way up the foot of the cliff, but never onto its top.
        expect(tank.y).toBeLessThan(groundY - tileSize);
        expect(tank.y).toBeGreaterThan(28 * tileSize - tileSize / 2);
        expect(tank.x).toBeLessThan(50 * tileSize);
        expect(tank.fuel).toBeGreaterThan(0);
    });

    it('raises the barrel with Up, lowers it towards the front with Down, and mirrors it when turning', () => {
        const state = createMatch();
        const tank = activateTank(state, 'assault', 20 * tileSize);

        run(state, 0.5, { angleUp: true, powerUp: true });
        expect(tank.angle).toBeCloseTo(45 + 25);
        expect(tank.power).toBeCloseTo(60 + 20);
        run(state, 2, { angleUp: true });
        expect(tank.angle).toBe(90);
        run(state, 0.5, { angleDown: true });
        expect(tank.angle).toBeCloseTo(90 - 25);
        run(state, 0.05, { left: true });
        expect(tank.angle).toBeCloseTo(180 - 65);
    });
});

describe('turns', () => {
    it('passes the turn to the other player once the shot has landed', () => {
        const state = createMatch();

        applyCommand(state, { type: 'fire' });
        expect(state.phase).toBe('flying');
        expect(applyCommand(state, { type: 'fire' })).toEqual([]);
        const events = runUntilTurnEnds(state);

        expect(events.some((event) => event.type === 'explosion')).toBe(true);
        expect(events.at(-1)).toEqual({ type: 'turnStarted', side: 'right', number: 2 });
        expect(state.turn.timeLeft).toBe(turnTimeLimit);
        expect(getActiveTank(state)?.side).toBe('right');
    });

    it('waits after the shot has resolved before the next turn starts', () => {
        const state = createMatch();

        applyCommand(state, { type: 'fire' });
        while (state.phase === 'flying' || state.phase === 'settling') {
            stepGame(state);
        }
        expect(state.phase).toBe('waiting');
        const waitStart = state.step;

        runUntilTurnEnds(state);

        expect(state.turn.side).toBe('right');
        expect((state.step - waitStart) * stepDuration).toBeCloseTo(turnEndDelay);
    });

    it('comes back to the tank the player used last time', () => {
        const state = createMatch();
        const sapper = activateTank(state, 'sapper', 20 * tileSize);

        applyCommand(state, { type: 'timeout' });
        applyCommand(state, { type: 'timeout' });

        expect(state.turn).toMatchObject({ side: 'left', number: 3, tankId: sapper.id });
    });

    it('ends the turn without a shot when the timer runs out', () => {
        const state = createMatch();

        run(state, state.turn.timeLeft - 1);
        expect(state.turn.side).toBe('left');
        run(state, 1.5);
        expect(state.turn.side).toBe('right');
    });

    it('pauses the timer while the shot is in the air', () => {
        const state = createMatch();

        run(state, 10);
        const timeLeft = state.turn.timeLeft;

        applyCommand(state, { type: 'fire' });
        run(state, 0.5);

        expect(state.phase).toBe('flying');
        expect(state.turn.timeLeft).toBe(timeLeft);
        expect(timeLeft).toBeLessThan(turnTimeLimit - 10);
    });

    it('declares the winner when the last enemy tank is destroyed', () => {
        const state = createMatch();
        const artillery = activateTank(state, 'artillery', 20 * tileSize);
        const target = getTank(state, 'right', 'scout');

        clearTanks(state, [...state.tanks.filter((tank) => tank.side === 'left'), target]);
        // The last enemy tank stands right where the straight-up shot comes down, next to our own tank.
        target.x = artillery.x + 14;
        target.y = groundY;
        target.health = 1;
        run(state, 2, { angleUp: true });
        applyCommand(state, { type: 'fire' });
        const events = runUntilTurnEnds(state);

        expect(target.alive).toBe(false);
        expect(events).toContainEqual({ type: 'matchOver', winner: 'left' });
        expect(state.phase).toBe('over');
        expect(applyCommand(state, { type: 'fire' })).toEqual([]);
    });

    it('is a draw when the last tanks of both sides go down in the same shot', () => {
        const state = createMatch();
        const heavy = activateTank(state, 'heavy', 20 * tileSize);
        const target = getTank(state, 'right', 'scout');

        clearTanks(state, [heavy, target]);
        target.x = heavy.x + 14;
        target.y = groundY;
        target.health = 1;
        heavy.health = 1;
        run(state, 2, { angleUp: true });
        applyCommand(state, { type: 'fire' });

        expect(runUntilTurnEnds(state)).toContainEqual({ type: 'matchOver', winner: 'draw' });
    });
});

describe('damage and falling', () => {
    it('hurts the shooter too, and the tank drops into its own crater without fall damage', () => {
        const state = createMatch();
        const heavy = activateTank(state, 'heavy', 20 * tileSize);

        run(state, 2, { angleUp: true });
        applyCommand(state, { type: 'fire' });
        runUntilTurnEnds(state);

        expect(heavy.health).toBe(tankTypes.heavy.health - 60);
        expect(heavy.y).toBeGreaterThan(groundY);
        expect(heavy.onGround).toBe(true);
    });

    it('drops a tank whose ground is carved away, without damage', () => {
        const state = createMatch();
        const tank = getTank(state, 'right', 'assault');

        carveCrater(state.terrain, tank.x, groundY + 20, 30);
        run(state, 2);

        expect(tank.y).toBeGreaterThan(groundY + 20);
        expect(tank.health).toBe(tankTypes.assault.health);
    });
});

describe('determinism', () => {
    it('gives the same result for the same commands', () => {
        const play = () => {
            const state = createMatch();

            run(state, 1.3, { right: true, angleUp: true });
            run(state, 0.4, { powerDown: true });
            applyCommand(state, { type: 'fire' });
            runUntilTurnEnds(state);
            run(state, 0.5, { left: true, powerUp: true });
            applyCommand(state, { type: 'fire' });
            runUntilTurnEnds(state);

            return state;
        };
        const first = play();
        const second = play();

        expect(second.tanks).toEqual(first.tanks);
        expect(second.terrain.cells).toEqual(first.terrain.cells);
        expect(second.step).toBe(first.step);
        expect(second.randomState).toBe(first.randomState);
    });
});

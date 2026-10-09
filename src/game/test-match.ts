// Helpers for the game tests: a flat level, a settled match and ways to run it. Not used by the game itself.
import { createLevel, tileSize } from '../level/level';
import { applyCommand, createGameState, stepGame, type GameEvent, type GameState } from './game-state';
import type { TankTypeId } from './tank-types';
import { noInput, stepDuration, type TankInput, type TankState } from './tanks';

/** 150 × 40 cells with flat dirt ground from row 30 and spawn zones over the outer 30 columns. */
export const flatLevel = createLevel('test', 'Test', 150, 40);
export const groundY = 30 * tileSize;

/** Runs the game for a number of seconds with the given keys held, and returns every event. */
export function run(state: GameState, seconds: number, input: Partial<TankInput> = {}): GameEvent[] {
    const events = applyCommand(state, { type: 'input', input: { ...noInput, ...input } });

    for (let step = 0; step < Math.round(seconds / stepDuration); step++) {
        events.push(...stepGame(state));
    }

    return events;
}

/** Runs until the current shot has resolved and the next turn (or the end of the match) has come. */
export function runUntilTurnEnds(state: GameState): GameEvent[] {
    const events: GameEvent[] = [];
    const turn = state.turn.number;

    for (let step = 0; step < 30 / stepDuration && state.turn.number === turn && state.phase !== 'over'; step++) {
        events.push(...stepGame(state));
    }

    return events;
}

/** A match whose tanks have landed, with player 1 to move. */
export function createMatch(level = flatLevel, seed = 1): GameState {
    const state = createGameState(level, { seed });

    run(state, 2);

    return state;
}

export function getTank(state: GameState, side: 'left' | 'right', typeId: TankTypeId): TankState {
    return state.tanks.find((tank) => tank.side === side && tank.typeId === typeId)!;
}

/** Makes player 1's tank of a type the active one, standing at `x` on the flat ground. */
export function activateTank(state: GameState, typeId: TankTypeId, x: number): TankState {
    const tank = getTank(state, 'left', typeId);

    tank.x = x;
    tank.y = groundY;
    applyCommand(state, { type: 'selectTank', tankId: tank.id });

    return tank;
}

/** Takes every tank except the given ones out of the match, as if destroyed. */
export function clearTanks(state: GameState, keep: TankState[]) {
    for (const tank of state.tanks) {
        if (!keep.includes(tank)) {
            tank.alive = false;
        }
    }
}

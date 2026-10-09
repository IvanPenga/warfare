import { sides, tileSize, type Level, type Side } from '../level/level.ts';
import { materialIds } from '../level/materials.ts';
import { tanksPerSide } from '../level/spawns.ts';
import {
    carveLine,
    createTerrainMask,
    getMaterialAt,
    type PixelRectangle,
    type TerrainMask
} from '../terrain/terrain-mask.ts';
import { cosDegrees, sinDegrees } from './math.ts';
import { pickSpawnSpots } from './placement.ts';
import { createProjectile, getLaunch, maxLaunchSpeed, stepProjectiles, type ProjectileState } from './projectiles.ts';
import { nextRandom, nextRandomInteger, seedRandom } from './random.ts';
import { tankTypeIds, tankTypes } from './tank-types.ts';
import {
    aimTank,
    createTank,
    driveTank,
    fallTank,
    getBarrelTip,
    isInsideTank,
    isTankGrounded,
    liftOutOfTerrain,
    noInput,
    stepDuration,
    type TankInput,
    type TankState
} from './tanks.ts';
import { weapons } from './weapons.ts';
import type { WeaponId } from './weapons.ts';

/** Seconds a player has for a turn. The timer pauses while a shot is in the air. */
export const turnTimeLimit = 120;

/** Seconds the game waits after a shot has resolved before the next turn starts (or the winner is declared). */
export const turnEndDelay = 2;

/**
 * `aiming`: the active player may pick a tank, drive, aim and fire. `flying`: shots are in the air. `settling`: tanks
 * are still falling after the shot. `waiting`: everything has come to rest and the next turn starts after
 * `turnEndDelay`. `over`: the match has a winner (or is a draw).
 */
export type Phase = 'aiming' | 'flying' | 'settling' | 'waiting' | 'over';

export type TurnState = {
    side: Side;
    /** The tank the player is using this turn, or null when the side has none left. */
    tankId: number | null;
    /** Set once the tank moves or aims: after that the player cannot switch tanks this turn. */
    locked: boolean;
    /** Seconds left on the turn timer. */
    timeLeft: number;
    /** Counts turns from 1. */
    number: number;
};

/** Everything a player does. The runner (and later the network) only ever changes the game through commands. */
export type Command =
    | { type: 'input'; input: TankInput }
    | { type: 'selectTank'; tankId: number }
    | { type: 'selectWeapon'; weaponId: WeaponId }
    | { type: 'fire' }
    /** The turn timer ran out. The game ends turns itself; the server sends this in network play. */
    | { type: 'timeout' };

/** What happened, for the renderer (effects, terrain to redraw, banners). Never read by the rules. */
export type GameEvent =
    | { type: 'fired'; tankId: number; x: number; y: number }
    | { type: 'explosion'; x: number; y: number; radius: number; weaponId: WeaponId; area: PixelRectangle | null }
    | { type: 'beam'; x: number; y: number; endX: number; endY: number; color: string }
    | { type: 'dig'; x: number; y: number; area: PixelRectangle | null }
    | { type: 'bounce'; x: number; y: number }
    | { type: 'split'; x: number; y: number }
    | { type: 'tankDestroyed'; tankId: number; x: number; y: number }
    | { type: 'turnStarted'; side: Side; number: number }
    | { type: 'matchOver'; winner: Side | 'draw' };

export type GameState = {
    level: Level;
    terrain: TerrainMask;
    /** Number of steps simulated so far. */
    step: number;
    randomState: number;
    phase: Phase;
    /** Both sides' tanks; a tank's `id` is its index here. */
    tanks: TankState[];
    projectiles: ProjectileState[];
    /** Steps left in the `waiting` phase. */
    waitStepsLeft: number;
    /** The keys held for the active tank. */
    input: TankInput;
    turn: TurnState;
    /** The tank each side used last, so its next turn starts with it. */
    lastTankIds: Record<Side, number | null>;
    winner: Side | 'draw' | null;
};

export type GameOptions = { seed: number };

export function getLivingTanks(state: GameState, side: Side): TankState[] {
    return state.tanks.filter((tank) => tank.side === side && tank.alive);
}

/** The tank the active player controls, if any. */
export function getActiveTank(state: GameState): TankState | null {
    const tank = state.turn.tankId === null ? null : state.tanks[state.turn.tankId];

    return tank?.alive ? tank : null;
}

/** Places the five tanks of a side, one of each type in random order, on random spots of its spawn zone. */
function placeSide(state: GameState, side: Side) {
    const spots = pickSpawnSpots(state.level, side, tanksPerSide, state);
    const types = [...tankTypeIds];
    const zone = state.level.spawnZones[side];

    // Shuffle the types (Fisher-Yates) so the spots do not give away which tank is which.
    for (let index = types.length - 1; index > 0; index--) {
        const other = nextRandomInteger(state, index + 1);

        [types[index], types[other]] = [types[other], types[index]];
    }
    types.forEach((typeId, index) => {
        // A zone without room for five tanks (lint warns about it) drops the rest from the top of the zone.
        const spot = spots[index] ?? {
            x: zone.x + Math.floor(nextRandom(state) * Math.max(1, zone.width - 1)),
            y: zone.y
        };
        const tank = createTank(state.tanks.length, side, typeId, (spot.x + 1) * tileSize, (spot.y + 1) * tileSize);

        liftOutOfTerrain(state.terrain, tank);
        state.tanks.push(tank);
    });
}

/** A new match: both sides placed at random from the seed, player 1 (left) to move once the tanks have landed. */
export function createGameState(level: Level, options: GameOptions): GameState {
    const state: GameState = {
        level,
        terrain: createTerrainMask(level),
        step: 0,
        randomState: seedRandom(options.seed),
        phase: 'settling',
        tanks: [],
        projectiles: [],
        waitStepsLeft: 0,
        input: { ...noInput },
        turn: { side: 'left', tankId: null, locked: false, timeLeft: turnTimeLimit, number: 0 },
        lastTankIds: { left: null, right: null },
        winner: null
    };

    for (const side of sides) {
        placeSide(state, side);
    }

    return state;
}

function startTurn(state: GameState, side: Side, events: GameEvent[]) {
    const last = state.lastTankIds[side];
    const tankId = last !== null && state.tanks[last].alive ? last : (getLivingTanks(state, side)[0]?.id ?? null);

    state.turn = { side, tankId, locked: false, timeLeft: turnTimeLimit, number: state.turn.number + 1 };
    state.input = { ...noInput };
    state.phase = 'aiming';
    events.push({ type: 'turnStarted', side, number: state.turn.number });
}

/** After a shot (or a timeout): the match ends if a side has no tanks left, otherwise the other side moves. */
function endTurn(state: GameState, events: GameEvent[]) {
    const leftAlive = getLivingTanks(state, 'left').length > 0;
    const rightAlive = getLivingTanks(state, 'right').length > 0;

    if (!leftAlive || !rightAlive) {
        state.winner = leftAlive ? 'left' : rightAlive ? 'right' : 'draw';
        state.phase = 'over';
        events.push({ type: 'matchOver', winner: state.winner });

        return;
    }
    state.lastTankIds[state.turn.side] = state.turn.tankId;
    startTurn(state, state.turn.side === 'left' ? 'right' : 'left', events);
}

function fireLaser(state: GameState, tank: TankState, events: GameEvent[]) {
    const weapon = weapons[tank.selectedWeaponId];
    const tip = getBarrelTip(tank);
    const directionX = cosDegrees(tank.angle);
    const directionY = -sinDegrees(tank.angle);
    const range = weapon.laserRange ?? 800;
    let endX = tip.x + directionX * range;
    let endY = tip.y + directionY * range;
    let endDistance = range;

    for (let distance = 0; distance <= range; distance += 2) {
        const x = tip.x + directionX * distance;
        const y = tip.y + directionY * distance;

        if (getMaterialAt(state.terrain, x, y) === materialIds.bedrock) {
            endX = x;
            endY = y;
            endDistance = distance;
            break;
        }
    }
    const area = carveLine(state.terrain, tip.x, tip.y, endX, endY, weapon.beamRadius ?? 4);

    events.push({ type: 'beam', x: tip.x, y: tip.y, endX, endY, color: '#69e8ff' });
    events.push({ type: 'dig', x: endX, y: endY, area });
    for (const otherTank of state.tanks) {
        if (!otherTank.alive || otherTank.id === tank.id) {
            continue;
        }
        for (let distance = 0; distance <= endDistance; distance += 2) {
            const x = tip.x + directionX * distance;
            const y = tip.y + directionY * distance;

            if (isInsideTank(otherTank, x, y)) {
                otherTank.health = Math.max(0, otherTank.health - weapon.damage);
                if (otherTank.health === 0) {
                    otherTank.alive = false;
                    events.push({ type: 'tankDestroyed', tankId: otherTank.id, x: otherTank.x, y: otherTank.y });
                }
                break;
            }
        }
    }
}

function fireRailSequence(state: GameState, tank: TankState) {
    const weapon = weapons[tank.selectedWeaponId];
    const tip = getBarrelTip(tank);
    const boltId = weapon.bomblet ?? 'railBolt';
    const bolt = weapons[boltId];
    const speed = maxLaunchSpeed * (tank.power / 100) * bolt.speedFactor;
    const directionX = cosDegrees(tank.angle);
    const directionY = -sinDegrees(tank.angle);

    for (let index = 0; index < (weapon.pelletCount ?? 1); index++) {
        const offset = index * 16;

        state.projectiles.push(
            createProjectile(
                bolt.id,
                tip.x + directionX * offset,
                tip.y + directionY * offset,
                directionX * speed,
                directionY * speed
            )
        );
    }
}

function fire(state: GameState, events: GameEvent[]) {
    const tank = getActiveTank(state);

    if (state.phase !== 'aiming' || !tank) {
        return;
    }
    const weapon = weapons[tank.selectedWeaponId];
    const tip = getBarrelTip(tank);
    const projectileCount = weapon.pelletCount ?? 1;
    const spread = weapon.pelletSpreadDegrees ?? 0;

    if (weapon.behavior === 'laser') {
        fireLaser(state, tank, events);
        state.phase = 'settling';
    } else if (weapon.behavior === 'rail') {
        fireRailSequence(state, tank);
        state.phase = 'flying';
    } else {
        const projectileWeaponId = weapon.bomblet ?? weapon.id;

        for (let index = 0; index < projectileCount; index++) {
            const angle = tank.angle + (index - (projectileCount - 1) / 2) * spread;

            const launch = getLaunch(tank, angle);

            state.projectiles.push(createProjectile(projectileWeaponId, launch.x, launch.y, launch.vx, launch.vy));
        }
        state.phase = 'flying';
    }
    state.turn.locked = true;
    state.input = { ...noInput };
    events.push({ type: 'fired', tankId: tank.id, x: tip.x, y: tip.y });
}

/** Applies a player's command. Commands that do not fit the current phase are ignored. */
export function applyCommand(state: GameState, command: Command): GameEvent[] {
    const events: GameEvent[] = [];

    switch (command.type) {
        case 'input':
            state.input = { ...command.input };
            break;
        case 'selectTank': {
            const tank = state.tanks[command.tankId];

            if (state.phase === 'aiming' && !state.turn.locked && tank?.alive && tank.side === state.turn.side) {
                state.turn.tankId = tank.id;
            }
            break;
        }
        case 'selectWeapon': {
            const tank = getActiveTank(state);

            if (state.phase === 'aiming' && tank && tankTypes[tank.typeId].weaponIds.includes(command.weaponId)) {
                tank.selectedWeaponId = command.weaponId;
            }
            break;
        }
        case 'fire':
            fire(state, events);
            break;
        case 'timeout':
            if (state.phase === 'aiming') {
                endTurn(state, events);
            }
            break;
    }

    return events;
}

/** Advances the game by one step of `stepDuration`. Returns what happened, for the renderer. */
export function stepGame(state: GameState): GameEvent[] {
    const events: GameEvent[] = [];

    state.step++;
    if (state.phase === 'aiming') {
        const tank = getActiveTank(state);

        if (tank) {
            const aimed = aimTank(tank, state.input);
            const moved = driveTank(state.terrain, tank, state.input);

            state.turn.locked ||= aimed || moved;
        }
        state.turn.timeLeft = Math.max(0, state.turn.timeLeft - stepDuration);
        if (state.turn.timeLeft === 0) {
            endTurn(state, events);
        }
    }
    for (const tank of state.tanks) {
        if (tank.alive) {
            fallTank(state.terrain, tank);
        }
    }
    stepProjectiles(state, events);
    if (state.phase === 'flying' && state.projectiles.length === 0) {
        state.phase = 'settling';
    }
    // Checked against the terrain as it is now: an explosion in this step may have taken the ground away.
    if (state.phase === 'settling' && state.tanks.every((tank) => !tank.alive || isTankGrounded(state.terrain, tank))) {
        // The match starts in `settling` too, while the tanks drop onto their spots.
        if (state.turn.number === 0) {
            startTurn(state, 'left', events);
        } else {
            state.phase = 'waiting';
            state.waitStepsLeft = Math.round(turnEndDelay / stepDuration);
        }
    } else if (state.phase === 'waiting') {
        state.waitStepsLeft--;
        if (state.waitStepsLeft <= 0) {
            endTurn(state, events);
        }
    }

    return events;
}

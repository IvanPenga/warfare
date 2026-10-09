import type { Side } from '../level/level.ts';
import { isAreaSolid, type TerrainMask } from '../terrain/terrain-mask.ts';
import { clamp, cosDegrees, sinDegrees } from './math.ts';
import { tankTypes, type TankTypeId } from './tank-types.ts';
import type { WeaponId } from './weapons.ts';

// Units are world pixels, seconds and degrees. Angles are measured from the right, counterclockwise: 0 fires right,
// 90 straight up, 180 left.

/** The simulation advances in fixed steps, so it behaves the same at any frame rate and on every machine. */
export const stepDuration = 1 / 120;
export const tankGravity = 900;
export const maxTankFallSpeed = 600;
/** A tank climbs at most this many pixels per pixel it drives: one-cell steps are passable, higher ones are cliffs. */
export const maxClimb = 2;
/** Degrees per second while an aim key is held. */
export const aimSpeed = 50;
/** Power points per second while a power key is held. */
export const powerSpeed = 40;
export const minPower = 5;
export const maxPower = 100;

/** The tank's collision box: `x` is its centre, `y` its bottom edge. */
export const tankSize = { width: 20, height: 10 };
/** Where the turret turns, above the tank's bottom edge, and how far a shot starts from it. */
export const turretHeight = 9;
export const barrelLength = 12;

export type TankState = {
    /** Index in `GameState.tanks`, stable for the whole match. */
    id: number;
    side: Side;
    typeId: TankTypeId;
    /** Centre of the tank, in whole pixels. */
    x: number;
    /** Bottom edge of the tank, in whole pixels. */
    y: number;
    /** Driving and falling move whole pixels; these keep the fractions for the next step. */
    remainderX: number;
    remainderY: number;
    fallSpeed: number;
    onGround: boolean;
    /** 1 when the tank faces right, -1 when it faces left. Down lowers the barrel towards this side. */
    facing: 1 | -1;
    angle: number;
    power: number;
    selectedWeaponId: WeaponId;
    fuel: number;
    health: number;
    alive: boolean;
};

/** The keys held this step. */
export type TankInput = {
    left: boolean;
    right: boolean;
    angleUp: boolean;
    angleDown: boolean;
    powerUp: boolean;
    powerDown: boolean;
};

export const noInput: TankInput = {
    left: false,
    right: false,
    angleUp: false,
    angleDown: false,
    powerUp: false,
    powerDown: false
};

export function createTank(id: number, side: Side, typeId: TankTypeId, x: number, y: number): TankState {
    const type = tankTypes[typeId];
    const facing = side === 'left' ? 1 : -1;

    return {
        id,
        side,
        typeId,
        x,
        y,
        remainderX: 0,
        remainderY: 0,
        fallSpeed: 0,
        onGround: false,
        facing,
        angle: facing === 1 ? 45 : 135,
        power: 60,
        selectedWeaponId: type.weaponIds[0],
        fuel: type.fuel,
        health: type.health,
        alive: true
    };
}

export function collidesWithTerrain(terrain: TerrainMask, x: number, y: number): boolean {
    return isAreaSolid(terrain, x - tankSize.width / 2, y - tankSize.height, tankSize.width, tankSize.height);
}

/** Whether there is solid ground in the pixel row right under the tank. */
export function isTankGrounded(terrain: TerrainMask, tank: Pick<TankState, 'x' | 'y'>): boolean {
    return isAreaSolid(terrain, tank.x - tankSize.width / 2, tank.y, tankSize.width, 1);
}

/** Lifts a tank placed into the ground (smoothed slopes can reach into a spawn spot) until it is free. */
export function liftOutOfTerrain(terrain: TerrainMask, tank: TankState) {
    while (collidesWithTerrain(terrain, tank.x, tank.y) && tank.y > 0) {
        tank.y--;
    }
}

/** Whether a point is inside a living tank's collision box. */
export function isInsideTank(tank: TankState, x: number, y: number): boolean {
    return (
        tank.alive &&
        x >= tank.x - tankSize.width / 2 &&
        x < tank.x + tankSize.width / 2 &&
        y >= tank.y - tankSize.height &&
        y < tank.y
    );
}

/** The distance from a point to the nearest point of the tank's box: 0 for a direct hit. */
export function getDistanceToTank(tank: TankState, x: number, y: number): number {
    const nearestX = clamp(x, tank.x - tankSize.width / 2, tank.x + tankSize.width / 2);
    const nearestY = clamp(y, tank.y - tankSize.height, tank.y);
    const deltaX = x - nearestX;
    const deltaY = y - nearestY;

    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

/** Moves the tank one pixel to the side, climbing up to `maxClimb` pixels and hugging the ground going down. */
function driveOnePixel(terrain: TerrainMask, tank: TankState, direction: 1 | -1): boolean {
    const x = tank.x + direction;

    for (let lift = 0; lift <= maxClimb; lift++) {
        if (!collidesWithTerrain(terrain, x, tank.y - lift)) {
            tank.x = x;
            tank.y -= lift;
            for (let drop = 0; drop < maxClimb && !isTankGrounded(terrain, tank); drop++) {
                tank.y++;
            }

            return true;
        }
    }

    return false;
}

/**
 * Drives with the held keys for one step and returns whether the tank moved or turned around. Turning around mirrors
 * the aim, so the barrel keeps pointing forwards; it needs no fuel, because it is part of aiming.
 */
export function driveTank(terrain: TerrainMask, tank: TankState, input: TankInput): boolean {
    const held = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    if (held === 0) {
        tank.remainderX = 0;

        return false;
    }
    const direction: 1 | -1 = held > 0 ? 1 : -1;
    let changed = false;

    if (direction !== tank.facing) {
        tank.facing = direction;
        tank.angle = 180 - tank.angle;
        changed = true;
    }
    if (tank.fuel <= 0 || !tank.onGround) {
        tank.remainderX = 0;

        return changed;
    }
    tank.remainderX += direction * tankTypes[tank.typeId].speed * stepDuration;
    while (Math.abs(tank.remainderX) >= 1 && tank.fuel > 0) {
        if (!driveOnePixel(terrain, tank, direction)) {
            tank.remainderX = 0;
            break;
        }
        tank.remainderX -= direction;
        tank.fuel--;
        changed = true;
    }
    if (tank.fuel <= 0) {
        tank.remainderX = 0;
    }

    return changed;
}

/**
 * Turns the barrel and changes the power with the held keys for one step, and returns whether anything changed. Up
 * raises the barrel until it points straight up; down lowers it towards the side the tank faces.
 */
export function aimTank(tank: TankState, input: TankInput): boolean {
    const angleDirection = (input.angleUp ? 1 : 0) - (input.angleDown ? 1 : 0);
    const powerDirection = (input.powerUp ? 1 : 0) - (input.powerDown ? 1 : 0);
    const turn = aimSpeed * stepDuration;
    const { angle, power } = tank;

    if (angleDirection === 1) {
        tank.angle = tank.angle < 90 ? Math.min(90, tank.angle + turn) : Math.max(90, tank.angle - turn);
    } else if (angleDirection === -1) {
        tank.angle =
            tank.facing === 1
                ? Math.max(0, Math.min(90, tank.angle) - turn)
                : Math.min(180, Math.max(90, tank.angle) + turn);
    }
    tank.power = clamp(tank.power + powerDirection * powerSpeed * stepDuration, minPower, maxPower);

    return tank.angle !== angle || tank.power !== power;
}

/** Gravity on the tank: it falls whenever the ground under it is gone, and lands without damage. */
export function fallTank(terrain: TerrainMask, tank: TankState) {
    tank.onGround = isTankGrounded(terrain, tank);
    if (tank.onGround) {
        tank.fallSpeed = 0;
        tank.remainderY = 0;

        return;
    }
    tank.fallSpeed = Math.min(maxTankFallSpeed, tank.fallSpeed + tankGravity * stepDuration);
    tank.remainderY += tank.fallSpeed * stepDuration;
    while (tank.remainderY >= 1) {
        tank.remainderY--;
        tank.y++;
        if (isTankGrounded(terrain, tank)) {
            tank.onGround = true;
            tank.fallSpeed = 0;
            tank.remainderY = 0;
            break;
        }
    }
}

/** Where a shot leaves the barrel. */
export function getBarrelTip(tank: Pick<TankState, 'x' | 'y' | 'angle'>) {
    return {
        x: tank.x + cosDegrees(tank.angle) * barrelLength,
        y: tank.y - turretHeight - sinDegrees(tank.angle) * barrelLength
    };
}

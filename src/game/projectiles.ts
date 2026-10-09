import { materialIds } from '../level/materials.ts';
import { carveCrater, getMaterialAt, isSolidAt, type PixelRectangle } from '../terrain/terrain-mask.ts';
import type { GameEvent, GameState } from './game-state.ts';
import { nextRandom } from './random.ts';
import { cosDegrees, sinDegrees } from './math.ts';
import { getBarrelTip, getDistanceToTank, isInsideTank, maxPower, stepDuration, type TankState } from './tanks.ts';
import { weapons, type WeaponId } from './weapons.ts';

export const projectileGravity = 500;
/** Launch speed at power 100, before the weapon's `speedFactor`. */
export const maxLaunchSpeed = 800;
/** A projectile that has not exploded after this long is removed. */
export const maxFlightTime = 20;
/** How fast a digger tunnels, in world pixels per second. */
export const diggingSpeed = 160;
/** Projectiles move at most this far per sub-step, so they cannot pass through thin ground or a tank. */
const subStepLength = 2;

export type ProjectileState = {
    weaponId: WeaponId;
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    /** A digger in the ground: how far it still tunnels. Null while it flies. */
    tunnelLeft: number | null;
};

export function createProjectile(weaponId: WeaponId, x: number, y: number, vx: number, vy: number): ProjectileState {
    return { weaponId, x, y, vx, vy, age: 0, tunnelLeft: null };
}

/** Where a tank's shot leaves the barrel and its velocity in world pixels per second, for a direction in degrees. */
export function getLaunch(tank: TankState, angle = tank.angle) {
    const tip = getBarrelTip(tank);
    const speed = maxLaunchSpeed * (tank.power / maxPower) * weapons[tank.selectedWeaponId].speedFactor;

    return { x: tip.x, y: tip.y, vx: cosDegrees(angle) * speed, vy: -sinDegrees(angle) * speed };
}

/**
 * The first `length` world pixels of the path a tank's shot would fly, as points `spacing` pixels apart starting at
 * the barrel tip. It follows the same gravity as a real shot but stops at the ground and ignores tanks, bounces and
 * splits. For the aim preview only: it never changes the state.
 */
export function traceShotStart(state: GameState, tank: TankState, length: number, spacing: number) {
    const launch = getLaunch(tank);
    const points = [{ x: launch.x, y: launch.y }];
    const { vx } = launch;
    let { x, y, vy } = launch;
    let travelled = 0;
    let nextPoint = spacing;

    for (let step = 0; step < 3 / stepDuration && travelled < length; step++) {
        vy += projectileGravity * stepDuration;
        const distance = Math.sqrt(vx * vx + vy * vy) * stepDuration;
        const subSteps = Math.max(1, Math.ceil(distance / subStepLength));

        for (let subStep = 0; subStep < subSteps && travelled < length; subStep++) {
            x += (vx * stepDuration) / subSteps;
            y += (vy * stepDuration) / subSteps;
            travelled += distance / subSteps;
            if (isSolidAt(state.terrain, x, y)) {
                return points;
            }
            if (travelled >= nextPoint) {
                points.push({ x, y });
                nextPoint += spacing;
            }
        }
    }

    return points;
}

/** Carves the crater and damages every tank in the blast, the shooter's own included. */
export function explode(state: GameState, x: number, y: number, weaponId: WeaponId, events: GameEvent[]) {
    const weapon = weapons[weaponId];
    const area = carveCrater(state.terrain, x, y, weapon.blastRadius);

    events.push({ type: 'explosion', x, y, radius: weapon.blastRadius, weaponId, area });
    for (const tank of state.tanks) {
        const distance = tank.alive ? getDistanceToTank(tank, x, y) : Infinity;

        if (distance >= weapon.blastRadius) {
            continue;
        }
        tank.health = Math.max(0, tank.health - Math.round(weapon.damage * (1 - distance / weapon.blastRadius)));
        if (tank.health === 0) {
            tank.alive = false;
            events.push({ type: 'tankDestroyed', tankId: tank.id, x: tank.x, y: tank.y });
        }
    }
}

function explodeQuake(state: GameState, projectile: ProjectileState, events: GameEvent[]) {
    const weapon = weapons[projectile.weaponId];
    const secondaryWeapon = weapon.secondaryWeapon ?? projectile.weaponId;

    explode(state, projectile.x, projectile.y, projectile.weaponId, events);
    for (const direction of [-1, 1]) {
        explode(
            state,
            projectile.x + direction * weapon.blastRadius * 0.65,
            projectile.y + 14,
            secondaryWeapon,
            events
        );
    }
}

function explodeMortar(state: GameState, projectile: ProjectileState, events: GameEvent[]) {
    const weapon = weapons[projectile.weaponId];
    const secondaryWeapon = weapon.secondaryWeapon ?? projectile.weaponId;

    explode(state, projectile.x, projectile.y, projectile.weaponId, events);
    for (const [offsetX, offsetY] of [
        [-24, -34],
        [0, -52],
        [24, -34]
    ]) {
        explode(state, projectile.x + offsetX, projectile.y + offsetY, secondaryWeapon, events);
    }
}

function impact(state: GameState, projectile: ProjectileState, events: GameEvent[]) {
    const weapon = weapons[projectile.weaponId];

    if (weapon.behavior === 'quake') {
        explodeQuake(state, projectile, events);
    } else if (weapon.behavior === 'mortar') {
        explodeMortar(state, projectile, events);
    } else {
        explode(state, projectile.x, projectile.y, projectile.weaponId, events);
    }
}

function hitsTank(state: GameState, x: number, y: number): boolean {
    return state.tanks.some((tank) => isInsideTank(tank, x, y));
}

/** The direction away from the ground at a point, from the solid pixels around it. For bouncing. */
function getSurfaceNormal(state: GameState, x: number, y: number, vx: number, vy: number) {
    let normalX = 0;
    let normalY = 0;

    for (let offsetY = -3; offsetY <= 3; offsetY++) {
        for (let offsetX = -3; offsetX <= 3; offsetX++) {
            if (isSolidAt(state.terrain, x + offsetX, y + offsetY)) {
                normalX -= offsetX;
                normalY -= offsetY;
            }
        }
    }
    let length = Math.sqrt(normalX * normalX + normalY * normalY);

    if (length === 0) {
        // Surrounded evenly: bounce straight back.
        normalX = -vx;
        normalY = -vy;
        length = Math.sqrt(normalX * normalX + normalY * normalY) || 1;
    }

    return { x: normalX / length, y: normalY / length };
}

/** Splits a cluster bomb into bomblets that fly on with a random spread. */
function split(state: GameState, projectile: ProjectileState, events: GameEvent[]): ProjectileState[] {
    const weapon = weapons[projectile.weaponId];
    const bomblets: ProjectileState[] = [];

    for (let index = 0; index < (weapon.clusterCount ?? 0); index++) {
        bomblets.push(
            createProjectile(
                weapon.bomblet ?? 'shell',
                projectile.x,
                projectile.y,
                projectile.vx + (nextRandom(state) - 0.5) * 220,
                -nextRandom(state) * 90
            )
        );
    }
    events.push({ type: 'split', x: projectile.x, y: projectile.y });

    return bomblets;
}

/** Splits a shell into fixed child trajectories, so the spread is readable and needs no randomness. */
function splitFixed(projectile: ProjectileState, events: GameEvent[]): ProjectileState[] {
    const weapon = weapons[projectile.weaponId];
    const shells: ProjectileState[] = [];
    const count = weapon.splitCount ?? 0;
    const spread = weapon.splitSpreadDegrees ?? 0;

    for (let index = 0; index < count; index++) {
        const angle = (index - (count - 1) / 2) * spread;
        const cosine = cosDegrees(angle);
        const sine = sinDegrees(angle);

        shells.push(
            createProjectile(
                weapon.splitWeapon ?? 'shell',
                projectile.x,
                projectile.y,
                projectile.vx * cosine + projectile.vy * sine,
                -projectile.vx * sine + projectile.vy * cosine
            )
        );
    }
    events.push({ type: 'split', x: projectile.x, y: projectile.y });

    return shells;
}

/** Bursts into child shells after a fuse, using fixed angles around straight up. */
function burst(projectile: ProjectileState, events: GameEvent[]): ProjectileState[] {
    const weapon = weapons[projectile.weaponId];
    const shells: ProjectileState[] = [];
    const count = weapon.splitCount ?? 0;
    const spread = weapon.splitSpreadDegrees ?? 0;
    const speed = weapon.burstSpeed ?? 220;

    for (let index = 0; index < count; index++) {
        const angle = 90 + (index - (count - 1) / 2) * spread;

        shells.push(
            createProjectile(
                weapon.splitWeapon ?? 'shell',
                projectile.x,
                projectile.y,
                cosDegrees(angle) * speed,
                -sinDegrees(angle) * speed
            )
        );
    }
    events.push({ type: 'split', x: projectile.x, y: projectile.y });

    return shells;
}

/** Tunnels on in a straight line, carving as it goes. Returns false when the digger is done (it exploded). */
function dig(state: GameState, projectile: ProjectileState, events: GameEvent[]): boolean {
    const weapon = weapons[projectile.weaponId];
    const speed = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy) || 1;
    const directionX = projectile.vx / speed;
    const directionY = projectile.vy / speed;
    const distance = diggingSpeed * stepDuration;
    const subSteps = Math.max(1, Math.ceil(distance / subStepLength));

    for (let subStep = 0; subStep < subSteps; subStep++) {
        projectile.x += (directionX * distance) / subSteps;
        projectile.y += (directionY * distance) / subSteps;
        const bedrock = getMaterialAt(state.terrain, projectile.x, projectile.y) === materialIds.bedrock;

        if (bedrock || hitsTank(state, projectile.x, projectile.y)) {
            impact(state, projectile, events);

            return false;
        }
    }
    const area: PixelRectangle | null = carveCrater(
        state.terrain,
        projectile.x,
        projectile.y,
        weapon.tunnelRadius ?? 6
    );

    events.push({ type: 'dig', x: projectile.x, y: projectile.y, area });
    projectile.tunnelLeft! -= distance;
    if (projectile.tunnelLeft! <= 0) {
        explode(state, projectile.x, projectile.y, projectile.weaponId, events);

        return false;
    }

    return true;
}

/**
 * Advances one projectile by a step. Returns the projectiles that replace it: itself while it flies on, bomblets when
 * it splits, none when it exploded or was lost.
 */
function stepProjectile(state: GameState, projectile: ProjectileState, events: GameEvent[]): ProjectileState[] {
    const weapon = weapons[projectile.weaponId];

    projectile.age += stepDuration;
    if (projectile.tunnelLeft !== null) {
        return dig(state, projectile, events) ? [projectile] : [];
    }
    if (weapon.behavior === 'bounce' && projectile.age >= (weapon.fuse ?? Infinity)) {
        impact(state, projectile, events);

        return [];
    }
    if (weapon.behavior === 'explode' && projectile.age >= (weapon.fuse ?? Infinity)) {
        impact(state, projectile, events);

        return [];
    }
    if (weapon.behavior === 'burst' && projectile.age >= (weapon.fuse ?? Infinity)) {
        return burst(projectile, events);
    }
    const wasRising = projectile.vy < 0;

    projectile.vy += projectileGravity * stepDuration;
    if (weapon.behavior === 'cluster' && wasRising && projectile.vy >= 0) {
        return split(state, projectile, events);
    }
    if (weapon.behavior === 'splitter' && wasRising && projectile.vy >= 0) {
        return splitFixed(projectile, events);
    }
    if (weapon.behavior === 'airburst' && wasRising && projectile.vy >= 0) {
        impact(state, projectile, events);

        return [];
    }
    const distance = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy) * stepDuration;
    const subSteps = Math.max(1, Math.ceil(distance / subStepLength));

    for (let subStep = 0; subStep < subSteps; subStep++) {
        const previousX = projectile.x;
        const previousY = projectile.y;

        projectile.x += (projectile.vx * stepDuration) / subSteps;
        projectile.y += (projectile.vy * stepDuration) / subSteps;
        if (hitsTank(state, projectile.x, projectile.y)) {
            impact(state, projectile, events);

            return [];
        }
        if (!isSolidAt(state.terrain, projectile.x, projectile.y)) {
            continue;
        }
        if (weapon.behavior === 'bounce') {
            const normal = getSurfaceNormal(state, projectile.x, projectile.y, projectile.vx, projectile.vy);
            const along = projectile.vx * normal.x + projectile.vy * normal.y;
            const bounciness = weapon.bounciness ?? 0.5;

            if (along < 0) {
                projectile.vx = (projectile.vx - 2 * along * normal.x) * bounciness;
                projectile.vy = (projectile.vy - 2 * along * normal.y) * bounciness;
            }
            projectile.x = previousX;
            projectile.y = previousY;
            events.push({ type: 'bounce', x: projectile.x, y: projectile.y });

            return [projectile];
        }
        if (
            weapon.behavior === 'dig' &&
            getMaterialAt(state.terrain, projectile.x, projectile.y) !== materialIds.bedrock
        ) {
            projectile.tunnelLeft = weapon.tunnelLength ?? 0;

            return [projectile];
        }
        impact(state, projectile, events);

        return [];
    }

    return projectile.age > maxFlightTime ? [] : [projectile];
}

/** Advances every projectile by a step, in order, so the result is the same on every machine. */
export function stepProjectiles(state: GameState, events: GameEvent[]) {
    state.projectiles = state.projectiles.flatMap((projectile) => stepProjectile(state, projectile, events));
}

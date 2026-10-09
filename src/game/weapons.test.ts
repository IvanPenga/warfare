import { describe, expect, it } from 'vitest';
import { tileSize } from '../level/level';
import { materialIds } from '../level/materials';
import { getMaterialAt } from '../terrain/terrain-mask';
import { applyCommand, stepGame, type GameEvent, type GameState } from './game-state';
import { createProjectile } from './projectiles';
import { tankTypes } from './tank-types';
import { stepDuration, tankSize } from './tanks';
import { clearTanks, createMatch, getTank, groundY, run, runUntilTurnEnds, activateTank } from './test-match';
import { weapons, type WeaponId } from './weapons';

const targetX = 70 * tileSize;

/** A match with only one enemy tank left, standing at `targetX` on the flat ground. */
function createTarget(): { state: GameState; target: ReturnType<typeof getTank> } {
    const state = createMatch();
    const target = getTank(state, 'right', 'heavy');

    clearTanks(state, [target]);
    target.x = targetX;
    target.y = groundY;

    return { state, target };
}

/** Drops a projectile of a weapon from `height` pixels above a point and runs the game for a while. */
function drop(state: GameState, weaponId: WeaponId, x: number, height: number, vx = 0, seconds = 5): GameEvent[] {
    const events: GameEvent[] = [];

    state.projectiles.push(createProjectile(weaponId, x, groundY - height, vx, 0));
    for (let step = 0; step < seconds / stepDuration; step++) {
        events.push(...stepGame(state));
    }

    return events;
}

function explosions(events: GameEvent[]) {
    return events.filter((event) => event.type === 'explosion');
}

describe('weapons', () => {
    it.each(['shell', 'railBolt', 'splitterShard', 'fireworkSpark'] as const)(
        '%s explodes on a direct hit with its full damage',
        (id) => {
            const { state, target } = createTarget();
            const events = drop(state, id, targetX, 100);
            const [explosion] = explosions(events);

            expect(explosions(events)).toHaveLength(1);
            expect(explosion).toMatchObject({ radius: weapons[id].blastRadius });
            expect(target.health).toBe(tankTypes.heavy.health - weapons[id].damage);
            // The crater reaches below the tank's bottom edge by its radius minus the tank's height.
            const depth = weapons[id].blastRadius - tankSize.height - 2;

            expect(getMaterialAt(state.terrain, targetX, groundY + depth)).toBe(materialIds.air);
        }
    );

    it('the heavy shell digs a bigger crater than the shell, and damage falls off with distance', () => {
        const { state, target } = createTarget();

        drop(state, 'heavyShell', targetX + 70, 100);
        const heavyDamage = tankTypes.heavy.health - target.health;

        expect(heavyDamage).toBeGreaterThan(0);
        expect(heavyDamage).toBeLessThan(weapons.heavyShell.damage);
        expect(getMaterialAt(state.terrain, targetX + 70, groundY + 70)).toBe(materialIds.air);

        const other = createTarget();

        drop(other.state, 'shell', targetX + 70, 100);
        expect(other.target.health).toBe(tankTypes.heavy.health);
        expect(getMaterialAt(other.state.terrain, targetX + 70, groundY + 70)).toBe(materialIds.dirt);
    });

    it('the heavy shell creates side shock craters after the main impact', () => {
        const { state } = createTarget();
        const events = drop(state, 'heavyShell', targetX, 100);
        const blasts = explosions(events);

        expect(blasts.map((blast) => blast.weaponId)).toEqual(['heavyShell', 'heavyShock', 'heavyShock']);
        expect(blasts[1].x).toBeLessThan(targetX);
        expect(blasts[2].x).toBeGreaterThan(targetX);
    });

    it('the mortar pops small blasts upward from its impact', () => {
        const { state } = createTarget();
        const events = drop(state, 'mortar', targetX, 100);
        const blasts = explosions(events);

        expect(blasts.map((blast) => blast.weaponId)).toEqual(['mortar', 'mortarShard', 'mortarShard', 'mortarShard']);
        expect(blasts.slice(1).every((blast) => blast.y < blasts[0].y)).toBe(true);
    });

    it('the mortar flies further than the heavy shell at the same angle and power', () => {
        const range = (typeId: 'artillery' | 'heavy') => {
            const state = createMatch();
            const tank = activateTank(state, typeId, 10 * tileSize);

            clearTanks(state, [tank]);
            run(state, 0.1, { powerUp: true });
            applyCommand(state, { type: 'fire' });
            const [explosion] = explosions(runUntilTurnEnds(state));

            return explosion.x - tank.x;
        };

        expect(range('artillery')).toBeGreaterThan(range('heavy') * 2);
    });

    it('the cluster splits into five bomblets at the top of its arc', () => {
        const { state } = createTarget();

        state.projectiles.push(createProjectile('cluster', targetX, groundY - 50, 0, -300));
        const events: GameEvent[] = [];

        for (let step = 0; step < 5 / stepDuration; step++) {
            events.push(...stepGame(state));
        }
        const blasts = explosions(events);

        expect(events.filter((event) => event.type === 'split')).toHaveLength(1);
        expect(blasts).toHaveLength(5);
        for (const blast of blasts) {
            expect(blast.radius).toBe(weapons.bomblet.blastRadius);
        }
        expect(new Set(blasts.map((blast) => Math.round(blast.x))).size).toBeGreaterThan(1);
    });

    it('the splitter shell splits into three fixed shards at the top of its arc', () => {
        const { state } = createTarget();

        state.projectiles.push(createProjectile('splitterShell', targetX, groundY - 50, 0, -300));
        const events: GameEvent[] = [];

        for (let step = 0; step < 5 / stepDuration; step++) {
            events.push(...stepGame(state));
        }
        const blasts = explosions(events);

        expect(events.filter((event) => event.type === 'split')).toHaveLength(1);
        expect(blasts).toHaveLength(3);
        for (const blast of blasts) {
            expect(blast.radius).toBe(weapons.splitterShard.blastRadius);
        }
        expect(new Set(blasts.map((blast) => Math.round(blast.x))).size).toBe(3);
    });

    it('the firework bomb waits for its fuse before firing several bombs', () => {
        const { state } = createTarget();

        state.projectiles.push(createProjectile('fireworkBomb', targetX, groundY - 1400, 0, -10));
        const events: GameEvent[] = [];

        for (let step = 0; step < 1 / stepDuration; step++) {
            events.push(...stepGame(state));
        }
        expect(events.filter((event) => event.type === 'split')).toHaveLength(0);
        expect(state.projectiles).toHaveLength(1);

        for (let step = 0; step < 5 / stepDuration; step++) {
            events.push(...stepGame(state));
        }
        const blasts = explosions(events);
        const splitCount = weapons.fireworkBomb.splitCount ?? 0;

        expect(events.filter((event) => event.type === 'split')).toHaveLength(1);
        expect(blasts).toHaveLength(splitCount);
        expect(new Set(blasts.map((blast) => Math.round(blast.x))).size).toBeGreaterThan(3);
        for (const blast of blasts) {
            expect(blast.radius).toBe(weapons.fireworkSpark.blastRadius);
        }
    });

    it('the airburst explodes at the top of its arc before impact', () => {
        const { state } = createTarget();

        state.projectiles.push(createProjectile('airburst', targetX, groundY - 120, 0, -220));
        const events: GameEvent[] = [];

        for (let step = 0; step < 2 / stepDuration; step++) {
            events.push(...stepGame(state));
        }
        const [blast] = explosions(events);

        expect(explosions(events)).toHaveLength(1);
        expect(blast.radius).toBe(weapons.airburst.blastRadius);
        expect(blast.y).toBeLessThan(groundY - 150);
    });

    it('the bouncer bounces along the ground and explodes when its fuse runs out', () => {
        const { state } = createTarget();
        const events = drop(state, 'bouncer', 40 * tileSize, 80, 120);
        const blasts = explosions(events);
        const blastStep = events.indexOf(blasts[0]);

        expect(events.filter((event) => event.type === 'bounce').length).toBeGreaterThan(1);
        expect(blasts).toHaveLength(1);
        expect(blasts[0].radius).toBe(weapons.bouncer.blastRadius);
        expect(blastStep).toBeGreaterThan(0);
        expect(blasts[0].x).toBeGreaterThan(40 * tileSize + 100);
        expect(blasts[0].y).toBeLessThan(groundY + 2);
    });

    it('the bouncer explodes at once on a tank', () => {
        const { state, target } = createTarget();
        const events = drop(state, 'bouncer', targetX, 60);

        expect(explosions(events)).toHaveLength(1);
        expect(target.health).toBe(tankTypes.heavy.health - weapons.bouncer.damage);
    });

    it('the digger tunnels into the ground before it explodes', () => {
        const { state } = createTarget();
        const x = 40 * tileSize;
        const events = drop(state, 'digger', x, 60);
        const [blast] = explosions(events);

        expect(events.filter((event) => event.type === 'dig').length).toBeGreaterThan(50);
        expect(blast.y).toBeGreaterThan(groundY + 100);
        // The tunnel is open all the way down.
        for (let depth = 5; depth < 100; depth += 10) {
            expect(getMaterialAt(state.terrain, x, groundY + depth)).toBe(materialIds.air);
        }
        expect(getMaterialAt(state.terrain, x + 12, groundY + 50)).toBe(materialIds.dirt);
    });

    it('the bunker buster punches into the ground before exploding', () => {
        const { state } = createTarget();
        const x = 40 * tileSize;
        const events = drop(state, 'bunkerBuster', x, 60);
        const [blast] = explosions(events);

        expect(events.filter((event) => event.type === 'dig').length).toBeGreaterThan(30);
        expect(blast.radius).toBe(weapons.bunkerBuster.blastRadius);
        expect(blast.y).toBeGreaterThan(groundY + 60);
        expect(getMaterialAt(state.terrain, x, groundY + 60)).toBe(materialIds.air);
        expect(getMaterialAt(state.terrain, x + 90, groundY + 50)).toBe(materialIds.dirt);
    });

    it('the shotgun fires a fixed spread of pellets', () => {
        const state = createMatch();
        const tank = activateTank(state, 'assault', 20 * tileSize);

        applyCommand(state, { type: 'selectWeapon', weaponId: 'shotgun' });
        applyCommand(state, { type: 'fire' });

        expect(tank.selectedWeaponId).toBe('shotgun');
        expect(state.projectiles.map((projectile) => projectile.weaponId)).toEqual([
            'shotgunPellet',
            'shotgunPellet',
            'shotgunPellet',
            'shotgunPellet',
            'shotgunPellet'
        ]);
        expect(new Set(state.projectiles.map((projectile) => Math.round(projectile.vy))).size).toBeGreaterThan(1);
        expect(Math.hypot(state.projectiles[2].vx, state.projectiles[2].vy)).toBeGreaterThan(1800);
    });

    it('shotgun pellets explode after at most 0.2 seconds', () => {
        const state = createMatch();
        const tank = activateTank(state, 'assault', 20 * tileSize);

        clearTanks(state, [tank]);
        tank.angle = 90;
        applyCommand(state, { type: 'selectWeapon', weaponId: 'shotgun' });
        applyCommand(state, { type: 'fire' });

        const events: GameEvent[] = [];

        for (let step = 0; step < 0.25 / stepDuration; step++) {
            events.push(...stepGame(state));
        }

        expect(state.projectiles).toHaveLength(0);
        expect(explosions(events)).toHaveLength(5);
        expect(explosions(events).every((blast) => blast.weaponId === 'shotgunPellet')).toBe(true);
    });

    it('the rail shot fires five fast blue bolts in sequence', () => {
        const state = createMatch();
        const scout = activateTank(state, 'scout', 20 * tileSize);

        applyCommand(state, { type: 'selectWeapon', weaponId: 'railShot' });
        applyCommand(state, { type: 'fire' });

        expect(scout.selectedWeaponId).toBe('railShot');
        expect(state.projectiles.map((projectile) => projectile.weaponId)).toEqual([
            'railBolt',
            'railBolt',
            'railBolt',
            'railBolt',
            'railBolt'
        ]);
        expect(state.projectiles[4].x).toBeGreaterThan(state.projectiles[0].x);
        expect(Math.hypot(state.projectiles[0].vx, state.projectiles[0].vy)).toBeGreaterThan(900);
    });

    it('the laser hits instantly without creating a projectile', () => {
        const state = createMatch();
        const scout = activateTank(state, 'scout', 20 * tileSize);
        const target = getTank(state, 'right', 'heavy');

        clearTanks(state, [scout, target]);
        scout.x = targetX - 200;
        scout.y = groundY;
        scout.angle = 0;
        target.x = targetX;
        target.y = groundY;

        applyCommand(state, { type: 'selectWeapon', weaponId: 'laser' });
        const events = applyCommand(state, { type: 'fire' });

        expect(scout.selectedWeaponId).toBe('laser');
        expect(state.projectiles).toHaveLength(0);
        expect(explosions(events)).toHaveLength(0);
        expect(target.health).toBe(tankTypes.heavy.health - weapons.laser.damage);
    });

    it('the laser carves a straight hole through terrain', () => {
        const state = createMatch();
        const scout = activateTank(state, 'scout', 20 * tileSize);

        clearTanks(state, [scout]);
        scout.x = 20 * tileSize;
        scout.y = groundY;
        scout.angle = -30;
        applyCommand(state, { type: 'selectWeapon', weaponId: 'laser' });
        const events = applyCommand(state, { type: 'fire' });

        expect(events.filter((event) => event.type === 'dig')).toHaveLength(1);
        expect(explosions(events)).toHaveLength(0);
        expect(getMaterialAt(state.terrain, scout.x + 120, groundY + 60)).toBe(materialIds.air);
        expect(getMaterialAt(state.terrain, scout.x + 120, groundY + 14)).toBe(materialIds.dirt);
    });

    it('airburst is no longer in a playable tank loadout', () => {
        for (const tankType of Object.values(tankTypes)) {
            expect(tankType.weaponIds).not.toContain('airburst');
        }
    });
});

import type { WeaponId } from './weapons.ts';

/** Tank type ids are stored in messages and files: only add new ones at the end. */
export const tankTypeIds = ['scout', 'assault', 'heavy', 'artillery', 'sapper'] as const;

export type TankTypeId = (typeof tankTypeIds)[number];

export type TankType = {
    id: TankTypeId;
    name: string;
    health: number;
    /** Fuel for the whole match, in world pixels driven. */
    fuel: number;
    /** Driving speed in world pixels per second. */
    speed: number;
    /** Ordered weapon loadout. The first weapon is selected when the tank is created. */
    weaponIds: [WeaponId, ...WeaponId[]];
};

/** Starting values for playtesting (see the line-up in PLAN.md). */
export const tankTypes: Record<TankTypeId, TankType> = {
    scout: {
        id: 'scout',
        name: 'Scout',
        health: 60,
        fuel: 5600,
        speed: 225,
        weaponIds: ['bouncer', 'railShot', 'laser', 'shell']
    },
    assault: {
        id: 'assault',
        name: 'Assault',
        health: 100,
        fuel: 3600,
        speed: 150,
        weaponIds: ['cluster', 'shotgun', 'shell']
    },
    heavy: {
        id: 'heavy',
        name: 'Heavy',
        health: 160,
        fuel: 1760,
        speed: 90,
        weaponIds: ['heavyShell', 'bunkerBuster', 'shell']
    },
    artillery: {
        id: 'artillery',
        name: 'Artillery',
        health: 80,
        fuel: 1760,
        speed: 90,
        weaponIds: ['mortar', 'splitterShell', 'fireworkBomb', 'shell']
    },
    sapper: {
        id: 'sapper',
        name: 'Sapper',
        health: 90,
        fuel: 3600,
        speed: 150,
        weaponIds: ['digger', 'bunkerBuster', 'shell']
    }
};

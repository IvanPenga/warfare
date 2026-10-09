/** Weapon ids are stored in messages and files: only add new ones at the end. */
export const weaponIds = [
    'shell',
    'bouncer',
    'cluster',
    'bomblet',
    'heavyShell',
    'mortar',
    'digger',
    'airburst',
    'bunkerBuster',
    'shotgun',
    'railShot',
    'splitterShell',
    'splitterShard',
    'laser',
    'fireworkBomb',
    'fireworkSpark',
    'railBolt',
    'heavyShock',
    'mortarShard',
    'shotgunPellet'
] as const;

export type WeaponId = (typeof weaponIds)[number];

/**
 * What a projectile does when it flies and lands:
 * - `explode`: explodes on impact.
 * - `bounce`: bounces off the ground and explodes when its fuse runs out (or on a tank).
 * - `cluster`: splits into bomblets at the top of its arc; explodes on impact before that.
 * - `airburst`: explodes at the top of its arc, or on impact before that.
 * - `dig`: on hitting the ground it tunnels straight on for a distance, then explodes.
 * - `quake`: explodes, then kicks two smaller shock craters sideways through the ground.
 * - `mortar`: explodes, then pops a few small blasts upward from the impact point.
 * - `splitter`: splits into fixed child shells at the top of its arc.
 * - `burst`: splits into fixed child shells after its fuse runs out.
 * - `rail`: fires several fast bolts in a tight sequence.
 * - `laser`: fires instantly until it hits terrain or a tank.
 */
export type WeaponBehavior =
    | 'explode'
    | 'bounce'
    | 'cluster'
    | 'airburst'
    | 'dig'
    | 'quake'
    | 'mortar'
    | 'splitter'
    | 'burst'
    | 'rail'
    | 'laser';

export type WeaponDefinition = {
    id: WeaponId;
    name: string;
    /** Crater radius in world pixels. */
    blastRadius: number;
    /** Damage at the centre of the blast; falls off linearly to 0 at the edge. */
    damage: number;
    /** Multiplies the tank's launch speed. */
    speedFactor: number;
    behavior: WeaponBehavior;
    /** Seconds from firing until it explodes or bursts, for timed weapons. */
    fuse?: number;
    /** `bounce`: share of the speed kept on each bounce. */
    bounciness?: number;
    /** `cluster`: how many bomblets, and which weapon they are. */
    clusterCount?: number;
    bomblet?: WeaponId;
    /** `splitter`: how many child shells, their weapon, and the angle between neighbours. */
    splitCount?: number;
    splitWeapon?: WeaponId;
    splitSpreadDegrees?: number;
    /** `burst`: launch speed in world pixels per second for child shells. */
    burstSpeed?: number;
    /** `quake` / `mortar`: secondary explosion weapon. */
    secondaryWeapon?: WeaponId;
    /** `dig`: how far it tunnels in world pixels, and how wide the tunnel is. */
    tunnelLength?: number;
    tunnelRadius?: number;
    /** Fires this many projectiles in a fixed spread. */
    pelletCount?: number;
    /** Degrees between neighbouring projectiles when `pelletCount` is set. */
    pelletSpreadDegrees?: number;
    /** `laser`: maximum range in world pixels. */
    laserRange?: number;
    /** `laser`: straight tunnel radius in world pixels. */
    beamRadius?: number;
};

export const weapons: Record<WeaponId, WeaponDefinition> = {
    // The reference weapon for tests. Not given to any tank (see PLAN.md).
    shell: { id: 'shell', name: 'Shell', blastRadius: 52, damage: 40, speedFactor: 1, behavior: 'explode' },
    bouncer: {
        id: 'bouncer',
        name: 'Bouncer',
        blastRadius: 36,
        damage: 32,
        speedFactor: 1.05,
        behavior: 'bounce',
        fuse: 3,
        bounciness: 0.55
    },
    cluster: {
        id: 'cluster',
        name: 'Cluster',
        blastRadius: 40,
        damage: 25,
        speedFactor: 1,
        behavior: 'cluster',
        clusterCount: 5,
        bomblet: 'bomblet'
    },
    bomblet: { id: 'bomblet', name: 'Bomblet', blastRadius: 30, damage: 18, speedFactor: 1, behavior: 'explode' },
    heavyShell: {
        id: 'heavyShell',
        name: 'Heavy shell',
        blastRadius: 84,
        damage: 60,
        speedFactor: 0.8,
        behavior: 'quake',
        secondaryWeapon: 'heavyShock'
    },
    mortar: {
        id: 'mortar',
        name: 'Mortar',
        blastRadius: 48,
        damage: 34,
        speedFactor: 1.35,
        behavior: 'mortar',
        secondaryWeapon: 'mortarShard'
    },
    digger: {
        id: 'digger',
        name: 'Digger',
        blastRadius: 48,
        damage: 38,
        speedFactor: 1,
        behavior: 'dig',
        tunnelLength: 140,
        tunnelRadius: 7
    },
    airburst: {
        id: 'airburst',
        name: 'Airburst',
        blastRadius: 44,
        damage: 34,
        speedFactor: 1.05,
        behavior: 'airburst'
    },
    bunkerBuster: {
        id: 'bunkerBuster',
        name: 'Bunker Buster',
        blastRadius: 64,
        damage: 55,
        speedFactor: 1.1,
        behavior: 'dig',
        tunnelLength: 95,
        tunnelRadius: 10
    },
    shotgun: {
        id: 'shotgun',
        name: 'Shotgun',
        blastRadius: 0,
        damage: 0,
        speedFactor: 3.8,
        behavior: 'explode',
        pelletCount: 5,
        pelletSpreadDegrees: 6,
        bomblet: 'shotgunPellet'
    },
    railShot: {
        id: 'railShot',
        name: 'Rail Shot',
        blastRadius: 0,
        damage: 0,
        speedFactor: 1,
        behavior: 'rail',
        pelletCount: 5,
        bomblet: 'railBolt'
    },
    splitterShell: {
        id: 'splitterShell',
        name: 'Splitter Shell',
        blastRadius: 34,
        damage: 24,
        speedFactor: 1.1,
        behavior: 'splitter',
        splitCount: 3,
        splitWeapon: 'splitterShard',
        splitSpreadDegrees: 18
    },
    splitterShard: {
        id: 'splitterShard',
        name: 'Splitter Shard',
        blastRadius: 34,
        damage: 24,
        speedFactor: 1,
        behavior: 'explode'
    },
    laser: {
        id: 'laser',
        name: 'Laser',
        blastRadius: 18,
        damage: 85,
        speedFactor: 1,
        behavior: 'laser',
        laserRange: 900,
        beamRadius: 5
    },
    fireworkBomb: {
        id: 'fireworkBomb',
        name: 'Firework Bomb',
        blastRadius: 28,
        damage: 18,
        speedFactor: 0.9,
        behavior: 'burst',
        fuse: 2.2,
        splitCount: 7,
        splitWeapon: 'fireworkSpark',
        splitSpreadDegrees: 22,
        burstSpeed: 260
    },
    fireworkSpark: {
        id: 'fireworkSpark',
        name: 'Firework Spark',
        blastRadius: 26,
        damage: 16,
        speedFactor: 1,
        behavior: 'explode'
    },
    railBolt: {
        id: 'railBolt',
        name: 'Rail Bolt',
        blastRadius: 14,
        damage: 18,
        speedFactor: 2.1,
        behavior: 'explode'
    },
    heavyShock: {
        id: 'heavyShock',
        name: 'Heavy Shock',
        blastRadius: 38,
        damage: 18,
        speedFactor: 1,
        behavior: 'explode'
    },
    mortarShard: {
        id: 'mortarShard',
        name: 'Mortar Shard',
        blastRadius: 22,
        damage: 12,
        speedFactor: 1,
        behavior: 'explode'
    },
    shotgunPellet: {
        id: 'shotgunPellet',
        name: 'Shotgun Pellet',
        blastRadius: 12,
        damage: 9,
        speedFactor: 1,
        behavior: 'explode',
        fuse: 0.2
    }
};

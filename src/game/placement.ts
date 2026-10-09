import type { Level, Side, TilePosition } from '../level/level.ts';
import { getSpawnSpots, minimumTankSpacing } from '../level/spawns.ts';
import { nextRandomInteger, type RandomSource } from './random.ts';

/**
 * Picks up to `count` random spawn spots of a side, at least `minimumTankSpacing` cells apart, using the game's random
 * generator. Returns fewer when the zone has no room for more (lint reports that in the editor).
 */
export function pickSpawnSpots(level: Level, side: Side, count: number, random: RandomSource): TilePosition[] {
    const candidates = getSpawnSpots(level, side);
    const picked: TilePosition[] = [];

    while (picked.length < count && candidates.length > 0) {
        const [spot] = candidates.splice(nextRandomInteger(random, candidates.length), 1);

        if (picked.every((other) => Math.abs(other.x - spot.x) >= minimumTankSpacing)) {
            picked.push(spot);
        }
    }

    return picked;
}

import type { Level, Side, TilePosition } from './level.ts';
import { isSolid } from './materials.ts';

/** Every side has this many tanks, one of each type. */
export const tanksPerSide = 5;

/** A tank takes up this many cells: two wide, one high. */
export const tankFootprint = { width: 2, height: 1 };

/** Tanks placed at the start of a match are at least this many cells apart (left edge to left edge). */
export const minimumTankSpacing = 3;

/**
 * Where a tank could start in a side's spawn zone: for each column, the highest spot in the zone where the tank's
 * footprint is air and at least one cell under it is solid. The position is the tank's left cell.
 */
export function getSpawnSpots(level: Level, side: Side): TilePosition[] {
    const zone = level.spawnZones[side];
    const rows = level.layers.terrain;
    const spots: TilePosition[] = [];
    const bottom = Math.min(level.height - 1, zone.y + zone.height);

    for (let x = zone.x; x + tankFootprint.width <= zone.x + zone.width; x++) {
        for (let y = zone.y; y < bottom; y++) {
            const empty = !isSolid(rows[y][x]) && !isSolid(rows[y][x + 1]);
            const standing = isSolid(rows[y + 1][x]) || isSolid(rows[y + 1][x + 1]);

            if (empty && standing) {
                spots.push({ x, y });
                break;
            }
        }
    }

    return spots;
}

/** How many tanks fit on the spots at once, keeping `minimumTankSpacing` between them. */
export function countSpacedSpots(spots: TilePosition[]): number {
    let count = 0;
    let lastX = -Infinity;

    for (const spot of spots) {
        if (spot.x - lastX >= minimumTankSpacing) {
            count++;
            lastX = spot.x;
        }
    }

    return count;
}

import { sides, type Level, type Side, type TileRectangle } from './level.ts';
import { countSpacedSpots, getSpawnSpots, tanksPerSide } from './spawns.ts';
import { materialIds } from './materials.ts';

/** Something that would make the level unplayable or unfair. `area` is the part of the level it is about. */
export type Problem = { message: string; area?: TileRectangle; fix?: 'bedrock-border' };

export const sideLabels: Record<Side, string> = { left: 'Player 1 (left)', right: 'Player 2 (right)' };

/** The cells of the border (bottom row, left and right columns) that are not bedrock. */
export function countBorderGaps(level: Level): number {
    const rows = level.layers.terrain;
    let gaps = 0;

    for (let x = 0; x < level.width; x++) {
        gaps += rows[level.height - 1][x] === materialIds.bedrock ? 0 : 1;
    }
    for (let y = 0; y < level.height - 1; y++) {
        gaps += rows[y][0] === materialIds.bedrock ? 0 : 1;
        gaps += rows[y][level.width - 1] === materialIds.bedrock ? 0 : 1;
    }

    return gaps;
}

/** Checks that both sides can place their tanks and that nothing can leave the level. */
export function lintLevel(level: Level): Problem[] {
    const problems: Problem[] = [];
    const gaps = countBorderGaps(level);

    if (gaps > 0) {
        problems.push({
            message: `The bedrock border (bottom row, left and right edges) has ${gaps} missing cell${gaps === 1 ? '' : 's'}`,
            fix: 'bedrock-border'
        });
    }
    for (const side of sides) {
        const zone = level.spawnZones[side];
        const room = countSpacedSpots(getSpawnSpots(level, side));
        const crossesMiddle = side === 'left' ? zone.x + zone.width > level.width / 2 : zone.x < level.width / 2;

        if (room < tanksPerSide) {
            problems.push({
                message: `${sideLabels[side]}: the spawn zone has ground for ${room} of ${tanksPerSide} tanks`,
                area: zone
            });
        }
        if (crossesMiddle) {
            problems.push({
                message: `${sideLabels[side]}: the spawn zone reaches past the middle of the level`,
                area: zone
            });
        }
    }

    return problems;
}

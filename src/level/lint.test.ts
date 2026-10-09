import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { addBedrockBorder, createLevel, fillRectangle, setSpawnZone, setMaterial } from './level';
import { lintLevel } from './lint';
import { countSpacedSpots, getSpawnSpots } from './spawns';
import { materialIds } from './materials';

const level = createLevel('test', 'Test', 60, 20);

describe('spawn spots', () => {
    it('finds the highest standing spot in each column of the zone', () => {
        const spots = getSpawnSpots(level, 'left');

        // The zone is 12 columns wide and a tank is 2 wide, so 11 columns work.
        expect(spots).toHaveLength(11);
        expect(spots[0]).toEqual({ x: 1, y: 14 });
        expect(countSpacedSpots(spots)).toBe(4);
    });

    it('stands on a ledge above the ground when there is one', () => {
        const withLedge = produce(level, (draft) =>
            fillRectangle(draft, 'terrain', { x: 1, y: 8 }, { x: 4, y: 8 }, materialIds.rock)
        );

        expect(
            getSpawnSpots(withLedge, 'left')
                .slice(0, 5)
                .map((spot) => spot.y)
        ).toEqual([7, 7, 7, 7, 14]);
    });
});

describe('lintLevel', () => {
    it('reports a spawn zone without room for five tanks', () => {
        expect(lintLevel(level).map((problem) => problem.message)).toEqual([
            'Player 1 (left): the spawn zone has ground for 4 of 5 tanks',
            'Player 2 (right): the spawn zone has ground for 4 of 5 tanks'
        ]);
    });

    it('accepts wide enough zones and reports zones past the middle', () => {
        const wide = produce(level, (draft) => {
            setSpawnZone(draft, 'left', { x: 1, y: 0, width: 16, height: 19 });
            setSpawnZone(draft, 'right', { x: 25, y: 0, width: 34, height: 19 });
        });

        expect(lintLevel(wide).map((problem) => problem.message)).toEqual([
            'Player 2 (right): the spawn zone reaches past the middle of the level'
        ]);
    });

    it('reports gaps in the bedrock border until it is added again', () => {
        const holed = produce(level, (draft) => {
            setSpawnZone(draft, 'left', { x: 1, y: 0, width: 16, height: 19 });
            setSpawnZone(draft, 'right', { x: 43, y: 0, width: 16, height: 19 });
            setMaterial(draft, 'terrain', 0, 3, materialIds.air);
            setMaterial(draft, 'terrain', 30, 19, materialIds.air);
        });

        expect(lintLevel(holed)).toEqual([
            {
                message: 'The bedrock border (bottom row, left and right edges) has 2 missing cells',
                fix: 'bedrock-border'
            }
        ]);
        expect(lintLevel(produce(holed, addBedrockBorder))).toEqual([]);
    });
});

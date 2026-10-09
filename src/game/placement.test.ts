import { describe, expect, it } from 'vitest';
import { createLevel, setSpawnZone } from '../level/level';
import { produce } from 'immer';
import { minimumTankSpacing } from '../level/spawns';
import { pickSpawnSpots } from './placement';
import { seedRandom } from './random';

const level = produce(createLevel('test', 'Test', 80, 20), (draft) =>
    setSpawnZone(draft, 'left', { x: 1, y: 0, width: 20, height: 19 })
);

describe('pickSpawnSpots', () => {
    it('picks the same spots for the same seed, spaced apart', () => {
        const first = pickSpawnSpots(level, 'left', 5, { randomState: seedRandom(7) });

        expect(pickSpawnSpots(level, 'left', 5, { randomState: seedRandom(7) })).toEqual(first);
        expect(first).toHaveLength(5);
        for (const spot of first) {
            for (const other of first) {
                expect(spot === other || Math.abs(spot.x - other.x) >= minimumTankSpacing).toBe(true);
            }
        }
        expect(pickSpawnSpots(level, 'left', 5, { randomState: seedRandom(8) })).not.toEqual(first);
    });

    it('returns fewer spots when the zone is too small', () => {
        const small = produce(level, (draft) => setSpawnZone(draft, 'left', { x: 1, y: 0, width: 4, height: 19 }));

        expect(pickSpawnSpots(small, 'left', 5, { randomState: 1 })).toHaveLength(1);
    });
});

import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { serializeLevel } from './level-file';
import {
    createLevel,
    floodFill,
    getNextLevelId,
    getSideAt,
    getMaterial,
    parseLevel,
    resizeLevel,
    setSpawnZone,
    setMaterial
} from './level';
import { materialIds } from './materials';

describe('createLevel', () => {
    it('creates a valid level with dirt ground, a bedrock border and a spawn zone on each side', () => {
        const level = createLevel('test', 'Test', 60, 20);

        expect(parseLevel(level)).toEqual(level);
        expect(getMaterial(level, 'terrain', 30, 14)).toBe(0);
        expect(getMaterial(level, 'terrain', 30, 15)).toBe(materialIds.dirt);
        expect(getMaterial(level, 'terrain', 30, 16)).toBe(materialIds.dirt);
        expect(getMaterial(level, 'terrain', 30, 19)).toBe(materialIds.bedrock);
        expect(getMaterial(level, 'terrain', 0, 0)).toBe(materialIds.bedrock);
        expect(getMaterial(level, 'terrain', 59, 0)).toBe(materialIds.bedrock);
        expect(level.spawnZones).toEqual({
            left: { x: 1, y: 0, width: 12, height: 19 },
            right: { x: 47, y: 0, width: 12, height: 19 }
        });
    });
});

describe('parseLevel', () => {
    it('rejects rows of the wrong length', () => {
        const level = produce(createLevel('test', 'Test', 60, 20), (draft) => {
            draft.layers.terrain[3].push(0);
        });

        expect(() => parseLevel(level)).toThrow('Layer "terrain" must have 20 rows of 60 cells');
    });

    it('rejects unknown materials', () => {
        const level = produce(createLevel('test', 'Test', 60, 20), (draft) => {
            draft.layers.terrain[3][3] = 9;
        });

        expect(() => parseLevel(level)).toThrow('Too big');
    });

    it('rejects a spawn zone outside the level', () => {
        const level = produce(createLevel('test', 'Test', 60, 20), (draft) => {
            draft.spawnZones.right.width = 20;
        });

        expect(() => parseLevel(level)).toThrow('The right spawn zone is outside the level');
    });
});

describe('editing', () => {
    it('ignores tiles outside the level', () => {
        const level = createLevel('test', 'Test', 60, 20);

        expect(produce(level, (draft) => setMaterial(draft, 'terrain', -1, 3, materialIds.rock))).toBe(level);
    });

    it('flood fills the connected area only', () => {
        const level = produce(createLevel('test', 'Test', 60, 20), (draft) => {
            for (let y = 0; y < 15; y++) {
                setMaterial(draft, 'terrain', 10, y, materialIds.rock);
            }
            floodFill(draft, 'terrain', 5, 2, materialIds.rock);
        });

        expect(getMaterial(level, 'terrain', 9, 0)).toBe(materialIds.rock);
        expect(getMaterial(level, 'terrain', 11, 0)).toBe(0);
        expect(getMaterial(level, 'terrain', 5, 16)).toBe(materialIds.dirt);
        expect(getMaterial(level, 'terrain', 5, 15)).toBe(materialIds.dirt);
    });

    it('clips spawn zones to the level and keeps the level when nothing changes', () => {
        const level = createLevel('test', 'Test', 60, 20);
        const moved = produce(level, (draft) => setSpawnZone(draft, 'left', { x: -5, y: 10, width: 10, height: 20 }));

        expect(moved.spawnZones.left).toEqual({ x: 0, y: 10, width: 5, height: 10 });
        expect(produce(level, (draft) => setSpawnZone(draft, 'left', level.spawnZones.left))).toBe(level);
        expect(produce(level, (draft) => setSpawnZone(draft, 'left', { x: 70, y: 0, width: 3, height: 3 }))).toBe(
            level
        );
    });

    it('tells the sides apart at the middle', () => {
        expect(getSideAt({ width: 60 }, 29)).toBe('left');
        expect(getSideAt({ width: 60 }, 30)).toBe('right');
    });
});

describe('resizeLevel', () => {
    it('keeps the bottom-left corner in place and moves the spawn zones with the tiles', () => {
        const level = createLevel('test', 'Test', 60, 20);
        const taller = resizeLevel(level, 50, 24);

        expect(parseLevel(taller)).toEqual(taller);
        expect(getMaterial(taller, 'terrain', 5, 19)).toBe(materialIds.dirt);
        expect(getMaterial(taller, 'terrain', 5, 18)).toBe(0);
        expect(taller.spawnZones.left).toEqual({ x: 1, y: 4, width: 12, height: 19 });
        expect(taller.spawnZones.right).toEqual({ x: 47, y: 4, width: 3, height: 19 });
    });

    it('resets a spawn zone that ends up outside the level', () => {
        const narrower = resizeLevel(createLevel('test', 'Test', 100, 20), 45, 20);

        expect(narrower.spawnZones.right).toEqual({ x: 35, y: 0, width: 9, height: 19 });
    });
});

describe('getNextLevelId', () => {
    it('skips taken ids', () => {
        expect(getNextLevelId(['level-1', 'level-3'])).toBe('level-2');
    });
});

describe('level files', () => {
    it('puts each row of tiles on one line', () => {
        const text = serializeLevel(createLevel('test', 'Test', 40, 20));

        expect(text).toContain(`\n            [3,${'0,'.repeat(38)}3],\n`);
        expect(parseLevel(JSON.parse(text))).toEqual(createLevel('test', 'Test', 40, 20));
    });

    it('bundled levels are valid and round-trip byte for byte', () => {
        const files = Object.entries(
            import.meta.glob<string>('../assets/levels/*.json', { eager: true, query: '?raw', import: 'default' })
        );

        expect(files.length).toBeGreaterThan(0);
        for (const [, text] of files) {
            expect(serializeLevel(parseLevel(JSON.parse(text)))).toBe(text);
        }
    });
});

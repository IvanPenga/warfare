import { describe, expect, it } from 'vitest';
import { createLevel, getMaterial } from '../level/level';
import { lintLevel } from '../level/lint';
import { materialIds } from '../level/materials';
import { createEditorStore, hasUnsavedEdits, isUnsaved } from './editor-store';
import { getTilesOnLine, paintCell } from './paint';
import { createMemoryRepository } from './repository';

function createTestStore(levels = [createLevel('level-1', 'One'), createLevel('level-2', 'Two')]) {
    const repository = createMemoryRepository(levels);

    return { store: createEditorStore({ repository }), repository };
}

describe('editor store', () => {
    it('opens the preferred level after loading', async () => {
        const { store } = createTestStore();

        await store.getState().loadLevels('level-2');

        expect(store.getState().level.name).toBe('Two');
        expect(isUnsaved(store.getState())).toBe(false);
    });

    it('makes a whole brush stroke one undo step', async () => {
        const { store } = createTestStore();

        await store.getState().loadLevels();
        const state = store.getState();

        state.beginStroke();
        for (const position of getTilesOnLine({ x: 1, y: 0 }, { x: 5, y: 0 })) {
            store.getState().editLevel((level) => paintCell(level, 'terrain', position, materialIds.rock, false));
        }
        state.endStroke();

        expect(store.getState().past).toHaveLength(1);
        expect(getMaterial(store.getState().level, 'terrain', 5, 0)).toBe(materialIds.rock);
        expect(hasUnsavedEdits(store.getState())).toBe(true);

        store.getState().undo();
        expect(getMaterial(store.getState().level, 'terrain', 5, 0)).toBe(0);
        expect(isUnsaved(store.getState())).toBe(false);

        store.getState().redo();
        expect(getMaterial(store.getState().level, 'terrain', 5, 0)).toBe(materialIds.rock);
    });

    it('does not record edits that change nothing', () => {
        const { store } = createTestStore();

        store.getState().editLevel((level) => paintCell(level, 'terrain', { x: 5, y: 0 }, materialIds.rock, true));
        store.getState().setSpawnZone('left', store.getState().level.spawnZones.left);

        expect(store.getState().past).toHaveLength(0);
    });

    it('saves through the repository and marks the level as saved', async () => {
        const { store, repository } = createTestStore([]);

        store.getState().editLevel((level) => paintCell(level, 'terrain', { x: 1, y: 1 }, materialIds.rock, false));
        await store.getState().save();

        expect(repository.saved.map((level) => level.id)).toEqual(['level-1']);
        expect(isUnsaved(store.getState())).toBe(false);
        expect(Object.keys(store.getState().levels)).toEqual(['level-1']);
    });

    it('gives new levels a free id', async () => {
        const { store } = createTestStore();

        await store.getState().loadLevels();
        store.getState().newLevel();

        expect(store.getState().level.id).toBe('level-3');
        expect(hasUnsavedEdits(store.getState())).toBe(false);
    });

    it('generates terrain from the panel options as one undo step', () => {
        const { store } = createTestStore();
        const before = store.getState().level;

        store.getState().setTerrainOptions({ seed: 7, caves: 0.3 });
        store.getState().generate();

        expect(store.getState().past).toEqual([before]);
        expect(store.getState().level.layers).not.toEqual(before.layers);
        expect(lintLevel(store.getState().level)).toEqual([]);
        expect(store.getState().level.name).toBe(before.name);
    });

    it('starts and stops a local match with a new seed each time', () => {
        const { store } = createTestStore();

        store.getState().startPlaytest();
        const first = store.getState().playtest?.seed;

        store.getState().startPlaytest();
        expect(store.getState().playtest?.seed).not.toBe(first);

        store.getState().stopPlaytest();
        expect(store.getState().playtest).toBeNull();
    });

    it('fixes the bedrock border', () => {
        const { store } = createTestStore();

        store.getState().editLevel((level) => paintCell(level, 'terrain', { x: 0, y: 3 }, 0, true));
        store.getState().addBedrockBorder();

        expect(getMaterial(store.getState().level, 'terrain', 0, 3)).toBe(materialIds.bedrock);
        expect(store.getState().past).toHaveLength(2);
    });
});

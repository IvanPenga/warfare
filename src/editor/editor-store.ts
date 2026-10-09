import { produce } from 'immer';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
    addBedrockBorder,
    createLevel,
    getNextLevelId,
    setSpawnZone,
    type LayerName,
    type Level,
    type Side,
    type TilePosition,
    type TileRectangle
} from '../level/level';
import { defaultTerrainOptions, generateTerrain, type TerrainOptions } from '../level/terrain-generator';
import { materialIds } from '../level/materials';
import type { EditorTool } from './paint';
import type { InvalidFile, LevelRepository } from './repository';

const historyLimit = 200;
const messageDuration = 2500;

export type EditorState = {
    level: Level;
    /** The level as it was last saved or opened, or null for a new level that has never been saved. */
    savedLevel: Level | null;
    /** Every saved level, by id. */
    levels: Record<string, Level>;
    /** Level files that could not be read. */
    invalidFiles: InvalidFile[];
    /** Undo and redo steps are snapshots of the whole level. Immer shares unchanged rows between them. */
    past: Level[];
    future: Level[];
    /** The level before the brush stroke in progress. A whole stroke becomes one undo step. */
    strokeStart: Level | null;
    tool: EditorTool;
    /** The material the brush, rectangle and fill tools put down. */
    material: number;
    activeLayer: LayerName;
    showGrid: boolean;
    showParallax: boolean;
    showZones: boolean;
    hoverTile: TilePosition | null;
    zoom: number;
    /** The options of the terrain generator panel, kept while switching levels. */
    terrainOptions: TerrainOptions;
    /** Incremented to ask the canvas to show the whole level again. */
    frameRequest: number;
    /** The local match in progress, played on the level as it was when it started, with tanks placed from `seed`. */
    playtest: { seed: number } | null;
    /** An area the canvas should move to and highlight, e.g. the spawn zone a problem is about. */
    focus: { area: TileRectangle; request: number } | null;
    message: string | null;

    /** Loads the level list and opens `preferredLevelId` (or the first level) unless the user already started editing. */
    loadLevels: (preferredLevelId?: string | null) => Promise<void>;
    openLevel: (id: string) => void;
    newLevel: () => void;
    /** Applies an immer recipe to the level as one undo step (or as part of the stroke in progress). */
    editLevel: (recipe: (draft: Level) => void) => void;
    replaceLevel: (level: Level) => void;
    beginStroke: () => void;
    endStroke: () => void;
    undo: () => void;
    redo: () => void;
    save: () => Promise<void>;
    setTool: (tool: EditorTool) => void;
    /** Selects the brush material and switches from erase, pick or zone back to the brush. */
    selectMaterial: (material: number) => void;
    setActiveLayer: (layer: LayerName) => void;
    toggleGrid: () => void;
    toggleParallax: () => void;
    toggleZones: () => void;
    setHoverTile: (position: TilePosition | null) => void;
    setZoom: (zoom: number) => void;
    requestFrame: () => void;
    setTerrainOptions: (options: Partial<TerrainOptions>) => void;
    /** Replaces the terrain with generated terrain, as one undo step. */
    generate: () => void;
    addBedrockBorder: () => void;
    setSpawnZone: (side: Side, zone: TileRectangle) => void;
    focusArea: (area: TileRectangle) => void;
    /** Starts a local match on the current level (unsaved changes included). */
    startPlaytest: () => void;
    stopPlaytest: () => void;
    showMessage: (message: string) => void;
};

export type EditorStore = StoreApi<EditorState>;

/** Whether the level differs from its file (a new level that was never saved counts as unsaved). */
export function isUnsaved(state: Pick<EditorState, 'level' | 'savedLevel'>): boolean {
    return state.level !== state.savedLevel;
}

/** Whether leaving the level would lose work. A new level nobody has edited yet does not count. */
export function hasUnsavedEdits(state: Pick<EditorState, 'level' | 'savedLevel' | 'past' | 'future'>): boolean {
    return isUnsaved(state) && (state.savedLevel !== null || state.past.length > 0 || state.future.length > 0);
}

export function createEditorStore({ repository }: { repository: LevelRepository }): EditorStore {
    return createStore<EditorState>()((set, get) => ({
        level: createLevel('level-1', 'Level 1'),
        savedLevel: null,
        levels: {},
        invalidFiles: [],
        past: [],
        future: [],
        strokeStart: null,
        tool: 'brush',
        material: materialIds.dirt,
        activeLayer: 'terrain',
        showGrid: false,
        showParallax: true,
        showZones: true,
        hoverTile: null,
        zoom: 1,
        terrainOptions: defaultTerrainOptions,
        frameRequest: 0,
        playtest: null,
        focus: null,
        message: null,

        async loadLevels(preferredLevelId) {
            const { items, invalid } = await repository.listLevels();
            const levels = Object.fromEntries(items.map((level) => [level.id, level]));

            set({ levels, invalidFiles: invalid });
            const { past, savedLevel } = get();
            const untouched = past.length === 0 && savedLevel === null;
            const id = preferredLevelId && levels[preferredLevelId] ? preferredLevelId : items[0]?.id;

            if (untouched && id) {
                get().openLevel(id);
            }
        },

        openLevel(id) {
            const level = get().levels[id];

            if (level) {
                set({ level, savedLevel: level, past: [], future: [], strokeStart: null });
            }
        },

        newLevel() {
            const { levels, level } = get();
            const id = getNextLevelId([...Object.keys(levels), level.id]);

            set({
                level: createLevel(id, `Level ${id.replace('level-', '')}`),
                savedLevel: null,
                past: [],
                future: [],
                strokeStart: null
            });
        },

        editLevel(recipe) {
            get().replaceLevel(produce(get().level, recipe));
        },

        replaceLevel(next) {
            const { level, strokeStart, past } = get();

            if (next === level) {
                return;
            }
            set(
                strokeStart ? { level: next } : { level: next, past: [...past, level].slice(-historyLimit), future: [] }
            );
        },

        beginStroke() {
            set({ strokeStart: get().level });
        },

        endStroke() {
            const { strokeStart, level, past } = get();

            if (strokeStart && strokeStart !== level) {
                set({ past: [...past, strokeStart].slice(-historyLimit), future: [] });
            }
            set({ strokeStart: null });
        },

        undo() {
            const { past, future, level } = get();
            const previous = past.at(-1);

            if (previous) {
                set({ level: previous, past: past.slice(0, -1), future: [level, ...future] });
            }
        },

        redo() {
            const { past, future, level } = get();
            const [next, ...rest] = future;

            if (next) {
                set({ level: next, past: [...past, level], future: rest });
            }
        },

        async save() {
            const { level } = get();

            try {
                await repository.saveLevel(level);
                set((state) => ({ savedLevel: level, levels: { ...state.levels, [level.id]: level } }));
                get().showMessage(`Saved ${level.id}.json`);
            } catch (error) {
                get().showMessage(`Could not save: ${error instanceof Error ? error.message : String(error)}`);
            }
        },

        setTool(tool) {
            set({ tool });
        },

        selectMaterial(material) {
            const { tool } = get();

            set({ material, tool: tool === 'erase' || tool === 'pick' || tool === 'zone' ? 'brush' : tool });
        },

        setActiveLayer(activeLayer) {
            set({ activeLayer });
        },

        toggleGrid() {
            set({ showGrid: !get().showGrid });
        },

        toggleParallax() {
            set({ showParallax: !get().showParallax });
        },

        toggleZones() {
            set({ showZones: !get().showZones });
        },

        setHoverTile(position) {
            const current = get().hoverTile;

            if (current?.x !== position?.x || current?.y !== position?.y) {
                set({ hoverTile: position });
            }
        },

        setZoom(zoom) {
            set({ zoom });
        },

        requestFrame() {
            set({ frameRequest: get().frameRequest + 1 });
        },

        setTerrainOptions(options) {
            set({ terrainOptions: { ...get().terrainOptions, ...options } });
        },

        generate() {
            const { level, terrainOptions } = get();

            get().replaceLevel(generateTerrain(level, terrainOptions));
        },

        addBedrockBorder() {
            get().editLevel(addBedrockBorder);
        },

        setSpawnZone(side, zone) {
            get().editLevel((level) => setSpawnZone(level, side, zone));
        },

        focusArea(area) {
            set({ focus: { area, request: (get().focus?.request ?? 0) + 1 } });
        },

        startPlaytest() {
            set({ playtest: { seed: Math.floor(Math.random() * 2 ** 31) }, hoverTile: null });
        },

        stopPlaytest() {
            set({ playtest: null });
        },

        showMessage(message) {
            set({ message });
            setTimeout(() => {
                if (get().message === message) {
                    set({ message: null });
                }
            }, messageDuration);
        }
    }));
}

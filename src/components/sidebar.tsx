import { layerNames } from '../level/level';
import { materials } from '../level/materials';
import { editorStore, useEditor } from '../editor/editor';
import { hasUnsavedEdits, isUnsaved } from '../editor/editor-store';
import type { EditorTool } from '../editor/paint';
import { toolShortcuts } from '../editor/use-editor-shortcuts';
import { LevelProperties } from './level-properties';
import { ProblemsPanel } from './problems-panel';
import { MaterialPreview } from './previews';
import { TerrainPanel } from './terrain-panel';

const toolLabels: Record<EditorTool, string> = {
    brush: 'Brush',
    erase: 'Erase',
    rectangle: 'Rectangle',
    fill: 'Fill',
    pick: 'Pick',
    zone: 'Spawn zone'
};

const toolKeys = Object.fromEntries(Object.entries(toolShortcuts).map(([key, tool]) => [tool, key.toUpperCase()]));

const layerLabels = { terrain: 'Terrain', backWall: 'Back wall' };

const shortcuts: [string, string][] = [
    ['Left drag', 'Use tool'],
    ['Right drag', 'Erase'],
    ['Z, then drag', 'Spawn zone of that half'],
    ['Space / middle drag', 'Pan'],
    ['Arrows / WASD', 'Pan'],
    ['Wheel', 'Zoom'],
    ['Home', 'Show whole level'],
    ['1–3', 'Pick material'],
    ['Tab', 'Switch layer'],
    ['P', 'Play a local match'],
    ['G / V / O', 'Grid / parallax / zones'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
    ['Ctrl+S', 'Save']
];

function confirmDiscard(): boolean {
    const state = editorStore.getState();

    return !hasUnsavedEdits(state) || window.confirm(`Discard unsaved changes to "${state.level.name}"?`);
}

function LevelSection() {
    const level = useEditor((state) => state.level);
    const levels = useEditor((state) => state.levels);
    const invalidFiles = useEditor((state) => state.invalidFiles);
    const unsaved = useEditor(isUnsaved);
    const { openLevel, newLevel, save, startPlaytest } = editorStore.getState();
    const ids = Object.keys(levels).sort();

    if (!levels[level.id]) {
        ids.push(level.id);
    }

    return (
        <section>
            <h2>Level</h2>
            <div className='row'>
                <select
                    className='grow'
                    value={level.id}
                    onChange={(event) => confirmDiscard() && openLevel(event.target.value)}
                >
                    {ids.map((id) => (
                        <option key={id} value={id}>
                            {levels[id] ? `${levels[id].name} (${id})` : `${level.name} (new)`}
                        </option>
                    ))}
                </select>
                <button onClick={() => confirmDiscard() && newLevel()}>New</button>
                <button className={unsaved ? 'primary' : ''} disabled={!unsaved} onClick={() => void save()}>
                    Save
                </button>
            </div>
            <button className='wide-button' onClick={() => startPlaytest()}>
                ▶ Play local match <kbd>P</kbd>
            </button>
            {invalidFiles.map((file) => (
                <p key={file.file} className='warning' title={file.error}>
                    Could not read {file.file}
                </p>
            ))}
        </section>
    );
}

function ToolSection() {
    const tool = useEditor((state) => state.tool);
    const activeLayer = useEditor((state) => state.activeLayer);
    const { setTool, setActiveLayer } = editorStore.getState();

    return (
        <section>
            <h2>Tools</h2>
            <div className='button-grid'>
                {(Object.keys(toolLabels) as EditorTool[]).map((id) => (
                    <button key={id} className={tool === id ? 'active' : ''} onClick={() => setTool(id)}>
                        {toolLabels[id]} <kbd>{toolKeys[id]}</kbd>
                    </button>
                ))}
            </div>
            <h2>Layer</h2>
            <div className='segmented'>
                {layerNames.map((layer) => (
                    <button
                        key={layer}
                        className={activeLayer === layer ? 'active' : ''}
                        onClick={() => setActiveLayer(layer)}
                    >
                        {layerLabels[layer]}
                    </button>
                ))}
            </div>
        </section>
    );
}

function PaletteSection() {
    const material = useEditor((state) => state.material);
    const { selectMaterial } = editorStore.getState();

    return (
        <section>
            <h2>Materials</h2>
            <div className='palette'>
                {materials.map((definition, index) => (
                    <button
                        key={definition.id}
                        title={`${definition.name} (${index + 1})${definition.destructible ? '' : ' · indestructible'}`}
                        className={material === definition.id ? 'active' : ''}
                        onClick={() => selectMaterial(definition.id)}
                    >
                        <MaterialPreview material={definition.id} />
                    </button>
                ))}
            </div>
        </section>
    );
}

function ViewSection() {
    const showGrid = useEditor((state) => state.showGrid);
    const showParallax = useEditor((state) => state.showParallax);
    const showZones = useEditor((state) => state.showZones);
    const { toggleGrid, toggleParallax, toggleZones } = editorStore.getState();

    return (
        <section>
            <h2>View</h2>
            <label className='checkbox'>
                <input type='checkbox' checked={showGrid} onChange={toggleGrid} /> Grid
            </label>
            <label className='checkbox'>
                <input type='checkbox' checked={showParallax} onChange={toggleParallax} /> Parallax background
            </label>
            <label className='checkbox'>
                <input type='checkbox' checked={showZones} onChange={toggleZones} /> Spawn zones
            </label>
        </section>
    );
}

export function Sidebar() {
    return (
        <aside className='sidebar'>
            <header>Warfare level editor</header>
            <LevelSection />
            <ProblemsPanel />
            <LevelProperties />
            <TerrainPanel />
            <ToolSection />
            <PaletteSection />
            <ViewSection />
            <section>
                <h2>Shortcuts</h2>
                <dl className='shortcuts'>
                    {shortcuts.map(([keys, action]) => (
                        <div key={keys}>
                            <dt>{keys}</dt>
                            <dd>{action}</dd>
                        </div>
                    ))}
                </dl>
            </section>
        </aside>
    );
}

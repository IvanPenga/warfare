import { terrainOptionRanges, type TerrainOptions } from '../level/terrain-generator';
import { editorStore, useEditor } from '../editor/editor';

type NumberOption = keyof typeof terrainOptionRanges;

const optionLabels: Record<NumberOption, string> = {
    groundLevel: 'Ground level',
    hilliness: 'Hills',
    roughness: 'Roughness',
    caves: 'Caves',
    rock: 'Rock'
};

function Slider({ option, options }: { option: NumberOption; options: TerrainOptions }) {
    const range = terrainOptionRanges[option];

    return (
        <label className='slider'>
            <span>{optionLabels[option]}</span>
            <input
                type='range'
                min={range.min}
                max={range.max}
                step={range.step}
                value={options[option]}
                onChange={(event) => editorStore.getState().setTerrainOptions({ [option]: Number(event.target.value) })}
            />
            <output>{option === 'roughness' ? options[option] : `${Math.round(options[option] * 100)}%`}</output>
        </label>
    );
}

/** Generates new terrain for the whole level from a seed and a few sliders. The result can then be edited by hand. */
export function TerrainPanel() {
    const options = useEditor((state) => state.terrainOptions);
    const { setTerrainOptions, generate } = editorStore.getState();

    return (
        <section>
            <h2>Generate terrain</h2>
            <div className='row'>
                <label className='field'>
                    <span>Seed</span>
                    <input
                        type='number'
                        value={options.seed}
                        onChange={(event) => setTerrainOptions({ seed: Math.round(Number(event.target.value)) || 0 })}
                    />
                </label>
                <button
                    title='Pick a random seed and generate'
                    onClick={() => {
                        setTerrainOptions({ seed: Math.floor(Math.random() * 1_000_000) });
                        generate();
                    }}
                >
                    Random
                </button>
            </div>
            {(Object.keys(optionLabels) as NumberOption[]).map((option) => (
                <Slider key={option} option={option} options={options} />
            ))}
            <label className='checkbox'>
                <input
                    type='checkbox'
                    checked={options.symmetric}
                    onChange={(event) => setTerrainOptions({ symmetric: event.target.checked })}
                />
                Mirror left and right (fair for both players)
            </label>
            <button
                className='wide-button'
                title='Replaces both layers and resets the spawn zones (undo with Ctrl+Z)'
                onClick={generate}
            >
                Generate
            </button>
        </section>
    );
}

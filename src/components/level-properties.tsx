import { useState } from 'react';
import { backgroundPresetNames, type BackgroundPreset } from '../level/background';
import { maxLevelHeight, maxLevelWidth, minLevelHeight, minLevelWidth, resizeLevel } from '../level/level';
import { editorStore, useEditor } from '../editor/editor';

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, Math.round(value)));
}

function NameField({ name }: { name: string }) {
    const [value, setValue] = useState(name);
    const commit = () => {
        const trimmed = value.trim();

        if (trimmed && trimmed !== name) {
            editorStore.getState().editLevel((level) => {
                level.name = trimmed;
            });
        } else {
            setValue(name);
        }
    };

    return (
        <label className='field'>
            <span>Name</span>
            <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            />
        </label>
    );
}

function SizeFields({ width, height }: { width: number; height: number }) {
    const [newWidth, setNewWidth] = useState(String(width));
    const [newHeight, setNewHeight] = useState(String(height));
    const nextWidth = clamp(Number(newWidth) || width, minLevelWidth, maxLevelWidth);
    const nextHeight = clamp(Number(newHeight) || height, minLevelHeight, maxLevelHeight);
    const changed = nextWidth !== width || nextHeight !== height;

    return (
        <div className='row'>
            <label className='field'>
                <span>Width</span>
                <input
                    type='number'
                    min={minLevelWidth}
                    max={maxLevelWidth}
                    value={newWidth}
                    onChange={(event) => setNewWidth(event.target.value)}
                />
            </label>
            <label className='field'>
                <span>Height</span>
                <input
                    type='number'
                    min={minLevelHeight}
                    max={maxLevelHeight}
                    value={newHeight}
                    onChange={(event) => setNewHeight(event.target.value)}
                />
            </label>
            <button
                disabled={!changed}
                title='Rows are added or removed at the top, columns on the right'
                onClick={() => {
                    const state = editorStore.getState();

                    state.replaceLevel(resizeLevel(state.level, nextWidth, nextHeight));
                }}
            >
                Resize
            </button>
        </div>
    );
}

export function LevelProperties() {
    const level = useEditor((state) => state.level);
    const { editLevel } = editorStore.getState();

    return (
        <section>
            <h2>Properties</h2>
            {/* The keys reset the local field values when the level changes, e.g. on undo. */}
            <NameField key={`${level.id}:${level.name}`} name={level.name} />
            <SizeFields key={`${level.id}:${level.width}x${level.height}`} width={level.width} height={level.height} />
            <div className='row'>
                <label className='field'>
                    <span>Background</span>
                    <select
                        value={level.background.preset}
                        onChange={(event) =>
                            editLevel((draft) => {
                                draft.background.preset = event.target.value as BackgroundPreset;
                            })
                        }
                    >
                        {backgroundPresetNames.map((preset) => (
                            <option key={preset} value={preset}>
                                {preset}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    title='Generate new background shapes'
                    onClick={() =>
                        editLevel((draft) => {
                            draft.background.seed = Math.floor(Math.random() * 1_000_000);
                        })
                    }
                >
                    Reroll
                </button>
            </div>
        </section>
    );
}

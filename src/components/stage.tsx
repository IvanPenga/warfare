import { useEffect, useRef } from 'react';
import { createCanvasController } from '../editor/canvas-controller';
import { createGameRunner } from '../runner/game-runner';
import { editorStore, useEditor } from '../editor/editor';
import { isUnsaved } from '../editor/editor-store';
import { getMaterial } from '../level/level';
import { getMaterialDefinition } from '../level/materials';

function LevelCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current) {
            return;
        }
        const controller = createCanvasController(canvasRef.current, editorStore);

        return () => controller.dispose();
    }, []);

    return <canvas ref={canvasRef} className='level-canvas' />;
}

const playtestHint =
    'Tab / 1–5 tank · ←/→ drive · ↑/↓ angle · W/S power · Space fire · Wheel zoom · Esc back to editor';

function PlaytestView({ seed }: { seed: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current) {
            return;
        }
        const { level, stopPlaytest } = editorStore.getState();

        // A focused sidebar button would be clicked by the fire key (Space).
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        const runner = createGameRunner(canvasRef.current, level, {
            seed,
            hint: playtestHint,
            matchOverHint: 'Enter: new match · Esc: back to editor',
            onExit: stopPlaytest
        });

        return () => runner.dispose();
    }, [seed]);

    return <canvas ref={canvasRef} className='playtest-canvas' />;
}

function StatusBar() {
    const hoverTile = useEditor((state) => state.hoverTile);
    const hoverTileName = useEditor((state) =>
        state.hoverTile
            ? getMaterialDefinition(getMaterial(state.level, state.activeLayer, state.hoverTile.x, state.hoverTile.y))
                  ?.name
            : undefined
    );
    const zoom = useEditor((state) => state.zoom);
    const activeLayer = useEditor((state) => state.activeLayer);
    const width = useEditor((state) => state.level.width);
    const height = useEditor((state) => state.level.height);
    const message = useEditor((state) => state.message);
    const unsaved = useEditor(isUnsaved);
    const playtesting = useEditor((state) => state.playtest !== null);

    if (playtesting) {
        return (
            <div className='status-bar'>
                <span>
                    Local match on the current level (unsaved changes included), both players on this keyboard · Esc:
                    back to editor
                </span>
            </div>
        );
    }

    return (
        <div className='status-bar'>
            <span>{hoverTile ? `${hoverTile.x}, ${hoverTile.y} ${hoverTileName ?? ''}` : '–'}</span>
            <span>{Math.round(zoom * 100)}%</span>
            <span>Layer: {activeLayer === 'terrain' ? 'terrain' : 'back wall'}</span>
            <span>
                {width} × {height}
            </span>
            {unsaved && <span className='unsaved'>Unsaved</span>}
            {message && <span className='message'>{message}</span>}
        </div>
    );
}

export function Stage() {
    const playtest = useEditor((state) => state.playtest);

    return (
        <main className='stage'>
            <div className='viewport'>
                <LevelCanvas />
                {playtest && <PlaytestView seed={playtest.seed} />}
            </div>
            <StatusBar />
        </main>
    );
}

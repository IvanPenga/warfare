import { useEffect } from 'react';
import { materials } from '../level/materials';
import { isTypingTarget } from './canvas-controller';
import { editorStore } from './editor';
import type { EditorTool } from './paint';

export const toolShortcuts: Record<string, EditorTool> = {
    b: 'brush',
    e: 'erase',
    r: 'rectangle',
    f: 'fill',
    i: 'pick',
    z: 'zone'
};

/** Editor keyboard shortcuts. Panning keys (space, arrows, WASD) are handled by the canvas controller. */
export function useEditorShortcuts() {
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            const state = editorStore.getState();

            // While playtesting, the game runner owns the keyboard.
            if (isTypingTarget(event.target) || state.playtest) {
                return;
            }
            const key = event.key.toLowerCase();

            if (event.ctrlKey || event.metaKey) {
                if (key === 'z') {
                    event.preventDefault();
                    if (event.shiftKey) {
                        state.redo();
                    } else {
                        state.undo();
                    }
                } else if (key === 'y') {
                    event.preventDefault();
                    state.redo();
                } else if (key === 's') {
                    event.preventDefault();
                    void state.save();
                }

                return;
            }
            if (event.altKey) {
                return;
            }
            if (toolShortcuts[key]) {
                state.setTool(toolShortcuts[key]);
            } else if (key === 'p') {
                state.startPlaytest();
            } else if (key === 'g') {
                state.toggleGrid();
            } else if (key === 'v') {
                state.toggleParallax();
            } else if (key === 'o') {
                state.toggleZones();
            } else if (key === 'home') {
                state.requestFrame();
            } else if (event.key === 'Tab') {
                event.preventDefault();
                state.setActiveLayer(state.activeLayer === 'terrain' ? 'backWall' : 'terrain');
            } else if (/^[1-9]$/.test(key) && materials[Number(key) - 1]) {
                state.selectMaterial(materials[Number(key) - 1].id);
            }
        }

        window.addEventListener('keydown', onKeyDown);

        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);
}

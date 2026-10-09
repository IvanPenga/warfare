import { useEffect } from 'react';
import { Sidebar } from './components/sidebar';
import { Stage } from './components/stage';
import { editorStore, readLastLevelId } from './editor/editor';
import { hasUnsavedEdits } from './editor/editor-store';
import { useEditorShortcuts } from './editor/use-editor-shortcuts';

/** The level editor: the sidebar with the level, tools and generator, and the level canvas. */
export function App() {
    useEditorShortcuts();

    useEffect(() => {
        const state = editorStore.getState();

        state.loadLevels(readLastLevelId()).catch((error: unknown) => {
            state.showMessage(`Could not load levels: ${error instanceof Error ? error.message : String(error)}`);
        });
    }, []);

    useEffect(() => {
        const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
            if (hasUnsavedEdits(editorStore.getState())) {
                event.preventDefault();
            }
        };

        window.addEventListener('beforeunload', warnBeforeLeaving);

        return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
    }, []);

    return (
        <div className='app'>
            <Sidebar />
            <Stage />
        </div>
    );
}

import { useStore } from 'zustand';
import { createEditorStore, type EditorState } from './editor-store';
import { createDevServerRepository } from './repository';

const lastLevelKey = 'warfare-editor:last-level';

/** The app-wide editor store. Tests create their own store with createEditorStore instead of importing this. */
export const editorStore = createEditorStore({
    repository: createDevServerRepository()
});

export function useEditor<T>(selector: (state: EditorState) => T): T {
    return useStore(editorStore, selector);
}

export function readLastLevelId(): string | null {
    try {
        return localStorage.getItem(lastLevelKey);
    } catch {
        return null;
    }
}

editorStore.subscribe((state, previous) => {
    if (state.savedLevel && state.savedLevel.id !== previous.savedLevel?.id) {
        try {
            localStorage.setItem(lastLevelKey, state.level.id);
        } catch {
            // Storage can be unavailable (private mode); remembering the level is only a convenience.
        }
    }
});

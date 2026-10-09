import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { levelFilesPlugin } from './vite-plugins/level-files-plugin.ts';

const levelsDirectory = fileURLToPath(new URL('./src/assets/levels', import.meta.url));
/** Set by `npm run game`: serve only the game, without the editor's file API. */
const gameOnly = process.env.VITE_GAME_ONLY === 'true';

// https://vite.dev/config/
export default defineConfig({
    // The build has only index.html, which loads the game (see src/main.tsx). game.html is for development.
    plugins: [react(), ...(gameOnly ? [] : [levelFilesPlugin(levelsDirectory)])],
    test: {
        testTimeout: 10000
    }
});

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// The editor is a development tool: production builds and `npm run game` load only the game. `import.meta.env.PROD`
// is replaced by a constant, so the build drops the editor branch and never bundles the editor.
if (import.meta.env.PROD || import.meta.env.VITE_GAME_ONLY === 'true') {
    void import('./game-main');
} else {
    const [{ App }] = await Promise.all([import('./app'), import('./app.css')]);

    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <App />
        </StrictMode>
    );
}

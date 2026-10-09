import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StandaloneGame } from './components/standalone-game';
import './game.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <StandaloneGame />
    </StrictMode>
);

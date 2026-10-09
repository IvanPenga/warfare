import {
    applyCommand,
    createGameState,
    getActiveTank,
    getLivingTanks,
    stepGame,
    type GameEvent,
    type GameState
} from '../game/game-state';
import { tankTypes } from '../game/tank-types';
import { noInput, stepDuration, type TankInput } from '../game/tanks';
import type { Level } from '../level/level';
import { sideColors } from '../rendering/colors';
import { createEffects } from '../rendering/effects';
import { drawGame, sideNames, type GameScene, type HudTexts } from '../rendering/game-renderer';
import { createLevelPainter, type Camera, type ViewSize } from '../rendering/level-renderer';
import { createTerrainImage } from '../rendering/terrain-renderer';
import { followTarget, getDefaultZoom, maxZoom, minZoom } from './camera';

/** At most this much time is simulated per frame, so a hidden tab does not fast-forward on return. */
const maxFrameTime = 0.1;

const inputKeys: Record<string, keyof TankInput> = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ArrowUp: 'angleUp',
    ArrowDown: 'angleDown',
    KeyW: 'powerUp',
    KeyS: 'powerDown'
};

export type GameRunnerOptions = HudTexts & {
    seed: number;
    /** Escape was pressed. */
    onExit?: () => void;
    /** Shown under the result when the match is over. */
    matchOverHint: string;
};

/**
 * Runs a local match on a canvas, both players on one keyboard: keys to commands, the fixed-step loop, the camera and
 * drawing. It changes the game only through `applyCommand` and `stepGame`.
 */
export function createGameRunner(canvas: HTMLCanvasElement, level: Level, options: GameRunnerOptions) {
    const context = canvas.getContext('2d')!;
    const view: ViewSize = { width: 0, height: 0 };
    const camera: Camera = { x: 0, y: 0, zoom: 1 };
    const input: TankInput = { ...noInput };
    let state: GameState = createGameState(level, { seed: options.seed });
    let scene: GameScene = createScene();
    /** Where the camera looks while no tank or shot needs following, e.g. the last explosion. */
    let focus = { x: state.terrain.width / 2, y: state.terrain.height / 2 };
    let zoomChosen = false;
    let snapCamera = true;
    let accumulator = 0;
    let lastTime = performance.now();
    let clock = 0;
    let animationFrame = 0;

    function createScene(): GameScene {
        return {
            painter: createLevelPainter(),
            terrain: createTerrainImage(state.terrain),
            effects: createEffects(),
            banner: null
        };
    }

    function resize() {
        const ratio = window.devicePixelRatio || 1;
        const bounds = canvas.getBoundingClientRect();

        view.width = bounds.width;
        view.height = bounds.height;
        canvas.width = Math.round(bounds.width * ratio);
        canvas.height = Math.round(bounds.height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        camera.zoom = clampZoom(zoomChosen ? camera.zoom : getDefaultZoom(view));
        snapCamera = true;
    }

    function handle(events: GameEvent[]) {
        for (const event of events) {
            scene.effects.add(event);
            if ((event.type === 'explosion' || event.type === 'dig') && event.area) {
                scene.terrain.redraw(event.area);
            }
            if (event.type === 'explosion') {
                focus = { x: event.x, y: event.y };
            } else if (event.type === 'turnStarted') {
                scene.banner = {
                    title: `${sideNames[event.side]}'s turn`,
                    subtitle: `Turn ${event.number}`,
                    color: sideColors[event.side],
                    age: 0
                };
            } else if (event.type === 'matchOver') {
                scene.banner = {
                    title: event.winner === 'draw' ? 'Draw' : `${sideNames[event.winner]} wins`,
                    subtitle: options.matchOverHint,
                    color: event.winner === 'draw' ? '#e6e6ec' : sideColors[event.winner],
                    age: 0
                };
            }
        }
    }

    function restart() {
        // A new seed, so the tanks start somewhere else.
        state = createGameState(level, { seed: state.randomState ^ state.step });
        scene = createScene();
        snapCamera = true;
    }

    /** Picks another living tank of the side to move: by position from left to right. */
    function selectTank(choose: (tanks: number[], current: number) => number | undefined) {
        const tanks = getLivingTanks(state, state.turn.side)
            .sort((first, second) => first.x - second.x)
            .map((tank) => tank.id);
        const tankId = choose(tanks, tanks.indexOf(state.turn.tankId ?? -1));

        if (tankId !== undefined) {
            applyCommand(state, { type: 'selectTank', tankId });
        }
    }

    function selectWeapon(step: number) {
        const tank = getActiveTank(state);

        if (!tank || state.phase !== 'aiming') {
            return;
        }
        const loadout = tankTypes[tank.typeId].weaponIds;
        const current = loadout.indexOf(tank.selectedWeaponId);
        const weaponId = loadout[(current + step + loadout.length) % loadout.length];

        if (weaponId) {
            applyCommand(state, { type: 'selectWeapon', weaponId });
        }
    }

    function onKeyDown(event: KeyboardEvent) {
        const key = inputKeys[event.code];

        if (key) {
            event.preventDefault();
            if (!input[key]) {
                input[key] = true;
                applyCommand(state, { type: 'input', input });
            }
        } else if (event.code === 'Space') {
            event.preventDefault();
            if (!event.repeat) {
                handle(applyCommand(state, { type: 'fire' }));
            }
        } else if (event.code === 'Tab') {
            event.preventDefault();
            const step = event.shiftKey ? -1 : 1;

            selectTank((tanks, current) => tanks[(current + step + tanks.length) % tanks.length]);
        } else if (/^Digit[1-5]$/.test(event.code)) {
            selectTank((tanks) => tanks[Number(event.code.slice(5)) - 1]);
        } else if (event.code === 'KeyQ') {
            event.preventDefault();
            if (!event.repeat) {
                selectWeapon(-1);
            }
        } else if (event.code === 'KeyE') {
            event.preventDefault();
            if (!event.repeat) {
                selectWeapon(1);
            }
        } else if (event.code === 'Enter' && state.phase === 'over') {
            restart();
        } else if (event.code === 'Escape') {
            options.onExit?.();
        }
    }

    function onKeyUp(event: KeyboardEvent) {
        const key = inputKeys[event.code];

        if (key && input[key]) {
            input[key] = false;
            applyCommand(state, { type: 'input', input });
        }
    }

    function onBlur() {
        Object.assign(input, noInput);
        applyCommand(state, { type: 'input', input });
    }

    function onWheel(event: WheelEvent) {
        event.preventDefault();
        const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;

        const centerX = camera.x + view.width / camera.zoom / 2;
        const centerY = camera.y + view.height / camera.zoom / 2;

        // Zoom around the middle of the view, where the camera keeps its target, so the view does not jump.
        camera.zoom = clampZoom(camera.zoom * Math.exp(-delta * 0.0015));
        camera.x = centerX - view.width / camera.zoom / 2;
        camera.y = centerY - view.height / camera.zoom / 2;
        zoomChosen = true;
    }

    /** Zoomed out, the level still fills the height of the view, so nothing but the level is ever shown below it. */
    function clampZoom(zoom: number): number {
        return Math.min(maxZoom, Math.max(minZoom, view.height / state.terrain.height, zoom));
    }

    /** The shot in the air, else the tank that is up, else the last explosion. */
    function getCameraTarget() {
        const [projectile] = state.projectiles;
        const tank = getActiveTank(state);

        if (projectile) {
            return projectile;
        }
        if (tank && state.phase === 'aiming') {
            return { x: tank.x, y: tank.y - 40 };
        }

        return focus;
    }

    function frame(time: number) {
        const seconds = Math.min(maxFrameTime, (time - lastTime) / 1000);

        lastTime = time;
        clock += seconds;
        accumulator += seconds;
        while (accumulator >= stepDuration) {
            handle(stepGame(state));
            accumulator -= stepDuration;
        }
        scene.effects.update(seconds);
        if (scene.banner) {
            scene.banner.age += seconds;
        }
        followTarget(camera, getCameraTarget(), view, state.terrain, seconds, snapCamera);
        snapCamera = false;
        const shake = scene.effects.getShake();
        const shaken = { ...camera, x: camera.x + shake.x, y: camera.y + shake.y };

        drawGame(context, state, scene, shaken, view, options, clock);
        animationFrame = requestAnimationFrame(frame);
    }

    const resizeObserver = new ResizeObserver(resize);

    resize();
    resizeObserver.observe(canvas);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    animationFrame = requestAnimationFrame(frame);

    return {
        dispose() {
            cancelAnimationFrame(animationFrame);
            resizeObserver.disconnect();
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
            canvas.removeEventListener('wheel', onWheel);
        }
    };
}

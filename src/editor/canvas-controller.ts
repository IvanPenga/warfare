import { getRectangleBetween, getSideAt, tileSize, type TilePosition } from '../level/level';
import { createLevelPainter, type Camera, type ViewSize } from '../rendering/level-renderer';
import type { EditorStore } from './editor-store';
import {
    drawFocus,
    drawGrid,
    drawHoverPreview,
    drawLevelBounds,
    drawRectanglePreview,
    drawSpawnZones,
    getRectanglePreviewColor
} from './overlay';
import { getTilesOnLine, paintFill, paintRectangle, paintCell, pickMaterial } from './paint';

const minZoom = 0.1;
const maxZoom = 6;
/** Keyboard panning speed in screen pixels per second. */
const panSpeed = 900;
const panKeys: Record<string, { x: number; y: number }> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    KeyA: { x: -1, y: 0 },
    KeyD: { x: 1, y: 0 },
    KeyW: { x: 0, y: -1 },
    KeyS: { x: 0, y: 1 }
};

type Drag =
    | { mode: 'pan'; startX: number; startY: number; cameraX: number; cameraY: number }
    | { mode: 'stroke'; erase: boolean; last: TilePosition }
    | { mode: 'rectangle'; zone: boolean; erase: boolean; start: TilePosition; end: TilePosition };

export function isTypingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.closest('input, select, textarea') !== null;
}

/**
 * Draws the level on the canvas every frame and turns mouse and keyboard input into store actions. The camera lives
 * here rather than in the store, because it changes every frame while panning.
 */
export function createCanvasController(canvas: HTMLCanvasElement, store: EditorStore) {
    const context = canvas.getContext('2d')!;
    const painter = createLevelPainter();
    const camera: Camera = { x: 0, y: 0, zoom: 1 };
    const view: ViewSize = { width: 0, height: 0 };
    const heldPanKeys = new Set<string>();
    let drag: Drag | null = null;
    let spaceHeld = false;
    let framedLevelId: string | null = null;
    let framedRequest = -1;
    let focusRequest = 0;
    let focusTime = 0;
    let lastTime = performance.now();
    let animationFrame = 0;

    function resize() {
        const ratio = window.devicePixelRatio || 1;
        const bounds = canvas.getBoundingClientRect();

        view.width = bounds.width;
        view.height = bounds.height;
        canvas.width = Math.round(bounds.width * ratio);
        canvas.height = Math.round(bounds.height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    /** Zooms so the whole level fits, with a margin of one cell, and centers it. */
    function frameLevel() {
        const { level } = store.getState();
        const width = (level.width + 2) * tileSize;
        const height = (level.height + 2) * tileSize;

        camera.zoom = Math.min(maxZoom, Math.max(minZoom, Math.min(view.width / width, view.height / height)));
        camera.x = (level.width * tileSize) / 2 - view.width / camera.zoom / 2;
        camera.y = (level.height * tileSize) / 2 - view.height / camera.zoom / 2;
        store.getState().setZoom(camera.zoom);
    }

    function getScreenPosition(event: MouseEvent) {
        const bounds = canvas.getBoundingClientRect();

        return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    }

    function getTileAt(event: MouseEvent): TilePosition {
        const screen = getScreenPosition(event);

        return {
            x: Math.floor((screen.x / camera.zoom + camera.x) / tileSize),
            y: Math.floor((screen.y / camera.zoom + camera.y) / tileSize)
        };
    }

    function onPointerDown(event: PointerEvent) {
        const state = store.getState();
        const position = getTileAt(event);

        canvas.setPointerCapture(event.pointerId);
        if (event.button === 1 || (event.button === 0 && spaceHeld)) {
            drag = { mode: 'pan', startX: event.clientX, startY: event.clientY, cameraX: camera.x, cameraY: camera.y };

            return;
        }
        if (event.button !== 0 && event.button !== 2) {
            return;
        }
        // The right button always erases, whatever the tool (the zone tool included).
        const erase = event.button === 2 || state.tool === 'erase';
        const { activeLayer, material } = state;

        if (state.tool === 'zone' && !erase) {
            drag = { mode: 'rectangle', zone: true, erase: false, start: position, end: position };

            return;
        }
        switch (state.tool) {
            case 'pick': {
                const picked = pickMaterial(state.level, activeLayer, position);

                if (picked !== null) {
                    state.selectMaterial(picked);
                }
                break;
            }
            case 'fill':
                state.editLevel((level) => paintFill(level, activeLayer, position, material, erase));
                break;
            case 'rectangle':
                drag = { mode: 'rectangle', zone: false, erase, start: position, end: position };
                break;
            case 'brush':
            case 'erase':
            case 'zone':
                state.beginStroke();
                state.editLevel((level) => paintCell(level, activeLayer, position, material, erase));
                drag = { mode: 'stroke', erase, last: position };
                break;
        }
    }

    function onPointerMove(event: PointerEvent) {
        const state = store.getState();
        const position = getTileAt(event);

        state.setHoverTile(position);
        if (drag?.mode === 'pan') {
            camera.x = drag.cameraX - (event.clientX - drag.startX) / camera.zoom;
            camera.y = drag.cameraY - (event.clientY - drag.startY) / camera.zoom;
        } else if (drag?.mode === 'stroke' && (position.x !== drag.last.x || position.y !== drag.last.y)) {
            const { erase, last } = drag;

            state.editLevel((level) => {
                for (const tile of getTilesOnLine(last, position)) {
                    paintCell(level, state.activeLayer, tile, state.material, erase);
                }
            });
            drag.last = position;
        } else if (drag?.mode === 'rectangle') {
            drag.end = position;
        }
    }

    function onPointerUp() {
        const state = store.getState();
        const finished = drag;

        drag = null;
        if (finished?.mode === 'stroke') {
            state.endStroke();
        } else if (finished?.mode === 'rectangle' && finished.zone) {
            state.setSpawnZone(
                getSideAt(state.level, finished.start.x),
                getRectangleBetween(finished.start, finished.end)
            );
        } else if (finished?.mode === 'rectangle') {
            state.editLevel((level) =>
                paintRectangle(level, state.activeLayer, finished.start, finished.end, state.material, finished.erase)
            );
        }
    }

    function onWheel(event: WheelEvent) {
        event.preventDefault();
        const screen = getScreenPosition(event);
        const worldX = screen.x / camera.zoom + camera.x;
        const worldY = screen.y / camera.zoom + camera.y;
        // Firefox reports lines instead of pixels for mouse wheels.
        const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;

        camera.zoom = Math.min(maxZoom, Math.max(minZoom, camera.zoom * Math.exp(-delta * 0.0015)));
        camera.x = worldX - screen.x / camera.zoom;
        camera.y = worldY - screen.y / camera.zoom;
        store.getState().setZoom(camera.zoom);
    }

    function onKeyDown(event: KeyboardEvent) {
        if (
            isTypingTarget(event.target) ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            store.getState().playtest
        ) {
            return;
        }
        if (event.code === 'Space') {
            // Also stops a focused sidebar button from being clicked.
            event.preventDefault();
            spaceHeld = true;
        } else if (panKeys[event.code]) {
            event.preventDefault();
            heldPanKeys.add(event.code);
        }
    }

    function onKeyUp(event: KeyboardEvent) {
        if (event.code === 'Space') {
            if (!isTypingTarget(event.target)) {
                event.preventDefault();
            }
            spaceHeld = false;
        }
        heldPanKeys.delete(event.code);
    }

    function onBlur() {
        heldPanKeys.clear();
        spaceHeld = false;
    }

    function render(time: number) {
        const state = store.getState();
        const { level } = state;

        painter.draw(context, level, camera, view, {
            showParallax: state.showParallax,
            time: time / 1000,
            fadedLayer: state.activeLayer === 'backWall' ? 'terrain' : null
        });
        drawLevelBounds(context, level, camera, view);
        if (state.showGrid) {
            drawGrid(context, level, camera, view);
        }
        if (state.showZones || state.tool === 'zone') {
            drawSpawnZones(context, level, camera);
        }
        if (state.focus) {
            drawFocus(context, state.focus.area, camera, (time - focusTime) / 1000);
        }
        if (drag?.mode === 'rectangle') {
            const side = getSideAt(level, drag.start.x);
            const tool = drag.zone ? 'zone' : 'rectangle';

            drawRectanglePreview(
                context,
                getRectangleBetween(drag.start, drag.end),
                camera,
                getRectanglePreviewColor(tool, drag.erase, side)
            );
        } else if (state.hoverTile && drag?.mode !== 'pan' && !spaceHeld) {
            drawHoverPreview(context, level, camera, state.hoverTile, state.tool, state.material);
        }
        canvas.style.cursor = drag?.mode === 'pan' ? 'grabbing' : spaceHeld ? 'grab' : 'crosshair';
    }

    function frame(time: number) {
        const state = store.getState();
        const seconds = Math.min(0.1, (time - lastTime) / 1000);

        lastTime = time;
        if (state.level.id !== framedLevelId || state.frameRequest !== framedRequest) {
            framedLevelId = state.level.id;
            framedRequest = state.frameRequest;
            frameLevel();
        }
        if (state.focus && state.focus.request !== focusRequest) {
            const { area } = state.focus;

            focusRequest = state.focus.request;
            focusTime = time;
            camera.x = (area.x + area.width / 2) * tileSize - view.width / camera.zoom / 2;
            camera.y = (area.y + area.height / 2) * tileSize - view.height / camera.zoom / 2;
        }
        if (state.playtest) {
            // The playtest view covers the canvas and has its own loop.
            animationFrame = requestAnimationFrame(frame);

            return;
        }
        for (const code of heldPanKeys) {
            camera.x += (panKeys[code].x * panSpeed * seconds) / camera.zoom;
            camera.y += (panKeys[code].y * panSpeed * seconds) / camera.zoom;
        }
        render(time);
        animationFrame = requestAnimationFrame(frame);
    }

    const resizeObserver = new ResizeObserver(resize);
    const preventContextMenu = (event: Event) => event.preventDefault();
    const clearHover = () => store.getState().setHoverTile(null);

    resize();
    resizeObserver.observe(canvas);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', clearHover);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', preventContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    animationFrame = requestAnimationFrame(frame);

    return {
        dispose() {
            cancelAnimationFrame(animationFrame);
            resizeObserver.disconnect();
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerUp);
            canvas.removeEventListener('pointerleave', clearHover);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('contextmenu', preventContextMenu);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        }
    };
}

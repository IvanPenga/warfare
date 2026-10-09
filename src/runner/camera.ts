import type { Camera, ViewSize } from '../rendering/level-renderer';

export const minZoom = 0.5;
export const maxZoom = 4;
/** How quickly the camera catches up with its target: higher is faster. */
const followRate = 5;

/** A zoom that shows about 560 world pixels of height, within limits. */
export function getDefaultZoom(view: ViewSize): number {
    return Math.min(3, Math.max(1, view.height / 560));
}

/**
 * Moves the camera towards a point in the world (smoothly, or at once with `snap`), keeping it inside the level. It may
 * show some sky above the level so high shots stay in view.
 */
export function followTarget(
    camera: Camera,
    target: { x: number; y: number },
    view: ViewSize,
    world: { width: number; height: number },
    seconds: number,
    snap: boolean
) {
    const viewWidth = view.width / camera.zoom;
    const viewHeight = view.height / camera.zoom;
    const clampAxis = (value: number, size: number, viewSize: number, above: number) =>
        size <= viewSize ? (size - viewSize) / 2 : Math.min(size - viewSize, Math.max(-above, value));
    const goalX = clampAxis(target.x - viewWidth / 2, world.width, viewWidth, 0);
    const goalY = clampAxis(target.y - viewHeight / 2, world.height, viewHeight, viewHeight / 2);
    const blend = snap ? 1 : 1 - Math.exp(-followRate * seconds);

    camera.x += (goalX - camera.x) * blend;
    camera.y += (goalY - camera.y) * blend;
}

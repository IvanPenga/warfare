import {
    fillRectangle,
    floodFill,
    getMaterial,
    isInBounds,
    setMaterial,
    type LayerName,
    type Level,
    type TilePosition
} from '../level/level';
import { materialIds } from '../level/materials';

/** `zone` drags a spawn zone: in the left half of the level for player 1, in the right half for player 2. */
export type EditorTool = 'brush' | 'erase' | 'rectangle' | 'fill' | 'pick' | 'zone';

// These functions change the level they get. Call them on an immer draft.

/** Paints one cell with the brush material, or erases it to air. */
export function paintCell(level: Level, layer: LayerName, position: TilePosition, material: number, erase: boolean) {
    if (isInBounds(level, position.x, position.y)) {
        setMaterial(level, layer, position.x, position.y, erase ? materialIds.air : material);
    }
}

export function paintRectangle(
    level: Level,
    layer: LayerName,
    from: TilePosition,
    to: TilePosition,
    material: number,
    erase: boolean
) {
    fillRectangle(level, layer, from, to, erase ? materialIds.air : material);
}

export function paintFill(level: Level, layer: LayerName, position: TilePosition, material: number, erase: boolean) {
    floodFill(level, layer, position.x, position.y, erase ? materialIds.air : material);
}

/** The material at a position on the layer, or null for air. */
export function pickMaterial(level: Level, layer: LayerName, position: TilePosition): number | null {
    const material = getMaterial(level, layer, position.x, position.y);

    return material === materialIds.air ? null : material;
}

/** The cells on a straight line between two cells (Bresenham), so fast brush strokes have no gaps. */
export function getTilesOnLine(from: TilePosition, to: TilePosition): TilePosition[] {
    const positions: TilePosition[] = [];
    const deltaX = Math.abs(to.x - from.x);
    const deltaY = -Math.abs(to.y - from.y);
    const stepX = from.x < to.x ? 1 : -1;
    const stepY = from.y < to.y ? 1 : -1;
    let error = deltaX + deltaY;
    let { x, y } = from;

    for (;;) {
        positions.push({ x, y });
        if (x === to.x && y === to.y) {
            break;
        }
        const doubled = 2 * error;

        if (doubled >= deltaY) {
            error += deltaY;
            x += stepX;
        }
        if (doubled <= deltaX) {
            error += deltaX;
            y += stepY;
        }
    }

    return positions;
}

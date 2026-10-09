import {
    getSideAt,
    isInBounds,
    sides,
    tileSize,
    type Level,
    type Side,
    type TilePosition,
    type TileRectangle
} from '../level/level';
import { getSpawnSpots, tankFootprint } from '../level/spawns';
import {
    drawMaterial,
    getVisibleTileRange,
    tileToScreenX,
    tileToScreenY,
    type Camera,
    type ViewSize
} from '../rendering/level-renderer';
import { sideColors } from '../rendering/colors';
import type { EditorTool } from './paint';

const eraseColor = '#ff5d5d';

/** Darkens everything outside the level and outlines its edge. */
export function drawLevelBounds(context: CanvasRenderingContext2D, level: Level, camera: Camera, view: ViewSize) {
    const left = tileToScreenX(0, camera);
    const top = tileToScreenY(0, camera);
    const width = tileToScreenX(level.width, camera) - left;
    const height = tileToScreenY(level.height, camera) - top;

    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.beginPath();
    context.rect(0, 0, view.width, view.height);
    context.rect(left, top, width, height);
    context.fill('evenodd');
    context.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    context.lineWidth = 1;
    context.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
}

export function drawGrid(context: CanvasRenderingContext2D, level: Level, camera: Camera, view: ViewSize) {
    if (camera.zoom * tileSize < 8) {
        return;
    }
    const range = getVisibleTileRange(level, camera, view);
    const top = tileToScreenY(range.top, camera);
    const bottom = tileToScreenY(range.bottom + 1, camera);
    const left = tileToScreenX(range.left, camera);
    const right = tileToScreenX(range.right + 1, camera);

    context.beginPath();
    for (let x = range.left; x <= range.right + 1; x++) {
        const screenX = tileToScreenX(x, camera) + 0.5;

        context.moveTo(screenX, top);
        context.lineTo(screenX, bottom);
    }
    for (let y = range.top; y <= range.bottom + 1; y++) {
        const screenY = tileToScreenY(y, camera) + 0.5;

        context.moveTo(left, screenY);
        context.lineTo(right, screenY);
    }
    context.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    context.lineWidth = 1;
    context.stroke();
}

function getScreenRectangle(area: TileRectangle, camera: Camera) {
    const left = tileToScreenX(area.x, camera);
    const top = tileToScreenY(area.y, camera);

    return {
        left,
        top,
        width: tileToScreenX(area.x + area.width, camera) - left,
        height: tileToScreenY(area.y + area.height, camera) - top
    };
}

function outlineArea(context: CanvasRenderingContext2D, area: TileRectangle, camera: Camera, color: string) {
    const { left, top, width, height } = getScreenRectangle(area, camera);

    context.strokeStyle = color;
    context.lineWidth = 2;
    context.strokeRect(left + 1, top + 1, width - 2, height - 2);
}

/** The rectangle being dragged with the rectangle or zone tool. */
export function drawRectanglePreview(
    context: CanvasRenderingContext2D,
    area: TileRectangle,
    camera: Camera,
    color: string
) {
    const { left, top, width, height } = getScreenRectangle(area, camera);

    context.globalAlpha = 0.22;
    context.fillStyle = color;
    context.fillRect(left, top, width, height);
    context.globalAlpha = 1;
    outlineArea(context, area, camera, color);
}

export function getRectanglePreviewColor(tool: EditorTool, erase: boolean, side: Side): string {
    if (tool === 'zone') {
        return sideColors[side];
    }

    return erase ? eraseColor : '#ffffff';
}

/** A see-through preview of the brush material on the hovered cell, and an outline around it. */
export function drawHoverPreview(
    context: CanvasRenderingContext2D,
    level: Level,
    camera: Camera,
    position: TilePosition,
    tool: EditorTool,
    material: number
) {
    if (!isInBounds(level, position.x, position.y)) {
        return;
    }
    if (tool === 'brush' || tool === 'rectangle' || tool === 'fill') {
        context.globalAlpha = 0.55;
        drawMaterial(context, material, position.x, position.y, camera);
        context.globalAlpha = 1;
    }
    const color =
        tool === 'erase' ? eraseColor : tool === 'zone' ? sideColors[getSideAt(level, position.x)] : '#ffffff';

    outlineArea(context, { ...position, width: 1, height: 1 }, camera, color);
}

/** Both spawn zones, with a small marker on every spot where a tank could start. */
export function drawSpawnZones(context: CanvasRenderingContext2D, level: Level, camera: Camera) {
    for (const side of sides) {
        const zone = level.spawnZones[side];
        const { left, top, width, height } = getScreenRectangle(zone, camera);

        context.globalAlpha = 0.1;
        context.fillStyle = sideColors[side];
        context.fillRect(left, top, width, height);
        context.globalAlpha = 0.9;
        context.setLineDash([6, 4]);
        outlineArea(context, zone, camera, sideColors[side]);
        context.setLineDash([]);
        context.fillStyle = sideColors[side];
        for (const spot of getSpawnSpots(level, side)) {
            const spotLeft = tileToScreenX(spot.x, camera);
            const spotBottom = tileToScreenY(spot.y + 1, camera);
            const spotWidth = tileToScreenX(spot.x + tankFootprint.width, camera) - spotLeft;

            context.fillRect(spotLeft + 2, spotBottom - 3, Math.max(1, spotWidth - 4), 2);
        }
        context.globalAlpha = 1;
        context.font = '600 12px system-ui, sans-serif';
        context.fillText(side === 'left' ? 'Player 1' : 'Player 2', left + 6, top + 16);
    }
}

/** A pulsing outline around the area a problem is about. `age` is the time since it was asked for, in seconds. */
export function drawFocus(context: CanvasRenderingContext2D, area: TileRectangle, camera: Camera, age: number) {
    context.globalAlpha = Math.max(0, 1 - age / 2) * (0.6 + 0.4 * Math.abs(Math.sin(age * 6)));
    outlineArea(
        context,
        { x: area.x - 1, y: area.y - 1, width: area.width + 2, height: area.height + 2 },
        camera,
        '#ffd54a'
    );
    context.globalAlpha = 1;
}

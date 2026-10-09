import { tileSize, type Level } from '../level/level.ts';
import { materialIds } from '../level/materials.ts';

/**
 * The terrain the game plays on: one material id per world pixel, row by row. Built from the level's terrain layer at
 * match start; explosions then carve it.
 */
export type TerrainMask = { width: number; height: number; cells: Uint8Array };

/** A rectangle in world pixels. */
export type PixelRectangle = { x: number; y: number; width: number; height: number };

/** Rock is harder than dirt: an explosion removes rock only within this share of its radius. */
export const rockCraterFactor = 0.6;

/**
 * Builds the mask from the level's terrain layer. The level's cells are treated as samples at their centres and the
 * mask is where the smoothly interpolated solidity is at least one half, so the steps of the editing grid become slopes:
 * a step of one cell gives a 45° slope, two cells about 63°. Flat ground and walls stay exactly on the cell edges. A
 * solid pixel takes the material of its own cell, or of the most nearby solid cell where a slope reaches into air.
 */
export function createTerrainMask(level: Level): TerrainMask {
    const width = level.width * tileSize;
    const height = level.height * tileSize;
    const cells = new Uint8Array(width * height);
    const rows = level.layers.terrain;
    const cellAt = (column: number, row: number) =>
        rows[Math.min(level.height - 1, Math.max(0, row))][Math.min(level.width - 1, Math.max(0, column))];

    for (let y = 0; y < height; y++) {
        const sampleY = (y + 0.5) / tileSize - 0.5;
        const row = Math.floor(sampleY);
        const fractionY = sampleY - row;

        for (let x = 0; x < width; x++) {
            const sampleX = (x + 0.5) / tileSize - 0.5;
            const column = Math.floor(sampleX);
            const topLeft = cellAt(column, row);
            const topRight = cellAt(column + 1, row);
            const bottomLeft = cellAt(column, row + 1);
            const bottomRight = cellAt(column + 1, row + 1);

            // Inside an area of one material there is nothing to smooth.
            if (topLeft === topRight && topLeft === bottomLeft && topLeft === bottomRight) {
                cells[y * width + x] = topLeft;
                continue;
            }
            const fractionX = sampleX - column;
            const corners = [
                [topLeft, (1 - fractionX) * (1 - fractionY)],
                [topRight, fractionX * (1 - fractionY)],
                [bottomLeft, (1 - fractionX) * fractionY],
                [bottomRight, fractionX * fractionY]
            ];
            let solidity = 0;
            let nearestMaterial: number = materialIds.air;
            let nearestWeight = -1;

            for (const [material, weight] of corners) {
                if (material !== materialIds.air) {
                    solidity += weight;
                    if (weight > nearestWeight) {
                        nearestMaterial = material;
                        nearestWeight = weight;
                    }
                }
            }
            if (solidity >= 0.5) {
                const own = rows[Math.floor(y / tileSize)][Math.floor(x / tileSize)];

                cells[y * width + x] = own !== materialIds.air ? own : nearestMaterial;
            }
        }
    }

    return { width, height, cells };
}

/**
 * The material at a pixel. Left, right and below the level is bedrock, so nothing leaves it; above the level is air,
 * so shots can fly high and come back down.
 */
export function getMaterialAt(mask: TerrainMask, x: number, y: number): number {
    const column = Math.floor(x);
    const row = Math.floor(y);

    if (column < 0 || column >= mask.width || row >= mask.height) {
        return materialIds.bedrock;
    }
    if (row < 0) {
        return materialIds.air;
    }

    return mask.cells[row * mask.width + column];
}

export function isSolidAt(mask: TerrainMask, x: number, y: number): boolean {
    return getMaterialAt(mask, x, y) !== materialIds.air;
}

/** Whether any pixel of the rectangle (in whole pixels) is solid. */
export function isAreaSolid(mask: TerrainMask, left: number, top: number, width: number, height: number): boolean {
    for (let y = top; y < top + height; y++) {
        for (let x = left; x < left + width; x++) {
            if (isSolidAt(mask, x, y)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Removes dirt within `radius` of the centre and rock within `radius * rockCraterFactor`. Bedrock stays. Changes the
 * mask it gets and returns the area of pixels that may have changed, clipped to the mask (null if outside).
 */
export function carveCrater(
    mask: TerrainMask,
    centerX: number,
    centerY: number,
    radius: number
): PixelRectangle | null {
    const left = Math.max(0, Math.floor(centerX - radius));
    const right = Math.min(mask.width - 1, Math.ceil(centerX + radius));
    const top = Math.max(0, Math.floor(centerY - radius));
    const bottom = Math.min(mask.height - 1, Math.ceil(centerY + radius));

    if (left > right || top > bottom) {
        return null;
    }
    const dirtRadiusSquared = radius * radius;
    const rockRadiusSquared = dirtRadiusSquared * rockCraterFactor * rockCraterFactor;

    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            const index = y * mask.width + x;
            const material = mask.cells[index];
            const deltaX = x + 0.5 - centerX;
            const deltaY = y + 0.5 - centerY;
            const distanceSquared = deltaX * deltaX + deltaY * deltaY;

            if (
                (material === materialIds.dirt && distanceSquared <= dirtRadiusSquared) ||
                (material === materialIds.rock && distanceSquared <= rockRadiusSquared)
            ) {
                mask.cells[index] = materialIds.air;
            }
        }
    }

    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Removes a straight tunnel segment through dirt and rock. Bedrock stays. */
export function carveLine(
    mask: TerrainMask,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    radius: number
): PixelRectangle | null {
    const left = Math.max(0, Math.floor(Math.min(startX, endX) - radius));
    const right = Math.min(mask.width - 1, Math.ceil(Math.max(startX, endX) + radius));
    const top = Math.max(0, Math.floor(Math.min(startY, endY) - radius));
    const bottom = Math.min(mask.height - 1, Math.ceil(Math.max(startY, endY) + radius));

    if (left > right || top > bottom) {
        return null;
    }
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY || 1;
    const dirtRadiusSquared = radius * radius;
    const rockRadiusSquared = dirtRadiusSquared * rockCraterFactor * rockCraterFactor;

    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            const along = Math.min(
                1,
                Math.max(0, ((x + 0.5 - startX) * deltaX + (y + 0.5 - startY) * deltaY) / lengthSquared)
            );
            const nearestX = startX + deltaX * along;
            const nearestY = startY + deltaY * along;
            const distanceX = x + 0.5 - nearestX;
            const distanceY = y + 0.5 - nearestY;
            const distanceSquared = distanceX * distanceX + distanceY * distanceY;
            const index = y * mask.width + x;
            const material = mask.cells[index];

            if (
                (material === materialIds.dirt && distanceSquared <= dirtRadiusSquared) ||
                (material === materialIds.rock && distanceSquared <= rockRadiusSquared)
            ) {
                mask.cells[index] = materialIds.air;
            }
        }
    }

    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

import { z } from 'zod';
import { backgroundPresetNames } from './background.ts';
import { materialIds, maxMaterialId } from './materials.ts';

/**
 * Size of one editing cell in world pixels. Levels are painted on this grid; the game turns them into a terrain mask of
 * one value per world pixel. Textures have the same resolution, so one texture pixel is one world pixel.
 */
export const tileSize = 16;

export const minLevelWidth = 40;
export const minLevelHeight = 20;
export const maxLevelWidth = 600;
export const maxLevelHeight = 200;

export const layerNames = ['backWall', 'terrain'] as const;

/**
 * `terrain` is what tanks drive on and shots destroy. `backWall` is decoration behind it, drawn darker; it shows through
 * caves and craters and never collides. Both hold material ids.
 */
export type LayerName = (typeof layerNames)[number];

/** Player 1 starts on the left, player 2 on the right. */
export const sides = ['left', 'right'] as const;

export type Side = (typeof sides)[number];

export type TilePosition = { x: number; y: number };

/** A rectangle of tiles: `x` and `y` are its top-left tile. */
export type TileRectangle = { x: number; y: number; width: number; height: number };

const materialRowSchema = z.array(z.number().int().min(0).max(maxMaterialId));

const tileRectangleSchema = z.object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    width: z.number().int().min(1),
    height: z.number().int().min(1)
});

export const levelSchema = z
    .object({
        id: z.string().regex(/^[\w-]+$/, 'Use letters, digits, "-" and "_" in the id'),
        name: z.string(),
        width: z.number().int().min(minLevelWidth).max(maxLevelWidth),
        height: z.number().int().min(minLevelHeight).max(maxLevelHeight),
        background: z.object({ preset: z.enum(backgroundPresetNames), seed: z.number().int() }),
        layers: z.object({ backWall: z.array(materialRowSchema), terrain: z.array(materialRowSchema) }),
        /** Where each side's tanks are placed at random when a match starts. */
        spawnZones: z.object({ left: tileRectangleSchema, right: tileRectangleSchema })
    })
    .superRefine((level, context) => {
        for (const layer of layerNames) {
            const rows = level.layers[layer];

            if (rows.length !== level.height || rows.some((row) => row.length !== level.width)) {
                context.addIssue({
                    code: 'custom',
                    path: ['layers', layer],
                    message: `Layer "${layer}" must have ${level.height} rows of ${level.width} cells`
                });
            }
        }
        for (const side of sides) {
            const zone = level.spawnZones[side];

            if (zone.x + zone.width > level.width || zone.y + zone.height > level.height) {
                context.addIssue({
                    code: 'custom',
                    path: ['spawnZones', side],
                    message: `The ${side} spawn zone is outside the level`
                });
            }
        }
    });

export type Level = z.infer<typeof levelSchema>;

/** Returns the level, or throws a readable error when the data is not a valid level. */
export function parseLevel(data: unknown): Level {
    const result = levelSchema.safeParse(data);

    if (!result.success) {
        throw new Error(z.prettifyError(result.error));
    }

    return result.data;
}

function createRows(width: number, height: number): number[][] {
    return Array.from({ length: height }, () => new Array<number>(width).fill(materialIds.air));
}

/** The spawn zone a level of this size starts with: the outer fifth of the level on that side, above the floor. */
export function getDefaultSpawnZone(level: Pick<Level, 'width' | 'height'>, side: Side): TileRectangle {
    const width = Math.max(1, Math.floor(level.width / 5));

    return { x: side === 'left' ? 1 : level.width - 1 - width, y: 0, width, height: level.height - 1 };
}

/** Sets the bottom row and the left and right columns of the terrain to bedrock, so nothing can leave the level. */
export function addBedrockBorder(level: Level) {
    const rows = level.layers.terrain;

    for (let y = 0; y < level.height; y++) {
        rows[y][0] = materialIds.bedrock;
        rows[y][level.width - 1] = materialIds.bedrock;
    }
    rows[level.height - 1].fill(materialIds.bedrock);
}

/** A new level: flat dirt ground a quarter of the way up, a bedrock border and the default spawn zones. */
export function createLevel(id: string, name: string, width = 160, height = 60): Level {
    const terrain = createRows(width, height);
    const backWall = createRows(width, height);
    const surface = height - Math.floor(height / 4);

    for (let y = surface; y < height; y++) {
        terrain[y].fill(materialIds.dirt);
        if (y > surface) {
            backWall[y].fill(materialIds.dirt);
        }
    }
    const level: Level = {
        id,
        name,
        width,
        height,
        background: { preset: 'day', seed: 1 },
        layers: { backWall, terrain },
        spawnZones: { left: { x: 0, y: 0, width: 1, height: 1 }, right: { x: 0, y: 0, width: 1, height: 1 } }
    };

    addBedrockBorder(level);
    level.spawnZones = { left: getDefaultSpawnZone(level, 'left'), right: getDefaultSpawnZone(level, 'right') };

    return level;
}

/** The first `level-<n>` id that is not taken. */
export function getNextLevelId(takenIds: Iterable<string>): string {
    const taken = new Set(takenIds);
    let number = 1;

    while (taken.has(`level-${number}`)) {
        number++;
    }

    return `level-${number}`;
}

export function isInBounds(level: Pick<Level, 'width' | 'height'>, x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < level.width && y < level.height;
}

/** The material at a cell, or air outside the level. */
export function getMaterial(level: Level, layer: LayerName, x: number, y: number): number {
    return isInBounds(level, x, y) ? level.layers[layer][y][x] : materialIds.air;
}

/** The rectangle between two corner tiles (inclusive, in any order). */
export function getRectangleBetween(from: TilePosition, to: TilePosition): TileRectangle {
    const x = Math.min(from.x, to.x);
    const y = Math.min(from.y, to.y);

    return { x, y, width: Math.abs(to.x - from.x) + 1, height: Math.abs(to.y - from.y) + 1 };
}

/** The part of a rectangle inside the level, or null if none of it is. */
export function clipRectangle(level: Pick<Level, 'width' | 'height'>, rectangle: TileRectangle): TileRectangle | null {
    const left = Math.max(0, rectangle.x);
    const top = Math.max(0, rectangle.y);
    const right = Math.min(level.width, rectangle.x + rectangle.width);
    const bottom = Math.min(level.height, rectangle.y + rectangle.height);

    return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/** Which side of the level a tile is on. The middle column of an odd width counts as left. */
export function getSideAt(level: Pick<Level, 'width'>, x: number): Side {
    return x < level.width / 2 ? 'left' : 'right';
}

// The functions below change the level they get. Call them on an immer draft.

export function setMaterial(level: Level, layer: LayerName, x: number, y: number, material: number) {
    if (isInBounds(level, x, y)) {
        level.layers[layer][y][x] = material;
    }
}

/** Fills the rectangle between two corners (inclusive, in any order), clipped to the level. */
export function fillRectangle(level: Level, layer: LayerName, from: TilePosition, to: TilePosition, material: number) {
    for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y++) {
        for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) {
            setMaterial(level, layer, x, y, material);
        }
    }
}

/** Replaces the connected area of equal cells around a position (4 directions). */
export function floodFill(level: Level, layer: LayerName, x: number, y: number, material: number) {
    if (!isInBounds(level, x, y)) {
        return;
    }
    const rows = level.layers[layer];
    const target = rows[y][x];

    if (target === material) {
        return;
    }
    const stack: TilePosition[] = [{ x, y }];

    while (stack.length > 0) {
        const position = stack.pop()!;

        if (!isInBounds(level, position.x, position.y) || rows[position.y][position.x] !== target) {
            continue;
        }
        rows[position.y][position.x] = material;
        stack.push(
            { x: position.x + 1, y: position.y },
            { x: position.x - 1, y: position.y },
            { x: position.x, y: position.y + 1 },
            { x: position.x, y: position.y - 1 }
        );
    }
}

/** Sets a side's spawn zone, clipped to the level. Does nothing if the rectangle is outside the level. */
export function setSpawnZone(level: Level, side: Side, rectangle: TileRectangle) {
    const zone = clipRectangle(level, rectangle);
    const current = level.spawnZones[side];

    if (
        zone &&
        (zone.x !== current.x || zone.y !== current.y || zone.width !== current.width || zone.height !== current.height)
    ) {
        level.spawnZones[side] = zone;
    }
}

/**
 * A copy of the level with a new size. The bottom-left corner stays in place, so the floor stays the floor: rows are
 * added or removed at the top and columns on the right. Spawn zones move with the tiles and are clipped; a zone that
 * ends up outside the level is reset to the default. The bedrock border is not rebuilt (lint reports it).
 */
export function resizeLevel(level: Level, width: number, height: number): Level {
    const shift = height - level.height;
    const size = { width, height };
    const resizeLayer = (rows: number[][]) =>
        Array.from({ length: height }, (_, y) => {
            const source = rows[y - shift] ?? [];

            return Array.from({ length: width }, (_, x) => source[x] ?? materialIds.air);
        });
    const resizeZone = (side: Side) => {
        const zone = level.spawnZones[side];

        return clipRectangle(size, { ...zone, y: zone.y + shift }) ?? getDefaultSpawnZone(size, side);
    };

    return {
        ...level,
        width,
        height,
        layers: { backWall: resizeLayer(level.layers.backWall), terrain: resizeLayer(level.layers.terrain) },
        spawnZones: { left: resizeZone('left'), right: resizeZone('right') }
    };
}

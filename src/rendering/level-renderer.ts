import { layerNames, tileSize, type LayerName, type Level } from '../level/level';
import { getHorizonY } from '../level/background';
import { drawParallax } from './parallax';
import { materialIds } from '../level/materials';
import { getMaterialTexture, getTextureVariant } from './material-textures';

/** `x` and `y` are the world position (in world pixels) of the top-left corner of the view. */
export type Camera = { x: number; y: number; zoom: number };

export type ViewSize = { width: number; height: number };

export type TileRange = { left: number; top: number; right: number; bottom: number };

/** The tiles at least partly inside the view, clipped to the level (inclusive). */
export function getVisibleTileRange(level: Level, camera: Camera, view: ViewSize): TileRange {
    return {
        left: Math.max(0, Math.floor(camera.x / tileSize)),
        top: Math.max(0, Math.floor(camera.y / tileSize)),
        right: Math.min(level.width - 1, Math.floor((camera.x + view.width / camera.zoom) / tileSize)),
        bottom: Math.min(level.height - 1, Math.floor((camera.y + view.height / camera.zoom) / tileSize))
    };
}

/** Screen position of a tile edge. Rounded, so neighbouring tiles share edges and never show seams. */
export function tileToScreenX(x: number, camera: Camera): number {
    return Math.round((x * tileSize - camera.x) * camera.zoom);
}

export function tileToScreenY(y: number, camera: Camera): number {
    return Math.round((y * tileSize - camera.y) * camera.zoom);
}

/** Draws one cell of a material, e.g. the brush preview. */
export function drawMaterial(
    context: CanvasRenderingContext2D,
    material: number,
    x: number,
    y: number,
    camera: Camera,
    dimmed = false
) {
    const texture = getMaterialTexture(material, getTextureVariant(x, y), { dimmed });

    if (!texture) {
        return;
    }
    const left = tileToScreenX(x, camera);
    const top = tileToScreenY(y, camera);

    context.imageSmoothingEnabled = false;
    context.drawImage(texture, left, top, tileToScreenX(x + 1, camera) - left, tileToScreenY(y + 1, camera) - top);
}

/**
 * A layer drawn once into a canvas of the level's size in world pixels. Only rows whose array changed since the last
 * update are drawn again (and the row below, whose grass depends on them): immer keeps unchanged rows, so a brush
 * stroke redraws a few rows, not the level.
 */
type LayerImage = { canvas: HTMLCanvasElement; rows: number[][] | null };

function updateLayerImage(image: LayerImage, rows: number[][], width: number, dimmed: boolean) {
    const height = rows.length;
    const { canvas } = image;

    if (canvas.width !== width * tileSize || canvas.height !== height * tileSize) {
        canvas.width = width * tileSize;
        canvas.height = height * tileSize;
        image.rows = null;
    }
    if (image.rows === rows) {
        return;
    }
    const context = canvas.getContext('2d')!;
    const changed = rows.map((row, y) => image.rows?.[y] !== row);

    for (let y = 0; y < height; y++) {
        if (!changed[y] && !(y > 0 && changed[y - 1])) {
            continue;
        }
        context.clearRect(0, y * tileSize, canvas.width, tileSize);
        for (let x = 0; x < width; x++) {
            // Dirt gets grass where air is above it. The back wall never grows grass.
            const grass = !dimmed && y > 0 && rows[y - 1][x] === materialIds.air;
            const texture = getMaterialTexture(rows[y][x], getTextureVariant(x, y), { dimmed, grass });

            if (texture) {
                context.drawImage(texture, x * tileSize, y * tileSize);
            }
        }
    }
    image.rows = rows;
}

export type DrawLevelOptions = {
    showParallax: boolean;
    /** Seconds since the view started; animates the background (clouds, birds, weather). */
    time?: number;
    /** A layer drawn see-through, e.g. the terrain while the editor works on the back wall. */
    fadedLayer?: LayerName | null;
    /** The layers to draw; both by default. The game draws only the back wall and the terrain mask over it. */
    layers?: readonly LayerName[];
};

export type LevelPainter = {
    /** Draws the background and the layers over the whole view. */
    draw: (
        context: CanvasRenderingContext2D,
        level: Level,
        camera: Camera,
        view: ViewSize,
        options: DrawLevelOptions
    ) => void;
};

/** A level renderer with its own layer images. Each canvas that shows a level should have its own painter. */
export function createLevelPainter(): LevelPainter {
    const images: Record<LayerName, LayerImage> = {
        backWall: { canvas: document.createElement('canvas'), rows: null },
        terrain: { canvas: document.createElement('canvas'), rows: null }
    };

    let horizon = { terrain: null as number[][] | null, y: 0 };

    return {
        draw(context, level, camera, view, options) {
            if (options.showParallax) {
                if (horizon.terrain !== level.layers.terrain) {
                    horizon = { terrain: level.layers.terrain, y: getHorizonY(level.layers.terrain, tileSize) };
                }
                drawParallax(context, level.background, {
                    width: view.width,
                    height: view.height,
                    // The world x of the view's centre: zooming does not change it, so the background stays put.
                    scrollX: camera.x + view.width / camera.zoom / 2,
                    horizonY: (horizon.y - camera.y) * camera.zoom,
                    time: options.time ?? 0
                });
            } else {
                context.fillStyle = '#2a2a33';
                context.fillRect(0, 0, view.width, view.height);
            }
            // Pixel art stays crisp when zoomed in; zoomed out, smoothing avoids shimmering.
            context.imageSmoothingEnabled = camera.zoom < 1;
            for (const layer of options.layers ?? layerNames) {
                const image = images[layer];

                updateLayerImage(image, level.layers[layer], level.width, layer === 'backWall');
                context.globalAlpha = options.fadedLayer === layer ? 0.3 : 1;
                context.drawImage(
                    image.canvas,
                    Math.round(-camera.x * camera.zoom),
                    Math.round(-camera.y * camera.zoom),
                    Math.round(image.canvas.width * camera.zoom),
                    Math.round(image.canvas.height * camera.zoom)
                );
            }
            context.globalAlpha = 1;
        }
    };
}

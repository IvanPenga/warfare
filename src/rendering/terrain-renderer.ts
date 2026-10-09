import { tileSize } from '../level/level';
import { materialIds } from '../level/materials';
import type { PixelRectangle, TerrainMask } from '../terrain/terrain-mask';
import { getMaterialTexture, getTextureVariant, textureResolution } from './material-textures';

/** Dirt this many pixels or fewer below air is drawn with the top rows of the grass texture. */
const grassDepth = 6;

const pixelCache = new Map<string, Uint8ClampedArray>();

/** The RGBA pixels of a material texture, read once from its canvas. */
function getTexturePixels(material: number, variant: number, grass: boolean): Uint8ClampedArray | null {
    const key = `${material}:${variant}:${grass}`;
    const cached = pixelCache.get(key);

    if (cached) {
        return cached;
    }
    const texture = getMaterialTexture(material, variant, { grass });

    if (!texture) {
        return null;
    }
    const pixels = texture.getContext('2d')!.getImageData(0, 0, textureResolution, textureResolution).data;

    pixelCache.set(key, pixels);

    return pixels;
}

export type TerrainImage = {
    /** The terrain in world pixels, one canvas pixel per world pixel. */
    canvas: HTMLCanvasElement;
    /** Draws an area again after the mask changed there, e.g. a crater. */
    redraw: (area: PixelRectangle) => void;
};

/**
 * Draws the terrain mask with the material textures. Each pixel takes its colour from the texture of its material at
 * the same position in its 16 × 16 cell, so uncut terrain looks exactly like the editor. Dirt right under air gets
 * grass, following the real surface, so crater edges grow grass too.
 */
export function createTerrainImage(mask: TerrainMask): TerrainImage {
    const canvas = document.createElement('canvas');

    canvas.width = mask.width;
    canvas.height = mask.height;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(mask.width, mask.height);
    const { cells, width } = mask;

    function paint(area: PixelRectangle) {
        const left = Math.max(0, area.x);
        const top = Math.max(0, area.y);
        const right = Math.min(mask.width, area.x + area.width);
        // Grass below the area depends on the air in it.
        const bottom = Math.min(mask.height, area.y + area.height + grassDepth);

        for (let y = top; y < bottom; y++) {
            for (let x = left; x < right; x++) {
                const material = cells[y * width + x];
                const index = (y * width + x) * 4;

                if (material === materialIds.air) {
                    image.data[index + 3] = 0;
                    continue;
                }
                const variant = getTextureVariant(Math.floor(x / tileSize), Math.floor(y / tileSize));
                let textureRow = y % tileSize;
                let grass = false;

                if (material === materialIds.dirt) {
                    for (let depth = 1; depth <= grassDepth && y - depth >= 0; depth++) {
                        if (cells[(y - depth) * width + x] === materialIds.air) {
                            grass = true;
                            textureRow = depth - 1;
                            break;
                        }
                    }
                    // The top row of the level has nothing above it: treat it as open sky.
                    if (!grass && y < grassDepth) {
                        grass = true;
                        textureRow = y;
                    }
                }
                const pixels = getTexturePixels(material, variant, grass);

                if (!pixels) {
                    continue;
                }
                const source = (textureRow * textureResolution + (x % tileSize)) * 4;

                image.data[index] = pixels[source];
                image.data[index + 1] = pixels[source + 1];
                image.data[index + 2] = pixels[source + 2];
                image.data[index + 3] = 255;
            }
        }
        if (right > left && bottom > top) {
            context.putImageData(image, 0, 0, left, top, right - left, bottom - top);
        }
    }

    paint({ x: 0, y: 0, width: mask.width, height: mask.height });

    return { canvas, redraw: paint };
}

import { tileSize } from '../level/level';
import { hash2d } from '../level/noise';
import { materialIds } from '../level/materials';

/** Each level cell is drawn with generated pixel art, one texture pixel per world pixel. */
export const textureResolution = tileSize;

/** Each material has a few random variants so large areas do not look repetitive. */
export const textureVariantCount = 4;

type Color = readonly [number, number, number];

/** A deterministic random value in [0, 1) for a pixel. `salt` gives independent values for different details. */
type Noise = (x: number, y: number, salt?: number) => number;

/** The color of one texture pixel, or null for transparent. */
type PixelFunction = (x: number, y: number, noise: Noise) => Color | null;

function hex(value: string): Color {
    const number = parseInt(value.slice(1), 16);

    return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function shade(color: Color, factor: number): Color {
    return [color[0] * factor, color[1] * factor, color[2] * factor];
}

const palette = {
    grass: hex('#5fae4b'),
    grassLight: hex('#8fd46a'),
    grassDark: hex('#3c7f3a'),
    dirt: hex('#8a5a3b'),
    dirtLight: hex('#a8744e'),
    dirtDark: hex('#6a4029'),
    pebble: hex('#9b8f84'),
    rock: hex('#7d8089'),
    rockLight: hex('#a3a6ae'),
    rockDark: hex('#555861'),
    bedrock: hex('#2c2a33'),
    bedrockLight: hex('#46434f'),
    bedrockDark: hex('#1b1a20')
};

/** The back wall is tinted darker and bluer so it reads as being behind the terrain. */
const backLayerTint: Color = [0.42, 0.44, 0.55];

const dirt: PixelFunction = (x, y, noise) => {
    const speckle = noise(x, y);

    if (speckle > 0.93) {
        return palette.dirtDark;
    }
    if (speckle < 0.04) {
        return palette.dirtLight;
    }
    if (noise(x >> 2, y >> 2, 7) > 0.9 && noise(x, y, 8) > 0.4) {
        return palette.pebble;
    }

    return shade(palette.dirt, 0.92 + 0.16 * noise(x >> 1, y >> 1, 1));
};

const grass: PixelFunction = (x, y, noise) => {
    const edge = noise(x, 0, 2) > 0.55 ? 5 : 4;

    if (y < edge - 1) {
        return (y === 0 && noise(x, 0, 5) > 0.35) || noise(x, y, 3) > 0.85 ? palette.grassLight : palette.grass;
    }
    if (y === edge - 1 || (y === edge && noise(x, 0, 4) > 0.6)) {
        return palette.grassDark;
    }

    return dirt(x, y, noise);
};

/** Rock is blotchy with a few dark cracks, and has no cell edges, so a rock area reads as one mass. */
const rock: PixelFunction = (x, y, noise) => {
    const crack = noise(x >> 2, y >> 2, 9) > 0.8 && (x + y + Math.floor(noise(x >> 2, y >> 2, 10) * 4)) % 5 === 0;

    if (crack) {
        return palette.rockDark;
    }
    const tone = noise(x >> 1, y >> 1, 6);

    if (tone > 0.85) {
        return palette.rockLight;
    }

    return shade(palette.rock, 0.88 + 0.2 * noise(x >> 2, y >> 2, 11));
};

/** Bedrock has diagonal stripes, so the indestructible border stands out. */
const bedrock: PixelFunction = (x, y, noise) => {
    if ((x + y) % 8 < 2) {
        return palette.bedrockLight;
    }
    if (noise(x, y, 12) > 0.9) {
        return palette.bedrockDark;
    }

    return shade(palette.bedrock, 0.9 + 0.2 * noise(x >> 1, y >> 1, 13));
};

const pixelFunctions: Record<number, PixelFunction> = {
    [materialIds.dirt]: dirt,
    [materialIds.rock]: rock,
    [materialIds.bedrock]: bedrock
};

export type TextureOptions = {
    /** Back-wall look: darker and bluer. */
    dimmed?: boolean;
    /** Grass on top, for dirt with air above it. Ignored for other materials. */
    grass?: boolean;
};

const textureCache = new Map<string, HTMLCanvasElement>();

/** The generated texture for a material variant (cached), or null for air and unknown ids. */
export function getMaterialTexture(
    material: number,
    variant: number,
    { dimmed = false, grass: grassy = false }: TextureOptions = {}
): HTMLCanvasElement | null {
    const withGrass = grassy && material === materialIds.dirt;
    const key = `${material}:${variant}:${dimmed}:${withGrass}`;
    const cached = textureCache.get(key);

    if (cached) {
        return cached;
    }
    const pixel = withGrass ? grass : pixelFunctions[material];

    if (!pixel) {
        return null;
    }
    const canvas = document.createElement('canvas');

    canvas.width = textureResolution;
    canvas.height = textureResolution;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(textureResolution, textureResolution);
    const seed = material * 1009 + variant * 97;
    const noise: Noise = (x, y, salt = 0) => hash2d(x, y, seed + salt * 7919);
    const tint = dimmed ? backLayerTint : ([1, 1, 1] as const);

    for (let y = 0; y < textureResolution; y++) {
        for (let x = 0; x < textureResolution; x++) {
            const color = pixel(x, y, noise);

            if (color) {
                const index = (y * textureResolution + x) * 4;

                image.data[index] = color[0] * tint[0];
                image.data[index + 1] = color[1] * tint[1];
                image.data[index + 2] = color[2] * tint[2];
                image.data[index + 3] = 255;
            }
        }
    }
    context.putImageData(image, 0, 0);
    textureCache.set(key, canvas);

    return canvas;
}

/** Which variant to draw at a cell. Stable, so a level always looks the same. */
export function getTextureVariant(x: number, y: number): number {
    return Math.floor(hash2d(x, y, 4242) * textureVariantCount);
}

import { mixColors } from './colors';

/** A small pixel-art image. Coordinates are relative to an origin: x = 0 is column `originX`, y = -1 the bottom row. */
export type SpriteGrid = {
    width: number;
    height: number;
    /** The column of x = 0. */
    originX: number;
    /** Row-major colors; `null` is transparent. */
    pixels: (string | null)[];
};

export const outlineColor = '#14161b';

/** Colors shared by every sprite. */
export const metal = {
    tread: '#2b2e35',
    treadLight: '#50555f',
    wheel: '#6b717d',
    hub: '#b0b5bf',
    steel: '#8b919c',
    steelDark: '#555b66',
    steelLight: '#c8cdd5',
    glass: '#bfe3ff',
    lamp: '#ffe08a',
    hazard: '#f0c05a'
};

export type Shades = { light: string; mid: string; dark: string };

/** Light, middle and dark versions of a color. */
export function getShades(color: string): Shades {
    return { light: mixColors(color, '#ffffff', 0.35), mid: color, dark: mixColors(color, '#000000', 0.3) };
}

export function createGrid(width: number, height: number, originX: number): SpriteGrid {
    return { width, height, originX, pixels: new Array(width * height).fill(null) };
}

export function setPixel(grid: SpriteGrid, x: number, y: number, color: string) {
    const column = Math.floor(x) + grid.originX;
    const row = Math.floor(y) + grid.height;

    if (column >= 0 && column < grid.width && row >= 0 && row < grid.height) {
        grid.pixels[row * grid.width + column] = color;
    }
}

export function fillRectangle(
    grid: SpriteGrid,
    left: number,
    top: number,
    width: number,
    height: number,
    color: string
) {
    for (let y = top; y < top + height; y++) {
        for (let x = left; x < left + width; x++) {
            setPixel(grid, x, y, color);
        }
    }
}

/**
 * A shaded box: light top row, dark bottom row. `front` and `back` cut that many pixels diagonally off the top
 * corners (front is the right side), for sloped armour.
 */
export function drawBox(
    grid: SpriteGrid,
    left: number,
    top: number,
    width: number,
    height: number,
    shades: Shades,
    front = 0,
    back = 0
) {
    for (let row = 0; row < height; row++) {
        const color = row === 0 ? shades.light : row === height - 1 && height > 2 ? shades.dark : shades.mid;

        for (let column = Math.max(0, back - row); column < width - Math.max(0, front - row); column++) {
            setPixel(grid, left + column, top + row, color);
        }
    }
}

/** The top half of an ellipse standing on `bottom`, lit from above. */
export function drawDome(
    grid: SpriteGrid,
    centerX: number,
    bottom: number,
    width: number,
    height: number,
    shades: Shades
) {
    for (let y = bottom - height; y < bottom; y++) {
        for (let x = Math.floor(centerX - width / 2); x < centerX + width / 2; x++) {
            const dx = (x + 0.5 - centerX) / (width / 2);
            const dy = (y + 0.5 - bottom) / height;

            if (dx * dx + dy * dy <= 1) {
                setPixel(grid, x, y, dy < -0.6 || dx < -0.55 ? shades.light : dy > -0.25 ? shades.dark : shades.mid);
            }
        }
    }
}

/** Adds the outline: every transparent pixel next to a part (left, right, above or below) becomes outline. */
export function finishGrid(grid: SpriteGrid): SpriteGrid {
    const pixels = grid.pixels.slice();
    const isFilled = (column: number, row: number) =>
        column >= 0 && column < grid.width && row >= 0 && row < grid.height && grid.pixels[row * grid.width + column];

    for (let row = 0; row < grid.height; row++) {
        for (let column = 0; column < grid.width; column++) {
            if (grid.pixels[row * grid.width + column]) {
                continue;
            }
            if (
                isFilled(column - 1, row) ||
                isFilled(column + 1, row) ||
                isFilled(column, row - 1) ||
                isFilled(column, row + 1)
            ) {
                pixels[row * grid.width + column] = outlineColor;
            }
        }
    }

    return { ...grid, pixels };
}

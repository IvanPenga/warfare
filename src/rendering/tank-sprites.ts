import type { TankTypeId } from '../game/tank-types';
import { mixColors } from './colors';
import {
    createGrid,
    drawBox,
    drawDome,
    fillRectangle,
    finishGrid,
    getShades,
    metal,
    setPixel,
    type Shades,
    type SpriteGrid
} from './pixel-grid';

/**
 * Tank sprites as pixel grids, one world pixel per sprite pixel, facing right. x = 0 is the tank's centre, y = -1 the
 * row just above the ground; the turret pivot the game shoots from is at (0, -turretHeight).
 */
export const spriteWidth = 38;
export const spriteHeight = 19;
const originX = 19;

/** A track with rounded ends, tread links on top and road wheels. */
function drawTrack(grid: SpriteGrid, left: number, top: number, width: number, height: number) {
    for (let row = 0; row < height; row++) {
        const inset = row === 0 || row === height - 1 ? 1 : 0;

        for (let column = inset; column < width - inset; column++) {
            const link = row === 0 && column % 2 === 0;

            setPixel(grid, left + column, top + row, link ? metal.treadLight : metal.tread);
        }
    }
    for (let x = left + 2; x <= left + width - 3; x += 4) {
        fillRectangle(grid, x, top + 1, 2, height - 2, metal.wheel);
        setPixel(grid, x, top + 1, metal.hub);
    }
}

function drawWheel(grid: SpriteGrid, centerX: number, centerY: number, radius: number, spokes = false) {
    for (let y = Math.floor(centerY - radius); y < centerY + radius; y++) {
        for (let x = Math.floor(centerX - radius); x < centerX + radius; x++) {
            const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);

            if (distance > radius) {
                continue;
            }
            const rim = distance > radius - 1.3;
            const spoke = spokes && (Math.abs(x + 0.5 - centerX) < 0.6 || Math.abs(y + 0.5 - centerY) < 0.6);

            setPixel(grid, x, y, rim ? metal.tread : distance < 1 ? metal.hub : spoke ? metal.steelLight : metal.wheel);
        }
    }
}

function drawAssault(grid: SpriteGrid, team: Shades) {
    drawTrack(grid, -11, -5, 22, 5);
    drawBox(grid, -11, -9, 22, 4, team, 2, 1);
    for (let x = -8; x <= 4; x += 4) {
        setPixel(grid, x, -7, team.light);
    }
    setPixel(grid, 9, -7, metal.lamp);
    drawDome(grid, -1, -9, 13, 5, team);
    fillRectangle(grid, -5, -13, 3, 1, team.dark);
}

function drawScout(grid: SpriteGrid, team: Shades) {
    drawWheel(grid, -7, -3.5, 3.5);
    drawWheel(grid, 7, -3.5, 3.5);
    drawBox(grid, -11, -9, 22, 3, team, 1, 0);
    setPixel(grid, 10, -8, metal.lamp);
    // Roll cage over the seat and a slanted windscreen in front.
    fillRectangle(grid, -6, -14, 8, 1, metal.steel);
    fillRectangle(grid, -6, -13, 1, 4, metal.steelDark);
    fillRectangle(grid, 1, -13, 1, 4, metal.steelDark);
    for (let step = 0; step < 3; step++) {
        setPixel(grid, 3 + step, -12 + step, metal.glass);
        setPixel(grid, 4 + step, -12 + step, metal.glass);
    }
    drawDome(grid, -2, -9, 6, 3, team);
}

function drawHeavy(grid: SpriteGrid, team: Shades) {
    drawTrack(grid, -14, -5, 28, 5);
    // Armour skirt over the top of the track, then a wide casemate the gun comes out of.
    const skirt = { light: team.mid, mid: team.dark, dark: mixColors(team.dark, '#000000', 0.3) };

    drawBox(grid, -14, -7, 28, 3, skirt, 1, 1);
    for (let x = -12; x <= 12; x += 3) {
        setPixel(grid, x, -6, team.mid);
    }
    drawBox(grid, -12, -13, 23, 6, team, 4, 2);
    for (let x = -9; x <= 3; x += 4) {
        setPixel(grid, x, -9, team.light);
    }
    drawDome(grid, -5, -13, 6, 2, team);
    setPixel(grid, -5, -14, team.dark);
}

function drawArtillery(grid: SpriteGrid, team: Shades) {
    // Trail leg back to a spade dug into the ground.
    for (let step = 0; step <= 8; step++) {
        const y = -5 + Math.round((step * 4) / 8);

        fillRectangle(grid, -5 - step, y, 1, 2, metal.steelDark);
    }
    fillRectangle(grid, -15, -3, 2, 3, metal.steel);
    drawBox(grid, -8, -10, 14, 5, team, 2, 1);
    setPixel(grid, -6, -8, team.light);
    setPixel(grid, -2, -8, team.light);
    drawWheel(grid, -2, -4.5, 4.5, true);
    fillRectangle(grid, -3, -12, 5, 2, metal.steelDark);
    // Gun shield the barrel pokes through.
    drawBox(grid, 3, -17, 4, 11, team, 1, 0);
    setPixel(grid, 4, -15, team.light);
    setPixel(grid, 4, -10, team.light);
}

function drawSapper(grid: SpriteGrid, team: Shades) {
    drawTrack(grid, -10, -5, 20, 5);
    drawBox(grid, -10, -10, 18, 5, team, 1, 1);
    for (let x = -9; x <= 6; x++) {
        setPixel(grid, x, -9, Math.floor((x + 9) / 2) % 2 === 0 ? metal.hazard : metal.tread);
    }
    drawBox(grid, -9, -14, 7, 4, team, 1, 1);
    fillRectangle(grid, -5, -13, 2, 2, metal.glass);
    drawDome(grid, 1, -10, 6, 3, team);
    // Drill on an arm at the front: a striped steel cone.
    fillRectangle(grid, 8, -8, 2, 3, metal.steelDark);
    for (let step = 0; step < 7; step++) {
        const half = 3 - (step * 3) / 7;

        for (let y = Math.round(-6.5 - half); y < -6.5 + half; y++) {
            const stripe = (step + y + 20) % 3 === 0;

            setPixel(grid, 10 + step, y, y < -7.5 ? metal.steelLight : stripe ? metal.steelDark : metal.steel);
        }
    }
}

const designs: Record<TankTypeId, (grid: SpriteGrid, team: Shades) => void> = {
    scout: drawScout,
    assault: drawAssault,
    heavy: drawHeavy,
    artillery: drawArtillery,
    sapper: drawSapper
};

/** The pixel grid for a tank type in a team color, with its outline. */
export function buildTankSprite(typeId: TankTypeId, color: string): SpriteGrid {
    const grid = createGrid(spriteWidth, spriteHeight, originX);

    designs[typeId](grid, getShades(color));

    return finishGrid(grid);
}

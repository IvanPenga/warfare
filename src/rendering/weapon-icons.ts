import type { WeaponId } from '../game/weapons';
import { mixColors } from './colors';
import {
    createGrid,
    fillRectangle,
    finishGrid,
    getShades,
    metal,
    setPixel,
    type Shades,
    type SpriteGrid
} from './pixel-grid';

/**
 * Weapon icons for the HUD as pixel grids, the projectile lying flat with its nose to the right. x = 0 is the middle;
 * y runs from -iconHeight (top) to -1 (bottom), so the middle row is about y = -8.
 */
export const iconWidth = 30;
export const iconHeight = 16;
const middleY = -8;

const colors = {
    brass: '#c9a24a',
    copper: '#c26b3a',
    olive: '#6f7d42',
    red: '#c0392b',
    bouncer: '#4f9a4f',
    steelBlue: '#5a7da0',
    ember: '#ff9a3d',
    spark: '#ffe07a',
    laser: '#69e8ff',
    violet: '#9b6cff'
};

/** Light on top, dark at the bottom, for a round body `half` pixels high on each side of the middle. */
function getRowColor(y: number, half: number, shades: Shades): string {
    const position = (y + 0.5 - middleY) / half;

    return position < -0.45 ? shades.light : position > 0.4 ? shades.dark : shades.mid;
}

/**
 * A round body from `left` to `right`, `half` pixels high on each side of the middle. From `noseStart` it narrows to
 * the nose: rounded (an ogive) or `pointed`.
 */
function drawBody(
    grid: SpriteGrid,
    left: number,
    right: number,
    half: number,
    shades: Shades,
    noseStart = right,
    pointed = false
) {
    for (let x = left; x <= right; x++) {
        const along = x < noseStart ? 0 : (x + 0.5 - noseStart) / (right + 1 - noseStart);
        const height = pointed ? half * (1 - along) : half * Math.sqrt(Math.max(0, 1 - along * along));

        for (let y = Math.round(middleY - height); y < Math.round(middleY + height); y++) {
            setPixel(grid, x, y, getRowColor(y, half, shades));
        }
    }
}

/** A band around the body, e.g. a driving band or a hazard stripe. */
function drawBand(grid: SpriteGrid, left: number, width: number, half: number, shades: Shades) {
    for (let x = left; x < left + width; x++) {
        for (let y = middleY - half; y < middleY + half; y++) {
            setPixel(grid, x, y, getRowColor(y, half, shades));
        }
    }
}

function drawBall(grid: SpriteGrid, centerX: number, centerY: number, radius: number, shades: Shades) {
    for (let y = Math.floor(centerY - radius); y < centerY + radius; y++) {
        for (let x = Math.floor(centerX - radius); x < centerX + radius; x++) {
            const dx = (x + 0.5 - centerX) / radius;
            const dy = (y + 0.5 - centerY) / radius;

            if (dx * dx + dy * dy <= 1) {
                const light = dx + dy < -0.6;
                const dark = dx + dy > 0.55;

                setPixel(grid, x, y, light ? shades.light : dark ? shades.dark : shades.mid);
            }
        }
    }
    setPixel(grid, centerX - radius * 0.45, centerY - radius * 0.5, '#ffffff');
}

/** Tail fins above and below the back of a bomb. */
function drawFins(grid: SpriteGrid, left: number, width: number, reach: number, shades: Shades) {
    fillRectangle(grid, left, middleY - reach, width, reach - 1, shades.mid);
    fillRectangle(grid, left, middleY + 1, width, reach - 1, shades.dark);
    fillRectangle(grid, left, middleY - 1, width + 2, 2, shades.dark);
}

function drawShell(grid: SpriteGrid) {
    const brass = getShades(colors.brass);

    drawBand(grid, -12, 1, 5, getShades(mixColors(colors.brass, '#000000', 0.25)));
    drawBody(grid, -11, -4, 4, brass);
    drawBody(grid, -3, 11, 4, getShades(colors.olive), 3);
    drawBand(grid, -3, 2, 4, getShades(colors.copper));
}

function drawHeavyShell(grid: SpriteGrid) {
    const body = getShades('#6b3a34');

    drawBand(grid, -13, 1, 6, getShades(mixColors(colors.brass, '#000000', 0.25)));
    drawBody(grid, -12, -5, 5, getShades(colors.brass));
    drawBody(grid, -4, 12, 5, body, 3);
    drawBand(grid, -4, 2, 5, getShades(colors.copper));
    drawBand(grid, 3, 2, 5, getShades(metal.hazard));
}

function drawBouncer(grid: SpriteGrid) {
    // Speed lines behind a rubbery ball.
    for (const [x, y, length] of [
        [-12, -12, 5],
        [-13, -8, 7],
        [-12, -4, 5]
    ]) {
        fillRectangle(grid, x, y, length, 1, metal.steelLight);
    }
    drawBall(grid, 2, middleY, 6, getShades(colors.bouncer));
    fillRectangle(grid, -2, middleY - 1, 8, 1, mixColors(colors.bouncer, '#000000', 0.2));
}

function drawCluster(grid: SpriteGrid) {
    drawBody(grid, -12, 2, 4.5, getShades(colors.olive), -2);
    drawBand(grid, -9, 2, 5, getShades(colors.red));
    drawBand(grid, -4, 1, 5, getShades(colors.red));
    const bomblet = getShades(mixColors(colors.olive, '#000000', 0.15));

    drawBall(grid, 7, -11.5, 2.5, bomblet);
    drawBall(grid, 10.5, middleY, 2.5, bomblet);
    drawBall(grid, 7, -4.5, 2.5, bomblet);
}

function drawBomblet(grid: SpriteGrid) {
    const body = getShades(colors.olive);

    drawFins(grid, -8, 3, 5, getShades(metal.steelDark));
    drawBall(grid, 1, middleY, 5, body);
}

function drawMortar(grid: SpriteGrid) {
    const body = getShades(colors.olive);

    drawFins(grid, -12, 4, 6, getShades(metal.steelDark));
    // A thin tail widening into a teardrop body.
    for (let x = -8; x <= 11; x++) {
        const half = x < -1 ? 1.5 + ((x + 8) / 7) * 3 : 4.5 * Math.sqrt(Math.max(0, 1 - ((x + 1) / 13) ** 2));

        for (let y = Math.round(middleY - half); y < Math.round(middleY + half); y++) {
            setPixel(grid, x, y, getRowColor(y, 4.5, body));
        }
    }
    drawBand(grid, 0, 1, 4, getShades(colors.spark));
}

function drawDigger(grid: SpriteGrid) {
    const body = getShades(metal.hazard);

    drawFins(grid, -13, 3, 5, getShades(metal.steelDark));
    drawBody(grid, -11, 1, 4, body);
    for (let x = -9; x <= 0; x += 3) {
        drawBand(grid, x, 1, 4, getShades(metal.tread));
    }
    // A drill bit: a striped steel cone.
    for (let x = 2; x <= 13; x++) {
        const half = 4.5 * (1 - (x - 2) / 12);

        for (let y = Math.round(middleY - half); y < Math.round(middleY + half); y++) {
            const stripe = (x + y + 30) % 3 === 0;

            setPixel(grid, x, y, y < middleY - 1 ? metal.steelLight : stripe ? metal.steelDark : metal.steel);
        }
    }
}

function drawAirburst(grid: SpriteGrid) {
    drawBody(grid, -13, 2, 4, getShades(colors.steelBlue), -2);
    drawBand(grid, -13, 1, 5, getShades(metal.steelDark));
    drawBody(grid, 0, 3, 3, getShades(colors.red), 0);
    // A burst ahead of the nose.
    const centerX = 8;

    for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1]
    ]) {
        for (let step = 2; step <= 4; step++) {
            const reach = dx !== 0 && dy !== 0 ? step * 0.75 : step;

            setPixel(grid, centerX + dx * reach, middleY + dy * reach, step < 3 ? colors.spark : colors.ember);
        }
    }
    fillRectangle(grid, centerX - 1, middleY - 1, 3, 3, '#ffffff');
}

function drawBunkerBuster(grid: SpriteGrid) {
    const body = getShades('#4a4f58');

    drawFins(grid, -13, 4, 6, getShades(metal.steelDark));
    drawBody(grid, -11, 13, 3, body, 4, true);
    for (let x = -4; x <= 1; x++) {
        drawBand(grid, x, 1, 3, getShades(Math.floor((x + 4) / 2) % 2 === 0 ? metal.hazard : metal.tread));
    }
}

function drawShotgun(grid: SpriteGrid) {
    drawBand(grid, -12, 1, 5, getShades(mixColors(colors.brass, '#000000', 0.25)));
    drawBand(grid, -11, 4, 4.5, getShades(colors.brass));
    drawBand(grid, -7, 11, 4, getShades(colors.red));
    fillRectangle(grid, 3, -12, 1, 8, mixColors(colors.red, '#000000', 0.35));
    // Pellets flying out of the front.
    const pellet = getShades(metal.steel);

    drawBall(grid, 8.5, -12, 1.8, pellet);
    drawBall(grid, 11, middleY, 1.8, pellet);
    drawBall(grid, 8.5, -4, 1.8, pellet);
}

function drawRailShot(grid: SpriteGrid) {
    drawBody(grid, -13, 12, 2.5, getShades(metal.steel), 7, true);
    drawBand(grid, -9, 2, 3, getShades(colors.laser));
    drawBand(grid, -2, 2, 3, getShades(colors.laser));
    fillRectangle(grid, 5, middleY - 1, 8, 2, '#ffffff');
}

function drawSplitterShell(grid: SpriteGrid) {
    drawBody(grid, -12, 4, 4, getShades(colors.violet), -1);
    drawBand(grid, -8, 2, 5, getShades(colors.spark));
    drawBall(grid, 8, -12, 2, getShades(colors.violet));
    drawBall(grid, 11, middleY, 2, getShades(colors.violet));
    drawBall(grid, 8, -4, 2, getShades(colors.violet));
}

function drawLaser(grid: SpriteGrid) {
    drawBody(grid, -13, -2, 3, getShades(metal.steel), -4);
    drawBand(grid, -10, 2, 4, getShades(colors.laser));
    fillRectangle(grid, -1, middleY - 1, 14, 2, colors.laser);
    fillRectangle(grid, 2, middleY, 11, 1, '#ffffff');
}

function drawFireworkBomb(grid: SpriteGrid) {
    drawFins(grid, -13, 4, 5, getShades(metal.steelDark));
    drawBody(grid, -10, 4, 4, getShades(colors.ember), 0);
    drawBand(grid, -6, 2, 5, getShades(colors.spark));
    for (const [x, y] of [
        [7, -13],
        [10, -10],
        [8, -6],
        [5, -4]
    ]) {
        fillRectangle(grid, x, y, 2, 2, colors.spark);
    }
}

const designs: Record<WeaponId, (grid: SpriteGrid) => void> = {
    shell: drawShell,
    bouncer: drawBouncer,
    cluster: drawCluster,
    bomblet: drawBomblet,
    heavyShell: drawHeavyShell,
    mortar: drawMortar,
    digger: drawDigger,
    airburst: drawAirburst,
    bunkerBuster: drawBunkerBuster,
    shotgun: drawShotgun,
    railShot: drawRailShot,
    splitterShell: drawSplitterShell,
    splitterShard: drawSplitterShell,
    laser: drawLaser,
    fireworkBomb: drawFireworkBomb,
    fireworkSpark: drawFireworkBomb,
    railBolt: drawRailShot,
    heavyShock: drawHeavyShell,
    mortarShard: drawMortar,
    shotgunPellet: drawShotgun
};

/** The pixel grid of a weapon's icon, with its outline. */
export function buildWeaponIcon(weaponId: WeaponId): SpriteGrid {
    const grid = createGrid(iconWidth, iconHeight, iconWidth / 2);

    designs[weaponId](grid);

    return finishGrid(grid);
}

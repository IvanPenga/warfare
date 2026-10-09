import { getActiveTank, getLivingTanks, type GameState } from '../game/game-state';
import { traceShotStart } from '../game/projectiles';
import { tankTypes, type TankTypeId } from '../game/tank-types';
import { barrelLength, maxPower, turretHeight, type TankState } from '../game/tanks';
import { weapons, type WeaponId } from '../game/weapons';
import { sides, type Side } from '../level/level';
import { isSolidAt, type TerrainMask } from '../terrain/terrain-mask';
import { sideColors } from './colors';
import { outlineColor, type SpriteGrid } from './pixel-grid';
import { buildWeaponIcon } from './weapon-icons';
import { buildTankSprite, spriteHeight, spriteWidth } from './tank-sprites';
import type { Effects } from './effects';
import type { Camera, LevelPainter, ViewSize } from './level-renderer';
import type { TerrainImage } from './terrain-renderer';

export const sideNames: Record<Side, string> = { left: 'Player 1', right: 'Player 2' };

/** Barrel thickness and drawn length per type, in world pixels. Shots still start `barrelLength` from the pivot. */
const barrelLooks: Record<TankTypeId, { thickness: number; length: number }> = {
    scout: { thickness: 2, length: barrelLength - 2 },
    assault: { thickness: 3, length: barrelLength },
    heavy: { thickness: 4, length: barrelLength + 1 },
    artillery: { thickness: 2, length: barrelLength + 8 },
    sapper: { thickness: 2, length: barrelLength - 1 }
};

/** Draws a pixel grid into a canvas of its size, one canvas pixel per grid pixel. */
function gridToCanvas(grid: SpriteGrid): HTMLCanvasElement {
    const canvas = document.createElement('canvas');

    canvas.width = grid.width;
    canvas.height = grid.height;
    const context = canvas.getContext('2d')!;

    grid.pixels.forEach((color, index) => {
        if (color) {
            context.fillStyle = color;
            context.fillRect(index % grid.width, Math.floor(index / grid.width), 1, 1);
        }
    });

    return canvas;
}

const tankImages = new Map<string, HTMLCanvasElement>();

/** The sprite of a tank type in a side's color, drawn once into a canvas. */
function getTankImage(typeId: TankTypeId, side: Side): HTMLCanvasElement {
    const key = `${typeId}:${side}`;
    let image = tankImages.get(key);

    if (!image) {
        image = gridToCanvas(buildTankSprite(typeId, sideColors[side]));
        tankImages.set(key, image);
    }

    return image;
}

const weaponImages = new Map<WeaponId, HTMLCanvasElement>();

function getWeaponImage(weaponId: WeaponId): HTMLCanvasElement {
    let image = weaponImages.get(weaponId);

    if (!image) {
        image = gridToCanvas(buildWeaponIcon(weaponId));
        weaponImages.set(weaponId, image);
    }

    return image;
}

/** The ground height under a point, searched a little above and below `y`. For drawing only. */
function findGround(terrain: TerrainMask, x: number, y: number): number {
    for (let offset = -8; offset <= 8; offset++) {
        if (isSolidAt(terrain, x, y + offset)) {
            return y + offset;
        }
    }

    return y;
}

/** How much of the shot's path the aim preview shows, and how far apart its points are, in world pixels. */
const aimPreviewLength = 90;
const aimPreviewSpacing = 3;

/** A line along the start of the path the active tank's shot would take, fading out towards its end. */
function drawAimPreview(context: CanvasRenderingContext2D, state: GameState, tank: TankState, camera: Camera) {
    const points = traceShotStart(state, tank, aimPreviewLength, aimPreviewSpacing).map((point) => ({
        x: (point.x - camera.x) * camera.zoom,
        y: (point.y - camera.y) * camera.zoom
    }));
    if (points.length < 2) {
        return;
    }
    const first = points[0];
    const last = points[points.length - 1];

    // One path per colour, so the line has no seams. Over 90 px the path is close to straight, so a gradient from its
    // start to its end fades it out evenly.
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const [red, green, blue, opacity, width] of [
        [20, 20, 28, 0.6, 3.5],
        [255, 255, 255, 0.95, 1.5]
    ]) {
        const gradient = context.createLinearGradient(first.x, first.y, last.x, last.y);

        gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${opacity})`);
        gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
        context.strokeStyle = gradient;
        context.lineWidth = Math.max(1, width * camera.zoom);
        context.beginPath();
        context.moveTo(first.x, first.y);
        for (const point of points.slice(1)) {
            context.lineTo(point.x, point.y);
        }
        context.stroke();
    }
}

/** A barrel from the pivot along +x, outlined, with a muzzle brake at the end. */
function drawBarrel(context: CanvasRenderingContext2D, thickness: number, length: number) {
    const top = -Math.ceil(thickness / 2);

    context.fillStyle = outlineColor;
    context.fillRect(0, top - 1, length + 1, thickness + 2);
    context.fillRect(length - 3, top - 2, 4, thickness + 4);
    context.fillStyle = '#5d636e';
    context.fillRect(0, top, length, thickness);
    context.fillStyle = '#9ba1ab';
    context.fillRect(0, top, length - 3, 1);
    context.fillStyle = '#747a85';
    context.fillRect(length - 2, top - 1, 2, thickness + 2);
}

/**
 * A tank as a pixel-art sprite in its own coordinates (x = 0 is the centre, y = 0 the ground), tilted to follow the
 * ground under its tracks and mirrored to its facing. The barrel points in world space, so it shows the real aim.
 */
function drawTank(context: CanvasRenderingContext2D, tank: TankState, terrain: TerrainMask, camera: Camera) {
    const image = getTankImage(tank.typeId, tank.side);
    const barrel = barrelLooks[tank.typeId];
    const left = findGround(terrain, tank.x - 8, tank.y);
    const right = findGround(terrain, tank.x + 8, tank.y);
    const tilt = Math.atan2(right - left, 16);
    const radians = (tank.angle * Math.PI) / 180;
    const spriteLeft = -spriteWidth / 2;

    context.save();
    context.translate((tank.x - camera.x) * camera.zoom, (tank.y - camera.y) * camera.zoom);
    context.scale(camera.zoom, camera.zoom);
    context.imageSmoothingEnabled = camera.zoom < 1;
    // Barrel first, so the turret covers its base.
    context.save();
    context.translate(0, -turretHeight);
    context.rotate(-radians);
    drawBarrel(context, barrel.thickness, barrel.length);
    context.restore();
    context.rotate(tilt);
    context.scale(tank.facing, 1);
    context.drawImage(image, spriteLeft, -spriteHeight);
    context.restore();
}

/** A small health bar over a tank, and a marker over the tank that is up. */
function drawTankLabel(
    context: CanvasRenderingContext2D,
    tank: TankState,
    camera: Camera,
    active: boolean,
    time: number
) {
    const x = Math.round((tank.x - camera.x) * camera.zoom);
    const y = Math.round((tank.y - 22 - camera.y) * camera.zoom);
    const width = 26;
    const share = tank.health / tankTypes[tank.typeId].health;

    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.fillRect(x - width / 2 - 1, y - 1, width + 2, 5);
    context.fillStyle = share > 0.5 ? '#6fcf7a' : share > 0.25 ? '#ffd54a' : '#ff5a4f';
    context.fillRect(x - width / 2, y, Math.max(1, Math.round(width * share)), 3);
    if (active) {
        const bob = Math.round(Math.sin(time * 5) * 3);

        context.fillStyle = '#ffffff';
        context.beginPath();
        context.moveTo(x - 6, y - 12 + bob);
        context.lineTo(x + 6, y - 12 + bob);
        context.lineTo(x, y - 5 + bob);
        context.closePath();
        context.fill();
        context.font = '600 11px system-ui, sans-serif';
        context.textAlign = 'center';
        context.lineWidth = 3;
        context.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        context.strokeText(tankTypes[tank.typeId].name, x, y - 16 + bob);
        context.fillText(tankTypes[tank.typeId].name, x, y - 16 + bob);
        context.textAlign = 'left';
    }
}

function drawBar(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    value: number,
    max: number,
    color: string,
    text: string
) {
    context.fillStyle = '#9a9aa8';
    context.fillText(label, x, y + 9);
    context.fillStyle = 'rgba(255, 255, 255, 0.12)';
    context.fillRect(x + 52, y, 120, 10);
    context.fillStyle = color;
    context.fillRect(x + 52, y, (120 * Math.max(0, value)) / max, 10);
    context.fillStyle = '#e6e6ec';
    context.fillText(text, x + 180, y + 9);
}

function drawPanel(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
    context.fillStyle = 'rgba(16, 16, 24, 0.72)';
    context.fillRect(x, y, width, height);
}

function formatTime(seconds: number): string {
    const whole = Math.ceil(seconds);

    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export type HudTexts = { hint: string };

/** A message across the middle of the screen, e.g. "Player 2's turn". `age` fades it out. */
export type Banner = { title: string; subtitle: string; color: string; age: number };

function drawHud(context: CanvasRenderingContext2D, state: GameState, view: ViewSize, texts: HudTexts) {
    const tank = getActiveTank(state);
    const side = state.turn.side;

    context.font = '12px ui-monospace, monospace';
    if (tank && state.phase !== 'over') {
        const type = tankTypes[tank.typeId];

        drawPanel(context, 12, 12, 250, 104);
        context.fillStyle = sideColors[side];
        context.fillText(sideNames[side], 22, 30);
        context.fillStyle = '#e6e6ec';
        context.fillText(type.name, 96, 30);
        context.fillText(`Angle ${Math.round(tank.facing === 1 ? tank.angle : 180 - tank.angle)}°`, 22, 48);
        context.fillStyle = '#9a9aa8';
        context.fillText(state.turn.locked ? 'tank chosen' : 'Tab: other tank', 150, 48);
        drawBar(context, 22, 58, 'Power', tank.power, maxPower, '#ffb347', String(Math.round(tank.power)));
        drawBar(context, 22, 76, 'Fuel', tank.fuel, type.fuel, '#6fcf7a', String(tank.fuel));
        drawBar(context, 22, 94, 'Health', tank.health, type.health, '#ff5a4f', String(tank.health));
        drawWeaponPanel(context, tank.selectedWeaponId, 270, 12);
    }
    // Turn timer, top centre.
    if (state.phase !== 'over') {
        const low = state.turn.timeLeft <= 20 && state.phase === 'aiming';

        drawPanel(context, view.width / 2 - 60, 12, 120, 34);
        context.font = '600 20px ui-monospace, monospace';
        context.textAlign = 'center';
        context.fillStyle = low ? '#ff5a4f' : '#e6e6ec';
        context.fillText(formatTime(state.turn.timeLeft), view.width / 2, 36);
        context.textAlign = 'left';
    }
    // Tanks left per side, top right.
    context.font = '12px ui-monospace, monospace';
    drawPanel(context, view.width - 184, 12, 172, 46);
    sides.forEach((listSide, index) => {
        const alive = getLivingTanks(state, listSide).length;

        context.fillStyle = sideColors[listSide];
        context.fillText(sideNames[listSide], view.width - 174, 30 + index * 18);
        context.fillStyle = '#e6e6ec';
        context.fillText(`${alive} tank${alive === 1 ? '' : 's'}`, view.width - 94, 30 + index * 18);
    });
    drawPanel(context, 0, view.height - 26, view.width, 26);
    context.fillStyle = '#c8c8d2';
    context.fillText(texts.hint, 12, view.height - 9);
}

/** The selected weapon next to the tank panel: its icon, three times its pixel size, and its name below. */
function drawWeaponPanel(context: CanvasRenderingContext2D, weaponId: WeaponId, x: number, y: number) {
    const width = 112;
    const scale = 3;
    const image = getWeaponImage(weaponId);

    drawPanel(context, x, y, width, 104);
    context.imageSmoothingEnabled = false;
    context.drawImage(
        image,
        x + Math.round((width - image.width * scale) / 2),
        y + 18,
        image.width * scale,
        image.height * scale
    );
    context.textAlign = 'center';
    context.fillStyle = '#e6e6ec';
    context.fillText(weapons[weaponId].name, x + width / 2, y + 90);
    context.textAlign = 'left';
}

function drawBanner(context: CanvasRenderingContext2D, banner: Banner, view: ViewSize, persistent: boolean) {
    const alpha = persistent ? 1 : Math.max(0, Math.min(1, 2 - banner.age));

    if (alpha <= 0) {
        return;
    }
    context.globalAlpha = alpha;
    drawPanel(context, 0, view.height / 2 - 50, view.width, 90);
    context.textAlign = 'center';
    context.font = '600 32px system-ui, sans-serif';
    context.fillStyle = banner.color;
    context.fillText(banner.title, view.width / 2, view.height / 2 - 6);
    context.font = '14px system-ui, sans-serif';
    context.fillStyle = '#e6e6ec';
    context.fillText(banner.subtitle, view.width / 2, view.height / 2 + 22);
    context.textAlign = 'left';
    context.globalAlpha = 1;
}

export type GameScene = {
    painter: LevelPainter;
    terrain: TerrainImage;
    effects: Effects;
    banner: Banner | null;
};

/** Draws a frame: background and back wall, the terrain mask, tanks, shots, effects, the HUD and any banner. */
export function drawGame(
    context: CanvasRenderingContext2D,
    state: GameState,
    scene: GameScene,
    camera: Camera,
    view: ViewSize,
    texts: HudTexts,
    time: number
) {
    scene.painter.draw(context, state.level, camera, view, { showParallax: true, layers: ['backWall'], time });
    context.imageSmoothingEnabled = camera.zoom < 1;
    context.drawImage(
        scene.terrain.canvas,
        Math.round(-camera.x * camera.zoom),
        Math.round(-camera.y * camera.zoom),
        Math.round(scene.terrain.canvas.width * camera.zoom),
        Math.round(scene.terrain.canvas.height * camera.zoom)
    );
    const active = getActiveTank(state);

    for (const tank of state.tanks) {
        if (tank.alive) {
            drawTank(context, tank, state.terrain, camera);
        }
    }
    if (active && state.phase === 'aiming') {
        drawAimPreview(context, state, active, camera);
    }
    for (const tank of state.tanks) {
        if (tank.alive) {
            drawTankLabel(context, tank, camera, tank === active && state.phase === 'aiming', time);
        }
    }
    for (const projectile of state.projectiles) {
        const x = (projectile.x - camera.x) * camera.zoom;
        const y = (projectile.y - camera.y) * camera.zoom;
        const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
        const size =
            projectile.weaponId === 'heavyShell' || projectile.weaponId === 'bunkerBuster'
                ? 3.5
                : projectile.weaponId === 'bomblet'
                  ? 1.8
                  : projectile.weaponId === 'railBolt'
                    ? 1.6
                    : 2.5;

        if (projectile.tunnelLeft === null) {
            context.strokeStyle = 'rgba(255, 240, 200, 0.5)';
            context.lineWidth = 2 * camera.zoom;
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(
                x - (projectile.vx / speed) * 10 * camera.zoom,
                y - (projectile.vy / speed) * 10 * camera.zoom
            );
            context.stroke();
        }
        context.fillStyle =
            projectile.weaponId === 'bouncer'
                ? '#3b6e3b'
                : projectile.weaponId === 'airburst' || projectile.weaponId === 'splitterShell'
                  ? '#7b5ac8'
                  : projectile.weaponId === 'railBolt'
                    ? '#69e8ff'
                    : projectile.weaponId === 'fireworkBomb' || projectile.weaponId === 'fireworkSpark'
                      ? '#ff9a3d'
                      : projectile.weaponId === 'shotgunPellet'
                        ? '#c9a24a'
                        : '#1d1d24';
        context.beginPath();
        context.arc(x, y, size * camera.zoom, 0, Math.PI * 2);
        context.fill();
    }
    scene.effects.draw(context, camera);
    drawHud(context, state, view, texts);
    if (scene.banner) {
        drawBanner(context, scene.banner, view, state.phase === 'over');
    }
}

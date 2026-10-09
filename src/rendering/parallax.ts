import { backgroundPresets, type BackgroundLayer, type LevelBackground } from '../level/background';
import { createRandom, hash2d, periodicFbm, periodicNoise } from '../level/noise';
import { mixColors, withAlpha } from './colors';

/** Layer images repeat horizontally every this many screen pixels. */
export const parallaxImageWidth = 1024;
export const parallaxImageHeight = 540;

/** Layers that stand on the ground: below their image the screen is filled with their base color. */
const groundedLayers = new Set<BackgroundLayer['type']>(['mountains', 'hills', 'cacti']);

/** Where on the view (as a fraction of its height) the horizon sits when the camera looks straight at it. */
const restingHorizon = 0.5;

/** How far above the horizon (in screen pixels) the distant battle sits, so it shows on the mountain foothills. */
const battleLift = 80;

/** Parts of a layer image that move: windmill blades and blinking lights on masts, in layer image pixels. */
type LayerProp = { kind: 'blades' | 'beacon'; x: number; y: number; size: number; color: string };

type LayerImage = { canvas: HTMLCanvasElement; props: LayerProp[] };

const imageCache = new Map<string, LayerImage>();
const imageCacheLimit = 64;

type LayerContext = {
    context: CanvasRenderingContext2D;
    layer: BackgroundLayer;
    seed: number;
    /** The sky color at the horizon: far things fade towards it. */
    hazeColor: string;
    props: LayerProp[];
};

/**
 * What the view shows. `width` and `height` are screen pixels, `scrollX` the world x of the view's centre (layers move
 * by their `factor` of it), `horizonY` where the level's horizon is on screen and `time` is seconds.
 */
export type ParallaxView = { width: number; height: number; scrollX: number; horizonY: number; time: number };

/** The positive remainder, so values left of zero wrap around too. */
function wrap(value: number, period: number): number {
    return ((value % period) + period) % period;
}

function pick<Item>(items: readonly Item[], random: () => number): Item {
    return items[Math.floor(random() * items.length)];
}

/** A silhouette whose top edge follows periodic noise, with a gradient, an optional rim, snow caps and landmarks. */
function drawRidge(layerContext: LayerContext, period: number, octaves: number) {
    const { context, layer, seed } = layerContext;
    const height = (layer.height ?? 0.5) * parallaxImageHeight;
    const bottom = parallaxImageHeight;
    const tops: number[] = [];

    for (let x = 0; x <= parallaxImageWidth; x += 2) {
        let noise = periodicFbm((x / parallaxImageWidth) * period, period, octaves, seed);

        if (layer.plateau !== undefined) {
            noise = Math.min(noise, layer.plateau) / layer.plateau;
        }
        tops.push(bottom - height * (0.35 + 0.65 * noise));
    }
    const outline = new Path2D();

    outline.moveTo(0, bottom);
    tops.forEach((top, index) => outline.lineTo(index * 2, top));
    outline.lineTo(parallaxImageWidth, bottom);
    outline.closePath();
    const gradient = context.createLinearGradient(0, bottom - height, 0, bottom);

    gradient.addColorStop(0, layer.color);
    gradient.addColorStop(1, layer.color2 ?? layer.color);
    context.fillStyle = gradient;
    context.fill(outline);

    if (layer.snowLine !== undefined) {
        const snowY = bottom - height * (0.35 + 0.65 * layer.snowLine);
        const snow = new Path2D();

        snow.moveTo(0, 0);
        for (let x = 0; x <= parallaxImageWidth; x += 4) {
            const jag = (periodicNoise((x / parallaxImageWidth) * 64, 64, seed + 7) - 0.5) * 18;

            snow.lineTo(x, snowY + jag);
        }
        snow.lineTo(parallaxImageWidth, 0);
        snow.closePath();
        context.save();
        context.clip(outline);
        context.fillStyle = mixColors('#ffffff', layer.color, 0.2);
        context.fill(snow);
        context.restore();
    }
    if (layer.rim) {
        context.beginPath();
        tops.forEach((top, index) => context.lineTo(index * 2, top + 1.5));
        context.strokeStyle = layer.rim;
        context.lineWidth = 3;
        context.lineJoin = 'round';
        context.globalAlpha = 0.7;
        context.stroke();
        context.globalAlpha = 1;
    }
    if (layer.treeline) {
        drawTreeline(layerContext, tops);
    }
    if (layer.landmarks) {
        const random = createRandom(seed + 11);
        const color = mixColors(layer.color2 ?? layer.color, '#000000', 0.25);
        const count = 3;

        for (let index = 0; index < count; index++) {
            const x = Math.round(((index + 0.2 + random() * 0.6) * parallaxImageWidth) / count);
            const base = tops[Math.round(x / 2)] + 3;

            drawLandmark(layerContext, pick(['windmill', 'tower', 'mast', 'house'] as const, random), x, base, color);
        }
    }
}

/** Small tree silhouettes far away along a ridge, in clumps: pines and round crowns in one flat color. */
function drawTreeline({ context, layer, seed }: LayerContext, tops: number[]) {
    const random = createRandom(seed + 17);
    const color = layer.treeColor ?? mixColors(layer.color2 ?? layer.color, '#000000', 0.2);

    for (let x = 0; x < parallaxImageWidth; x += 3 + random() * 4) {
        const density = periodicNoise((x / parallaxImageWidth) * 12, 12, seed + 19);

        if (density < 0.45) {
            continue;
        }
        const height = 5 + random() * 8 * density;
        const pine = layer.treeline === 'pine' || (layer.treeline === 'mixed' && random() < 0.4);
        const base = tops[Math.round(x / 2)] + 2;

        // Drawn one image width to each side too, so trees cut by an edge continue on the other side.
        context.fillStyle = color;
        for (const offset of [-parallaxImageWidth, 0, parallaxImageWidth]) {
            const treeX = x + offset;

            context.beginPath();
            if (pine) {
                context.moveTo(treeX - height * 0.28, base);
                context.lineTo(treeX, base - height * 1.3);
                context.lineTo(treeX + height * 0.28, base);
                context.fill();
            } else {
                context.fillRect(treeX - 0.5, base - height * 0.5, 1, height * 0.5);
                context.arc(treeX, base - height * 0.6, height * 0.42, 0, Math.PI * 2);
                context.fill();
            }
        }
    }
}

function drawLandmark(
    { context, props }: LayerContext,
    kind: 'windmill' | 'tower' | 'mast' | 'house',
    x: number,
    base: number,
    color: string
) {
    context.fillStyle = color;
    context.strokeStyle = color;
    switch (kind) {
        case 'windmill': {
            context.beginPath();
            context.moveTo(x - 6, base);
            context.lineTo(x - 3, base - 34);
            context.lineTo(x + 3, base - 34);
            context.lineTo(x + 6, base);
            context.closePath();
            context.fill();
            context.beginPath();
            context.arc(x, base - 34, 4, Math.PI, 0);
            context.fill();
            props.push({ kind: 'blades', x, y: base - 34, size: 20, color });
            break;
        }
        case 'tower': {
            context.fillRect(x - 8, base - 40, 16, 40);
            for (let notch = 0; notch < 3; notch++) {
                context.fillRect(x - 8 + notch * 6, base - 46, 4, 6);
            }
            // A broken corner, as if a shell hit it.
            context.clearRect(x + 4, base - 46, 4, 10);
            break;
        }
        case 'mast': {
            context.lineWidth = 1.5;
            context.beginPath();
            context.moveTo(x - 7, base);
            context.lineTo(x, base - 70);
            context.lineTo(x + 7, base);
            for (let rung = 1; rung < 7; rung++) {
                const y = base - rung * 10;
                const halfWidth = 7 * (1 - (rung * 10) / 70);

                context.moveTo(x - halfWidth, y);
                context.lineTo(x + halfWidth, y);
            }
            context.stroke();
            props.push({ kind: 'beacon', x, y: base - 71, size: 2, color });
            break;
        }
        case 'house': {
            context.fillRect(x - 12, base - 14, 24, 14);
            context.beginPath();
            context.moveTo(x - 15, base - 13);
            context.lineTo(x, base - 26);
            context.lineTo(x + 15, base - 13);
            context.closePath();
            context.fill();
            context.fillRect(x + 6, base - 26, 4, 9);
            break;
        }
    }
}

type PlantShades = { light: string; mid: string; dark: string };

function getPlantShades(color: string): PlantShades {
    return { light: mixColors(color, '#ffffff', 0.18), mid: color, dark: mixColors(color, '#000000', 0.28) };
}

function drawCactus(
    context: CanvasRenderingContext2D,
    x: number,
    groundY: number,
    height: number,
    shades: PlantShades
) {
    const width = Math.max(4, height * 0.13);

    context.lineCap = 'round';
    for (const [color, shift, lineWidth] of [
        [shades.dark, 1, width],
        [shades.mid, 0, width * 0.7]
    ] as const) {
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.beginPath();
        context.moveTo(x + shift, groundY);
        context.lineTo(x + shift, groundY - height);
        context.moveTo(x + shift, groundY - height * 0.45);
        context.lineTo(x + shift - width * 1.5, groundY - height * 0.45);
        context.lineTo(x + shift - width * 1.5, groundY - height * 0.75);
        context.moveTo(x + shift, groundY - height * 0.6);
        context.lineTo(x + shift + width * 1.5, groundY - height * 0.6);
        context.lineTo(x + shift + width * 1.5, groundY - height * 0.85);
        context.stroke();
    }
    context.lineCap = 'butt';
}

/** Cacti and small shrubs on rolling sand, in front of the hills. */
function drawCacti({ context, layer, seed }: LayerContext) {
    const height = (layer.height ?? 0.12) * parallaxImageHeight;
    const baseY = parallaxImageHeight - height;
    const groundColor = layer.color2 ?? layer.color;
    const getGroundY = (x: number) =>
        baseY + 6 - 26 * periodicFbm((wrap(x, parallaxImageWidth) / parallaxImageWidth) * 5, 5, 2, seed + 3);
    const getDensity = (x: number) =>
        periodicNoise((wrap(x, parallaxImageWidth) / parallaxImageWidth) * 9, 9, seed + 5);

    // Draw everything three times, one image width apart, so shapes cut by an edge continue on the other side.
    for (const offset of [-parallaxImageWidth, 0, parallaxImageWidth]) {
        const random = createRandom(seed);

        context.save();
        context.translate(offset, 0);
        for (let x = 0; x < parallaxImageWidth; x += 60 + random() * 120) {
            const cactusHeight = (22 + random() * 28) * (0.8 + getDensity(x) * 0.4);

            drawCactus(context, x, getGroundY(x) + 2, cactusHeight, getPlantShades(layer.color));
        }
        // The sand, following the rolling line, then shrubs along its top.
        const ground = context.createLinearGradient(0, baseY - 20, 0, parallaxImageHeight);

        // Ends in the plain ground color, where the fill below the image takes over.
        ground.addColorStop(0, mixColors(groundColor, '#ffffff', 0.1));
        ground.addColorStop(0.15, groundColor);
        ground.addColorStop(1, groundColor);
        context.fillStyle = ground;
        context.beginPath();
        context.moveTo(0, parallaxImageHeight);
        for (let x = 0; x <= parallaxImageWidth; x += 4) {
            context.lineTo(x, getGroundY(x));
        }
        context.lineTo(parallaxImageWidth, parallaxImageHeight);
        context.closePath();
        context.fill();
        const shrub = getPlantShades(mixColors(groundColor, '#6b5a2a', 0.5));

        for (let x = 0; x < parallaxImageWidth; x += 6 + random() * 14) {
            const radius = 2 + random() * 3;
            const groundY = getGroundY(x) + 1;

            if (random() < 0.6) {
                continue;
            }
            context.fillStyle = shrub.dark;
            context.beginPath();
            context.arc(x + 1, groundY, radius, Math.PI, 0);
            context.fill();
            context.fillStyle = shrub.mid;
            context.beginPath();
            context.arc(x, groundY - 1, radius * 0.75, Math.PI, 0);
            context.fill();
        }
        context.restore();
    }
}

/** Puffy clouds with a darker underside, in the upper part of the image. */
function drawClouds({ context, layer, seed }: LayerContext) {
    const random = createRandom(seed);
    const shade = layer.color2 ?? mixColors(layer.color, '#5a6a80', 0.25);

    for (let cloud = 0; cloud < (layer.count ?? 9); cloud++) {
        const centerX = random() * parallaxImageWidth;
        const centerY = parallaxImageHeight * (0.25 + random() * 0.5);
        const size = 18 + random() * 30;
        const puffs = 4 + Math.floor(random() * 4);
        const circles: [number, number, number][] = [];

        for (let puff = 0; puff < puffs; puff++) {
            const middle = 1 - Math.abs(puff - (puffs - 1) / 2) / puffs;

            circles.push([
                centerX + (puff - puffs / 2) * size * 0.8,
                centerY - middle * size * 0.4 + (random() - 0.5) * size * 0.3,
                size * (0.5 + middle * 0.4 + random() * 0.2)
            ]);
        }
        for (const [color, shift] of [
            [shade, size * 0.18],
            [layer.color, 0]
        ] as const) {
            context.fillStyle = color;
            for (const [x, y, radius] of circles) {
                for (const offset of [-parallaxImageWidth, 0, parallaxImageWidth]) {
                    context.beginPath();
                    context.arc(x + offset, y + shift, radius, 0, Math.PI * 2);
                    context.fill();
                }
            }
        }
    }
}

function drawStars({ context, layer, seed }: LayerContext) {
    const random = createRandom(seed);

    context.fillStyle = layer.color;
    for (let star = 0; star < 220; star++) {
        const size = random() < 0.1 ? 2 : 1;

        context.globalAlpha = 0.3 + random() * 0.6;
        context.fillRect(
            Math.floor(random() * parallaxImageWidth),
            Math.floor(random() * parallaxImageHeight),
            size,
            size
        );
    }
    context.globalAlpha = 1;
}

function getLayerImage(layer: BackgroundLayer, seed: number, hazeColor: string): LayerImage {
    const key = `${seed}:${hazeColor}:${JSON.stringify(layer)}`;
    const cached = imageCache.get(key);

    if (cached) {
        return cached;
    }
    const canvas = document.createElement('canvas');

    canvas.width = parallaxImageWidth;
    canvas.height = parallaxImageHeight;
    const image: LayerImage = { canvas, props: [] };
    const layerContext = { context: canvas.getContext('2d')!, layer, seed, hazeColor, props: image.props };

    switch (layer.type) {
        case 'mountains':
            drawRidge(layerContext, 6, 5);
            break;
        case 'hills':
            drawRidge(layerContext, 3, 2);
            break;
        case 'cacti':
            drawCacti(layerContext);
            break;
        case 'clouds':
            drawClouds(layerContext);
            break;
        case 'stars':
            drawStars(layerContext);
            break;
        default:
            break;
    }
    if (imageCache.size >= imageCacheLimit) {
        imageCache.clear();
    }
    imageCache.set(key, image);

    return image;
}

/** Calls `draw` with the left edge of every copy of a repeating layer that is (partly) on screen. */
function forEachCopy(scroll: number, viewWidth: number, draw: (left: number) => void) {
    for (let left = -wrap(scroll, parallaxImageWidth); left < viewWidth; left += parallaxImageWidth) {
        draw(left);
    }
}

function drawProps(context: CanvasRenderingContext2D, props: LayerProp[], left: number, top: number, time: number) {
    for (const prop of props) {
        const x = left + prop.x;
        const y = top + prop.y;

        if (prop.kind === 'blades') {
            context.strokeStyle = prop.color;
            context.lineWidth = 2.5;
            context.beginPath();
            for (let blade = 0; blade < 4; blade++) {
                const angle = time * 1.3 + (blade * Math.PI) / 2 + prop.x;

                context.moveTo(x, y);
                context.lineTo(x + Math.cos(angle) * prop.size, y + Math.sin(angle) * prop.size);
            }
            context.stroke();
        } else if (wrap(time + prop.x * 0.01, 1.6) < 0.5) {
            const glow = context.createRadialGradient(x, y, 0, x, y, 9);

            glow.addColorStop(0, 'rgba(255, 70, 50, 0.9)');
            glow.addColorStop(1, 'rgba(255, 70, 50, 0)');
            context.fillStyle = glow;
            context.fillRect(x - 9, y - 9, 18, 18);
        }
    }
}

function drawSunOrMoon(context: CanvasRenderingContext2D, layer: BackgroundLayer, x: number, y: number) {
    const size = layer.size ?? 24;
    const glowColor = layer.color2 ?? layer.color;
    const glowRadius = size * (layer.type === 'sun' ? 7 : 5);
    const glow = context.createRadialGradient(x, y, size * 0.6, x, y, glowRadius);

    glow.addColorStop(0, withAlpha(glowColor, layer.type === 'sun' ? 0.6 : 0.3));
    glow.addColorStop(1, withAlpha(glowColor, 0));
    context.fillStyle = glow;
    context.fillRect(x - glowRadius, y - glowRadius, glowRadius * 2, glowRadius * 2);
    context.fillStyle = layer.color;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
    if (layer.type === 'moon') {
        context.fillStyle = mixColors(layer.color, '#7a7f90', 0.35);
        for (const [offsetX, offsetY, radius] of [
            [-0.35, -0.2, 0.22],
            [0.3, 0.25, 0.16],
            [0.1, -0.45, 0.1],
            [-0.15, 0.45, 0.12]
        ]) {
            context.beginPath();
            context.arc(x + offsetX * size, y + offsetY * size, radius * size, 0, Math.PI * 2);
            context.fill();
        }
    }
}

/** A few bright stars that twinkle, and now and then a shooting star. */
function drawTwinkles(context: CanvasRenderingContext2D, layer: BackgroundLayer, seed: number, view: ParallaxView) {
    const random = createRandom(seed + 5);
    const scroll = view.scrollX * layer.factor;

    context.fillStyle = layer.color;
    for (let star = 0; star < 36; star++) {
        const starX = random() * parallaxImageWidth;
        const y = random() * view.height * 0.6;
        const phase = random() * 10;
        const rate = 1 + random() * 2.5;
        const brightness = 0.5 + 0.5 * Math.sin(view.time * rate + phase);

        context.globalAlpha = 0.15 + 0.85 * brightness;
        forEachCopy(scroll, view.width, (left) => {
            const x = Math.round(left + starX);

            context.fillRect(x - 1, y, 3, 1);
            context.fillRect(x, y - 1, 1, 3);
        });
    }
    context.globalAlpha = 1;

    const period = 7;
    const slot = Math.floor(view.time / period);
    const start = hash2d(slot, 0, seed) * 4;
    const age = view.time - slot * period - start;
    const duration = 0.8;

    if (age < 0 || age > duration || hash2d(slot, 4, seed) < 0.3) {
        return;
    }
    const progress = age / duration;
    const direction = hash2d(slot, 3, seed) < 0.5 ? -1 : 1;
    const headX = hash2d(slot, 1, seed) * view.width + direction * 300 * progress;
    const headY = hash2d(slot, 2, seed) * view.height * 0.3 + 120 * progress;
    const tailX = headX - direction * 70;
    const tailY = headY - 28;
    const streak = context.createLinearGradient(tailX, tailY, headX, headY);

    streak.addColorStop(0, 'rgba(255, 255, 255, 0)');
    streak.addColorStop(1, `rgba(255, 255, 255, ${1 - progress})`);
    context.strokeStyle = streak;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(tailX, tailY);
    context.lineTo(headX, headY);
    context.stroke();
}

/** Muzzle flashes and smoke columns far away: someone else's war on the horizon. */
function drawBattle(
    context: CanvasRenderingContext2D,
    layer: BackgroundLayer,
    seed: number,
    view: ParallaxView,
    base: number
) {
    const sites = 3;
    const smokeColor = layer.color2 ?? '#808080';

    forEachCopy(view.scrollX * layer.factor, view.width, (left) => {
        for (let site = 0; site < sites; site++) {
            const siteX = left + ((site + 0.2 + hash2d(site, 0, seed) * 0.6) * parallaxImageWidth) / sites;
            const wind = hash2d(site, 1, seed) < 0.5 ? -1 : 1;

            for (let puff = 0; puff < 8; puff++) {
                const age = wrap(view.time * 0.06 + puff / 8 + hash2d(site, 2, seed), 1);
                const radius = 4 + age * 22;

                context.fillStyle = withAlpha(smokeColor, 0.4 * (1 - age) * Math.min(1, age * 6));
                context.beginPath();
                context.arc(siteX + wind * age * 50, base - 6 - age * 130, radius, 0, Math.PI * 2);
                context.fill();
            }
            const period = 1.7 + hash2d(site, 3, seed) * 1.5;
            const slot = Math.floor(view.time / period);
            const age = view.time - slot * period;

            if (age < 0.35 && hash2d(slot, site, seed) < 0.6) {
                const strength = 1 - age / 0.35;
                const flashX = siteX + (hash2d(slot, site + 9, seed) - 0.5) * 60;
                const glow = context.createRadialGradient(flashX, base - 4, 0, flashX, base - 4, 36);

                glow.addColorStop(0, withAlpha(layer.color, 0.9 * strength));
                glow.addColorStop(1, withAlpha(layer.color, 0));
                context.fillStyle = glow;
                context.fillRect(flashX - 36, base - 40, 72, 72);
            }
        }
    });
}

/** Small flocks flying across, flapping their wings. */
function drawBirds(
    context: CanvasRenderingContext2D,
    layer: BackgroundLayer,
    seed: number,
    view: ParallaxView,
    base: number
) {
    const span = view.width + 400;

    context.strokeStyle = layer.color;
    context.lineWidth = 1.5;
    context.beginPath();
    for (let flock = 0; flock < (layer.count ?? 3); flock++) {
        const direction = hash2d(flock, 0, seed) < 0.5 ? -1 : 1;
        const speed = 18 + hash2d(flock, 1, seed) * 22;
        const flockX =
            wrap(hash2d(flock, 2, seed) * span + view.time * speed * direction - view.scrollX * layer.factor, span) -
            200;
        const flockY =
            base - parallaxImageHeight * (0.4 + hash2d(flock, 3, seed) * 0.35) + Math.sin(view.time * 0.5 + flock) * 10;
        const birds = 3 + Math.floor(hash2d(flock, 4, seed) * 4);

        for (let bird = 0; bird < birds; bird++) {
            const rank = Math.ceil(bird / 2) * (bird % 2 === 0 ? 1 : -1);
            const x = flockX - direction * Math.abs(rank) * 14;
            const y = flockY + rank * 8;
            const flap = Math.sin(view.time * 9 + bird * 1.7 + flock) * 3;

            context.moveTo(x - 5, y - flap);
            context.quadraticCurveTo(x - 2, y - 1, x, y);
            context.quadraticCurveTo(x + 2, y - 1, x + 5, y - flap);
        }
    }
    context.stroke();
}

function drawSnowfall(context: CanvasRenderingContext2D, layer: BackgroundLayer, seed: number, view: ParallaxView) {
    const height = view.height + 20;

    context.fillStyle = layer.color;
    for (let flake = 0; flake < (layer.count ?? 150); flake++) {
        const depth = 0.4 + hash2d(flake, 0, seed) * 0.6;
        const fall = view.time * (18 + depth * 30);
        const y = wrap(hash2d(flake, 1, seed) * height + fall, height) - 10;
        const sway = Math.sin(view.time * 0.8 + flake) * 12 * depth;
        const x = wrap(hash2d(flake, 2, seed) * view.width + sway + view.time * 10 - view.scrollX * 0.5, view.width);
        const size = depth * 2.6;

        context.globalAlpha = 0.4 + depth * 0.5;
        context.fillRect(x, y, size, size);
    }
    context.globalAlpha = 1;
}

/** Slanted rain, and lightning that lights up the whole sky and sometimes draws a bolt. */
function drawRain(
    context: CanvasRenderingContext2D,
    layer: BackgroundLayer,
    seed: number,
    view: ParallaxView,
    base: number
) {
    const height = view.height + 40;

    context.strokeStyle = withAlpha(layer.color, 0.35);
    context.lineWidth = 1;
    context.beginPath();
    for (let drop = 0; drop < (layer.count ?? 200); drop++) {
        const speed = 420 + hash2d(drop, 0, seed) * 200;
        const y = wrap(hash2d(drop, 1, seed) * height + view.time * speed, height) - 20;
        const x = wrap(hash2d(drop, 2, seed) * view.width - y * 0.25 - view.scrollX * 0.5, view.width);

        context.moveTo(x, y);
        context.lineTo(x - 4, y + 14);
    }
    context.stroke();
    if (!layer.lightning) {
        return;
    }
    const period = 6;
    const slot = Math.floor(view.time / period);
    const age = view.time - slot * period - hash2d(slot, 0, seed) * 3;

    if (age < 0 || age > 0.6 || hash2d(slot, 1, seed) < 0.35) {
        return;
    }
    const flash = age < 0.08 ? 0.55 : age < 0.14 ? 0.1 : age < 0.24 ? 0.4 : 0.4 * (1 - (age - 0.24) / 0.36);

    context.fillStyle = `rgba(220, 230, 255, ${flash})`;
    context.fillRect(0, 0, view.width, view.height);
    if (age < 0.24) {
        let x = hash2d(slot, 2, seed) * view.width;
        let y = 0;

        context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(x, y);
        for (let segment = 0; y < base - 40; segment++) {
            x += (hash2d(slot, segment + 3, seed) - 0.5) * 50;
            y += 20 + hash2d(slot, segment + 40, seed) * 25;
            context.lineTo(x, y);
        }
        context.stroke();
    }
}

/**
 * Draws the level background over the whole view. Every layer's ground line sits on the level's horizon when the
 * camera looks straight at it; when the camera moves up or down, far layers (small `factor`) follow less.
 */
export function drawParallax(context: CanvasRenderingContext2D, background: LevelBackground, view: ParallaxView) {
    const layers = backgroundPresets[background.preset];
    const sky = layers.find((layer) => layer.type === 'sky');
    const hazeColor = sky?.color2 ?? sky?.color ?? '#ffffff';
    const haze = sky?.haze ?? 0.5;
    const resting = view.height * restingHorizon;
    const getBase = (factor: number) => resting + (view.horizonY - resting) * factor;

    layers.forEach((layer, index) => {
        const seed = background.seed * 31 + index;
        const base = getBase(layer.factor);

        context.globalAlpha = layer.opacity ?? 1;
        switch (layer.type) {
            case 'sky': {
                const skyBottom = Math.min(view.height * 1.2, Math.max(view.height * 0.3, getBase(0.1)));
                const gradient = context.createLinearGradient(0, 0, 0, skyBottom);

                gradient.addColorStop(0, layer.color);
                gradient.addColorStop(1, hazeColor);
                context.fillStyle = gradient;
                context.fillRect(0, 0, view.width, view.height);
                break;
            }
            case 'sun':
            case 'moon':
                drawSunOrMoon(
                    context,
                    layer,
                    view.width * (layer.x ?? 0.5) - view.scrollX * layer.factor * 0.1,
                    base - (layer.height ?? 0.7) * parallaxImageHeight
                );
                break;
            case 'battle':
                drawBattle(context, layer, seed, view, base - battleLift);
                break;
            case 'birds':
                drawBirds(context, layer, seed, view, base);
                break;
            case 'snowfall':
                drawSnowfall(context, layer, seed, view);
                break;
            case 'rain':
                drawRain(context, layer, seed, view, base);
                break;
            default: {
                const image = getLayerImage(layer, seed, hazeColor);
                const top = Math.round(base - parallaxImageHeight);
                const scroll = view.scrollX * layer.factor - view.time * (layer.drift ?? 0);

                // Stars fill the whole sky, so their image also repeats upwards.
                const tops =
                    layer.type === 'stars' ? [top, top - parallaxImageHeight, top - 2 * parallaxImageHeight] : [top];

                forEachCopy(scroll, view.width, (left) => {
                    for (const imageTop of tops) {
                        context.drawImage(image.canvas, Math.round(left), imageTop);
                    }
                    drawProps(context, image.props, Math.round(left), top, view.time);
                });
                if (layer.type === 'stars') {
                    drawTwinkles(context, layer, seed, view);
                }
                if (!groundedLayers.has(layer.type)) {
                    break;
                }
                const imageBottom = top + parallaxImageHeight;

                if (imageBottom < view.height) {
                    // The ground below the layer darkens with depth, so it does not read as one flat band.
                    const ground = layer.color2 ?? layer.color;
                    const gradient = context.createLinearGradient(0, imageBottom, 0, imageBottom + 240);

                    gradient.addColorStop(0, ground);
                    gradient.addColorStop(1, mixColors(ground, '#000000', 0.35));
                    context.fillStyle = gradient;
                    context.fillRect(0, imageBottom, view.width, view.height - imageBottom);
                }
                // Far layers fade into the sky towards their foot, so the scene gets depth.
                const fogHeight = (layer.height ?? 0.3) * parallaxImageHeight * 0.8;
                const fog = context.createLinearGradient(0, base - fogHeight, 0, base);

                fog.addColorStop(0, withAlpha(hazeColor, 0));
                fog.addColorStop(1, withAlpha(hazeColor, haze * (1 - layer.factor)));
                context.fillStyle = fog;
                context.fillRect(0, base - fogHeight, view.width, view.height - base + fogHeight);
                break;
            }
        }
        context.globalAlpha = 1;
    });
}

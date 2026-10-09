import { materialIds } from './materials.ts';

export type BackgroundLayerType =
    | 'sky'
    | 'stars'
    | 'sun'
    | 'moon'
    | 'clouds'
    | 'mountains'
    | 'battle'
    | 'hills'
    | 'birds'
    | 'cacti'
    | 'snowfall'
    | 'rain';

/** One generated parallax layer. Layers are drawn back to front. */
export type BackgroundLayer = {
    type: BackgroundLayerType;
    /** How fast the layer scrolls compared to the level: 0 stays fixed on screen, 1 moves with the tiles. */
    factor: number;
    color: string;
    /** Second gradient color (sky at the horizon, silhouette base, sun glow). */
    color2?: string;
    /** Silhouette height (or the sun's and moon's height above the horizon) as a fraction of the layer image height. */
    height?: number;
    opacity?: number;
    /** Sky only: how strongly the sky color at the horizon fogs the layers far away, 0 to 1. */
    haze?: number;
    /** Sun and moon: horizontal position as a fraction of the view width. */
    x?: number;
    /** Sun and moon: disc radius in screen pixels. */
    size?: number;
    /** Clouds: horizontal drift in screen pixels per second. */
    drift?: number;
    /** Clouds, birds, rain and snow: how many there are. */
    count?: number;
    /** Ridges: a lighter line along the top edge. */
    rim?: string;
    /** Mountains: snow on peaks above this fraction of the layer height. */
    snowLine?: number;
    /** Mountains: tops are cut flat above this fraction of the noise range, giving mesas. */
    plateau?: number;
    /** Hills: windmills, towers and radio masts stand on the ridge. */
    landmarks?: boolean;
    /** Ridges: a line of small, distant trees along the top, in clumps. */
    treeline?: 'pine' | 'round' | 'mixed';
    /** The treeline's color; a darker version of `color2` by default. */
    treeColor?: string;
    /** Rain: lightning lights up the sky now and then. */
    lightning?: boolean;
};

/** Stored in level files: only append, never rename or remove. */
export const backgroundPresetNames = ['day', 'dusk', 'night', 'dawn', 'autumn', 'desert', 'snow', 'storm'] as const;

export type BackgroundPreset = (typeof backgroundPresetNames)[number];

/** What a level stores about its background. The layers come from the preset; the seed varies their shapes. */
export type LevelBackground = { preset: BackgroundPreset; seed: number };

export const backgroundPresets: Record<BackgroundPreset, BackgroundLayer[]> = {
    day: [
        { type: 'sky', factor: 0, color: '#3d9be9', color2: '#cfeeff', haze: 0.5 },
        { type: 'sun', factor: 0.02, color: '#fffbe0', color2: '#fff4b0', x: 0.78, height: 0.85, size: 26 },
        { type: 'clouds', factor: 0.08, color: '#ffffff', opacity: 0.9, drift: 6, count: 9 },
        {
            type: 'mountains',
            factor: 0.2,
            color: '#7f9cc4',
            color2: '#b4c9e2',
            height: 0.62,
            snowLine: 0.78,
            rim: '#c8d8ec'
        },
        { type: 'battle', factor: 0.3, color: '#ffd27a', color2: '#9aa3ad' },
        {
            type: 'hills',
            factor: 0.45,
            color: '#6cc46f',
            color2: '#3f9a52',
            height: 0.32,
            rim: '#9be08f',
            landmarks: true,
            treeline: 'mixed',
            treeColor: '#3f8a4a'
        },
        { type: 'birds', factor: 0.5, color: '#2d3b4f', count: 3 }
    ],
    dusk: [
        { type: 'sky', factor: 0, color: '#241a4f', color2: '#ff8a5c', haze: 0.55 },
        { type: 'sun', factor: 0.02, color: '#ffe0a0', color2: '#ff7a3d', x: 0.32, height: 0.24, size: 34 },
        { type: 'clouds', factor: 0.08, color: '#ffb08a', opacity: 0.55, drift: 4, count: 7 },
        { type: 'mountains', factor: 0.2, color: '#6a3f78', color2: '#b0657e', height: 0.6, rim: '#e88a7a' },
        { type: 'battle', factor: 0.3, color: '#ffc06a', color2: '#5a3a55' },
        {
            type: 'hills',
            factor: 0.45,
            color: '#4a2f5c',
            color2: '#35243f',
            height: 0.3,
            rim: '#9a5070',
            landmarks: true,
            treeline: 'mixed',
            treeColor: '#2e2040'
        },
        { type: 'birds', factor: 0.5, color: '#1d1426', count: 2 }
    ],
    night: [
        { type: 'sky', factor: 0, color: '#04061a', color2: '#1f3266', haze: 0.35 },
        { type: 'stars', factor: 0.02, color: '#ffffff' },
        { type: 'moon', factor: 0.02, color: '#f1f0dc', color2: '#9fb4ff', x: 0.72, height: 0.78, size: 22 },
        { type: 'mountains', factor: 0.2, color: '#1e2a52', color2: '#2c3c70', height: 0.6, snowLine: 0.8 },
        { type: 'battle', factor: 0.3, color: '#ffb35a', color2: '#2b3150' },
        {
            type: 'hills',
            factor: 0.45,
            color: '#152043',
            color2: '#10182f',
            height: 0.3,
            rim: '#2c3f78',
            landmarks: true,
            treeline: 'pine',
            treeColor: '#0e1630'
        }
    ],
    dawn: [
        { type: 'sky', factor: 0, color: '#7fa6e0', color2: '#ffd2b0', haze: 0.7 },
        { type: 'sun', factor: 0.02, color: '#fff6e0', color2: '#ffb88a', x: 0.2, height: 0.3, size: 30 },
        { type: 'clouds', factor: 0.08, color: '#ffe4f0', opacity: 0.7, drift: 3, count: 6 },
        { type: 'mountains', factor: 0.2, color: '#9a8fbf', color2: '#d8b8c8', height: 0.58, snowLine: 0.76 },
        { type: 'battle', factor: 0.3, color: '#ffd8a0', color2: '#b8a8b8' },
        {
            type: 'hills',
            factor: 0.45,
            color: '#7aa77c',
            color2: '#58875f',
            height: 0.3,
            rim: '#c8e0a8',
            treeline: 'mixed',
            treeColor: '#4f7a56'
        },
        { type: 'birds', factor: 0.5, color: '#4a4058', count: 4 }
    ],
    autumn: [
        { type: 'sky', factor: 0, color: '#5a9ad8', color2: '#f2e3c4', haze: 0.5 },
        { type: 'sun', factor: 0.02, color: '#fff2cc', color2: '#ffd98a', x: 0.65, height: 0.7, size: 24 },
        { type: 'clouds', factor: 0.08, color: '#fff8ee', opacity: 0.85, drift: 8, count: 8 },
        { type: 'mountains', factor: 0.2, color: '#8c8aa8', color2: '#c4b8b0', height: 0.58, rim: '#d8cfc8' },
        { type: 'battle', factor: 0.3, color: '#ffd27a', color2: '#9a948c' },
        {
            type: 'hills',
            factor: 0.45,
            color: '#c99a45',
            color2: '#9a7034',
            height: 0.32,
            rim: '#e8c070',
            landmarks: true,
            treeline: 'round',
            treeColor: '#b0582c'
        },
        { type: 'birds', factor: 0.5, color: '#3a3030', count: 4 }
    ],
    desert: [
        { type: 'sky', factor: 0, color: '#3f8fd8', color2: '#ffe9c0', haze: 0.6 },
        { type: 'sun', factor: 0.02, color: '#ffffff', color2: '#fff0a8', x: 0.5, height: 0.92, size: 30 },
        { type: 'clouds', factor: 0.08, color: '#ffffff', opacity: 0.5, drift: 5, count: 3 },
        {
            type: 'mountains',
            factor: 0.2,
            color: '#c47a52',
            color2: '#e8b088',
            height: 0.5,
            plateau: 0.62,
            rim: '#f0c098'
        },
        { type: 'battle', factor: 0.3, color: '#ffe0a0', color2: '#c8a888' },
        { type: 'hills', factor: 0.45, color: '#e8b46a', color2: '#d29a55', height: 0.24, rim: '#ffd890' },
        { type: 'birds', factor: 0.5, color: '#4a3020', count: 1 },
        { type: 'cacti', factor: 0.7, color: '#4f7a3a', color2: '#d9a05a', height: 0.12 }
    ],
    snow: [
        { type: 'sky', factor: 0, color: '#8fb0d8', color2: '#eef4fb', haze: 0.7 },
        { type: 'sun', factor: 0.02, color: '#ffffff', color2: '#e8f0ff', x: 0.4, height: 0.6, size: 20, opacity: 0.8 },
        { type: 'clouds', factor: 0.08, color: '#f4f8ff', opacity: 0.8, drift: 5, count: 10 },
        {
            type: 'mountains',
            factor: 0.2,
            color: '#9fb2cf',
            color2: '#d4dfee',
            height: 0.66,
            snowLine: 0.55,
            rim: '#ffffff'
        },
        {
            type: 'hills',
            factor: 0.45,
            color: '#e6eef8',
            color2: '#c8d6e8',
            height: 0.3,
            rim: '#ffffff',
            treeline: 'pine',
            treeColor: '#5d7a7a'
        },
        { type: 'snowfall', factor: 0.8, color: '#ffffff', count: 160 }
    ],
    storm: [
        { type: 'sky', factor: 0, color: '#1f2530', color2: '#6d7684', haze: 0.6 },
        { type: 'clouds', factor: 0.08, color: '#3a414d', opacity: 0.95, drift: 22, count: 16 },
        { type: 'mountains', factor: 0.2, color: '#3c4452', color2: '#5a6370', height: 0.6 },
        { type: 'battle', factor: 0.3, color: '#ffb060', color2: '#4a4f58' },
        {
            type: 'hills',
            factor: 0.45,
            color: '#3a4a3c',
            color2: '#2c3a30',
            height: 0.3,
            landmarks: true,
            treeline: 'mixed',
            treeColor: '#26332a'
        },
        { type: 'rain', factor: 0.8, color: '#b8c4d4', count: 220, lightning: true }
    ]
};

/**
 * The world y (in world pixels, from the top of the level) where the ground typically is: the median of the topmost
 * solid cell in each column. The background puts its horizon there, so mountains and hills stand behind the terrain
 * instead of below it. `terrain` is the level's terrain layer (rows of material ids).
 */
export function getHorizonY(terrain: number[][], tileSize: number): number {
    const height = terrain.length;
    const width = terrain[0]?.length ?? 0;

    if (width === 0) {
        return 0;
    }
    const surfaces: number[] = [];

    for (let x = 0; x < width; x++) {
        let y = 0;

        while (y < height && terrain[y][x] === materialIds.air) {
            y++;
        }
        surfaces.push(y);
    }
    surfaces.sort((a, b) => a - b);

    return surfaces[Math.floor(surfaces.length / 2)] * tileSize;
}

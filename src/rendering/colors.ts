import type { Side } from '../level/level';

/** Player 1 is blue, player 2 red, everywhere in the game and the editor. */
export const sideColors: Record<Side, string> = { left: '#4f8dff', right: '#ff5a4f' };

function parseHexColor(color: string): [number, number, number] {
    const value = parseInt(color.slice(1), 16);

    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Blends two `#rrggbb` colors: `amount` 0 gives `from`, 1 gives `to`. */
export function mixColors(from: string, to: string, amount: number): string {
    const start = parseHexColor(from);
    const end = parseHexColor(to);
    const channels = start.map((channel, index) => Math.round(channel + (end[index] - channel) * amount));

    return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** A `#rrggbb` color as a CSS color with the given opacity. */
export function withAlpha(color: string, alpha: number): string {
    const [red, green, blue] = parseHexColor(color);

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

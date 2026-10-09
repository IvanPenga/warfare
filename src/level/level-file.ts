import type { Level } from './level.ts';

/**
 * Level file content: indented JSON, but with every array of numbers (a row of tiles) on one line, so a level reads
 * like a picture and diffs stay small.
 */
export function serializeLevel(level: Level): string {
    const json = JSON.stringify(level, null, 4).replace(
        /\[\s+(-?\d+(?:,\s+-?\d+)*)\s+\]/g,
        (_, numbers: string) => `[${numbers.split(/,\s+/).join(',')}]`
    );

    return `${json}\n`;
}

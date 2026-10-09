import { parseLevel, type Level } from '../level/level';

export type InvalidFile = { file: string; error: string };

export type LevelListing = {
    items: Level[];
    /** Files that are not valid levels, e.g. a level edited by hand with a mistake. */
    invalid: InvalidFile[];
};

/** Where the editor reads and saves levels. */
export type LevelRepository = {
    listLevels: () => Promise<LevelListing>;
    saveLevel: (level: Level) => Promise<void>;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(body.error ?? `${init?.method ?? 'GET'} ${url} failed (${response.status})`);
    }

    return body;
}

/** Reads and writes the files in src/assets/levels through the dev server (see vite-plugins/level-files-plugin.ts). */
export function createDevServerRepository(): LevelRepository {
    return {
        async listLevels() {
            const listing = await request<{ items: unknown[]; invalid: InvalidFile[] }>('/api/levels');

            return { items: listing.items.map(parseLevel), invalid: listing.invalid };
        },
        async saveLevel(level) {
            await request(`/api/levels/${encodeURIComponent(level.id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(level)
            });
        }
    };
}

/** An in-memory repository for tests. */
export function createMemoryRepository(levels: Level[] = []): LevelRepository & { saved: Level[] } {
    const saved: Level[] = [];

    return {
        saved,
        async listLevels() {
            return { items: [...levels], invalid: [] };
        },
        async saveLevel(level) {
            saved.push(level);
        }
    };
}

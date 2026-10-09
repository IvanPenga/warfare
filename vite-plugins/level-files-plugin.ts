import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { serializeLevel } from '../src/level/level-file.ts';
import { parseLevel, type Level } from '../src/level/level.ts';

const route = '/api/levels';
const idPattern = /^[\w-]+$/;

function readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';

        request.setEncoding('utf8');
        request.on('data', (chunk: string) => (body += chunk));
        request.on('end', () => resolve(body));
        request.on('error', reject);
    });
}

function reply(response: ServerResponse, status: number, body: unknown) {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Every valid level in the folder, and the files that are not valid levels. */
async function readLevels(directory: string) {
    const levels: { file: string; level: Level }[] = [];
    const invalid: { file: string; error: string }[] = [];

    for (const file of (await readdir(directory)).sort()) {
        if (!file.endsWith('.json')) {
            continue;
        }
        try {
            levels.push({ file, level: parseLevel(JSON.parse(await readFile(path.join(directory, file), 'utf8'))) });
        } catch (error) {
            invalid.push({ file, error: getErrorMessage(error) });
        }
    }

    return { levels, invalid };
}

/**
 * Dev-server API that lets the editor read and save levels as JSON files:
 *
 * - `GET /api/levels` lists every level in the folder: `{ items, invalid: [{ file, error }] }`.
 * - `PUT /api/levels/<id>` validates the level and writes it to the file with the same `id`, or to `<id>.json`.
 *
 * Hot reload is skipped for files the API writes, so saving does not reset the editor.
 */
export function levelFilesPlugin(directory: string): Plugin {
    /** Content last written per file, to tell our own writes from edits made outside the editor. */
    const writtenFiles = new Map<string, string>();

    return {
        name: 'level-files',
        apply: 'serve',

        configureServer(server) {
            server.middlewares.use(route, async (request, response) => {
                const id = decodeURIComponent((request.url ?? '').split('?')[0].replace(/^\/+|\/+$/g, ''));

                try {
                    if (request.method === 'GET' && id === '') {
                        const { levels, invalid } = await readLevels(directory);

                        return reply(response, 200, { items: levels.map((entry) => entry.level), invalid });
                    }
                    if (request.method !== 'PUT' || !idPattern.test(id)) {
                        return reply(response, 404, {
                            error: `Use GET ${route} or PUT ${route}/<id> (letters, digits, "-" and "_")`
                        });
                    }
                    let level: Level;

                    try {
                        level = parseLevel(JSON.parse(await readBody(request)));
                    } catch (error) {
                        return reply(response, 400, { error: getErrorMessage(error) });
                    }
                    if (level.id !== id) {
                        return reply(response, 400, { error: `The id in the body must be "${id}"` });
                    }
                    const { levels } = await readLevels(directory);
                    const file = levels.find((entry) => entry.level.id === id)?.file ?? `${id}.json`;
                    const filePath = path.join(directory, file);
                    const content = serializeLevel(level);

                    writtenFiles.set(filePath, content);
                    await writeFile(filePath, content);
                    reply(response, 200, { file: path.relative(server.config.root, filePath) });
                } catch (error) {
                    reply(response, 500, { error: getErrorMessage(error) });
                }
            });
        },

        async hotUpdate({ file, read }) {
            const written = writtenFiles.get(file);

            if (written !== undefined && (await read()) === written) {
                return [];
            }
        }
    };
}

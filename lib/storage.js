import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { ROOM_SCHEMA_VERSION } from './types.js';
export function defaultStorageFile() {
    const dshHome = process.env.DSH_HOME?.trim();
    const root = dshHome && dshHome.length > 0 ? resolve(dshHome) : join(homedir(), '.dsh');
    return join(root, 'agent-team-room', 'rooms.json');
}
function assertRoom(value, index) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`agent-team-room: stored room ${index} is not an object`);
    }
    const room = value;
    if (room.schemaVersion !== ROOM_SCHEMA_VERSION || typeof room.id !== 'string' || typeof room.name !== 'string') {
        throw new Error(`agent-team-room: stored room ${index} has an unsupported schema`);
    }
    if (!Array.isArray(room.members) || !Array.isArray(room.tasks) || !Array.isArray(room.events)) {
        throw new Error(`agent-team-room: stored room ${index} is missing collections`);
    }
}
function parseDocument(raw, file) {
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`agent-team-room: cannot parse storage file ${file}`, { cause: error });
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`agent-team-room: storage file ${file} is not an object`);
    }
    const document = value;
    if (document.schemaVersion !== ROOM_SCHEMA_VERSION || !Array.isArray(document.rooms)) {
        throw new Error(`agent-team-room: storage file ${file} uses an unsupported schema`);
    }
    document.rooms.forEach(assertRoom);
    return document;
}
/** Atomic JSON-file persistence. The runtime serializes calls to save(). */
export class RoomStorage {
    file;
    constructor(file) {
        this.file = file && file.trim().length > 0 ? resolve(file) : defaultStorageFile();
    }
    async load() {
        try {
            const document = parseDocument(await readFile(this.file, 'utf8'), this.file);
            return structuredClone(document.rooms);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return [];
            throw error;
        }
    }
    async save(rooms) {
        const directory = dirname(this.file);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = join(directory, `.rooms.${process.pid}.${randomUUID()}.tmp`);
        const document = {
            schemaVersion: ROOM_SCHEMA_VERSION,
            rooms: structuredClone([...rooms]),
        };
        await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        await rename(temporary, this.file);
    }
}
//# sourceMappingURL=storage.js.map
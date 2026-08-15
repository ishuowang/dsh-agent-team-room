import { type Room } from './types.js';
export declare function defaultStorageFile(): string;
/** Atomic JSON-file persistence with one-shot v1 → v2 migration. */
export declare class RoomStorage {
    readonly file: string;
    migrated: boolean;
    constructor(file?: string);
    load(): Promise<Room[]>;
    save(rooms: readonly Room[]): Promise<void>;
}
//# sourceMappingURL=storage.d.ts.map
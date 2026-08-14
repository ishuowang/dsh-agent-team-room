import { type Room } from './types.js';
export declare function defaultStorageFile(): string;
/** Atomic JSON-file persistence. The runtime serializes calls to save(). */
export declare class RoomStorage {
    readonly file: string;
    constructor(file?: string);
    load(): Promise<Room[]>;
    save(rooms: readonly Room[]): Promise<void>;
}
//# sourceMappingURL=storage.d.ts.map
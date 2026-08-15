import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { RoomMemberProvider } from './member-provider.js';
import { type AttachDshSessionInput, type AttachRoomMemberInput, type BroadcastDelivery, type Room, type RoomEvent, type RoomMember, type RoomSummary } from './types.js';
export * from './types.js';
export * from './member-provider.js';
export { RoomStorage, defaultStorageFile } from './storage.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        rooms: RoomRuntime;
    }
}
export interface Config {
    /** JSON persistence path. Empty uses $DSH_HOME/agent-team-room/rooms.json. */
    storageFile?: string;
    /** Hard membership ceiling, including the leader and in-flight reservations. */
    maxMembersPerRoom: number;
    /** Maximum direct/broadcast message length. */
    maxMessageChars: number;
    /** Maximum retained metadata events per room. Oldest events are discarded first. */
    maxEventsPerRoom: number;
}
export declare const Config: z<Config>;
/** Thin durable Room coordinator exposed as ctx.rooms. */
export default class RoomRuntime extends Service {
    private readonly config;
    static inject: string[];
    static Config: z<Config>;
    private readonly storage;
    private readonly roomsById;
    private readonly providers;
    private readonly reservations;
    private readonly busyRooms;
    private readonly listeners;
    private persistQueue;
    constructor(ctx: Context, config: Config);
    [Service.init](): Promise<void>;
    subscribe(listener: (roomId: string) => void): () => void;
    /** Register one trusted Host-side member transport. Duplicate ids fail closed. */
    registerMemberProvider(provider: RoomMemberProvider): () => void;
    listMemberProviders(): string[];
    createRoom(parent: Agent, input: {
        name: string;
        topic?: string;
    }): Promise<Room>;
    listRooms(parent: Agent, includeClosed?: boolean): RoomSummary[];
    /** Read-only native UI projection for rooms in which one Session participates. */
    listRoomsForSession(sessionId: string, includeClosed?: boolean): Room[];
    getRoom(parent: Agent, roomId: string): Room;
    roomHistory(parent: Agent, roomId: string, limit?: number): RoomEvent[];
    /**
     * Prepare and commit one provider-backed member. Capacity is reserved before
     * the provider runs, so concurrent invitations cannot orphan extra Sessions.
     */
    attachMember(parent: Agent, roomId: string, input: AttachRoomMemberInput, signal: AbortSignal): Promise<RoomMember>;
    attachSession(parent: Agent, roomId: string, input: AttachDshSessionInput, signal: AbortSignal): Promise<RoomMember>;
    sendMessage(parent: Agent, roomId: string, targetMemberId: string, message: string, signal: AbortSignal): Promise<{
        deliveryId: string;
    }>;
    broadcast(parent: Agent, roomId: string, message: string, signal: AbortSignal): Promise<BroadcastDelivery[]>;
    removeMember(parent: Agent, roomId: string, memberId: string, interruptRunning?: boolean): Promise<RoomMember>;
    closeRoom(parent: Agent, roomId: string, input: {
        summary?: string;
        interruptRunning?: boolean;
    }): Promise<Room>;
    private dshSessionProvider;
    private requiredProvider;
    private room;
    private ownedRoom;
    private openOwnedRoom;
    private leader;
    private activeMember;
    private acquireRoomOperation;
    private releaseRoomOperation;
    private reserve;
    private releaseReservation;
    private appendEvent;
    private copy;
    private changed;
    private notify;
    private persist;
    private recoverInterruptedState;
    private trimLoadedEvents;
    private onSubagentStart;
    private onSubagentEnd;
    private updateDshMemberLifecycle;
}
//# sourceMappingURL=index.d.ts.map
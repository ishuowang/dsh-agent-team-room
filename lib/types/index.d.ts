import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type AddAgentInput, type BroadcastDelivery, type Room, type RoomEvent, type RoomMember, type RoomSummary, type RoomTask, type WaitResult } from './types.js';
export * from './types.js';
export { RoomStorage, defaultStorageFile } from './storage.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        rooms: RoomRuntime;
    }
}
export interface Config {
    /** Continuable subagent provider used for newly created room members. */
    provider: string;
    /** JSON persistence path. Empty uses $DSH_HOME/agent-team-room/rooms.json. */
    storageFile?: string;
    /** Hard room membership ceiling, including the leader. */
    maxMembersPerRoom: number;
    /** Maximum direct/broadcast/task instruction length. */
    maxMessageChars: number;
    /** Maximum assistant result text persisted in room state. */
    maxResultChars: number;
    /** Maximum retained events per room. Oldest events are discarded first. */
    maxEventsPerRoom: number;
    /** Maximum tracked tasks retained in one room. */
    maxTasksPerRoom: number;
}
export declare const Config: z<Config>;
/** Durable room coordinator exposed as ctx.rooms. */
export default class RoomRuntime extends Service {
    private readonly config;
    static inject: string[];
    static Config: z<Config>;
    private readonly storage;
    private readonly roomsById;
    private readonly listeners;
    private persistQueue;
    constructor(ctx: Context, config: Config);
    [Service.init](): Promise<void>;
    subscribe(listener: (roomId: string) => void): () => void;
    createRoom(parent: Agent, input: {
        name: string;
        objective: string;
    }): Promise<Room>;
    listRooms(parent: Agent, includeClosed?: boolean): RoomSummary[];
    /** Dashboard-only inventory. It contains no storage path or hidden Agent transcript. */
    listAllRooms(includeClosed?: boolean): RoomSummary[];
    getRoom(parent: Agent, roomId: string): Room;
    getRoomForDashboard(roomId: string): Room;
    roomHistory(parent: Agent, roomId: string, limit?: number): RoomEvent[];
    getTask(parent: Agent, roomId: string, taskId: string): RoomTask;
    addAgent(parent: Agent, roomId: string, input: AddAgentInput, signal: AbortSignal): Promise<RoomMember>;
    sendMessage(parent: Agent, roomId: string, targetAgentId: string, message: string, signal: AbortSignal): Promise<{
        messageId: string;
    }>;
    broadcast(parent: Agent, roomId: string, message: string, signal: AbortSignal): Promise<BroadcastDelivery[]>;
    assignTask(parent: Agent, roomId: string, input: {
        assigneeAgentId: string;
        title: string;
        instructions: string;
    }, signal: AbortSignal): Promise<RoomTask>;
    completeTask(reporter: Agent, roomId: string, taskId: string, input: {
        status: 'completed' | 'failed';
        report: string;
    }): Promise<RoomTask>;
    removeAgent(parent: Agent, roomId: string, agentId: string, interruptRunning?: boolean): Promise<RoomMember>;
    closeRoom(parent: Agent, roomId: string, input: {
        summary?: string;
        interruptRunning?: boolean;
    }): Promise<Room>;
    waitForTasks(parent: Agent, roomId: string, taskIds: readonly string[] | undefined, timeoutMs: number, signal: AbortSignal): Promise<WaitResult>;
    private followup;
    private room;
    private ownedRoom;
    private openOwnedRoom;
    private activeAgentMember;
    private assertMemberCapacity;
    private appendEvent;
    private cancelMemberTask;
    private copy;
    private changed;
    private persist;
    private recoverInterruptedState;
    private trimLoadedEvents;
    private onSubagentStart;
    private onSubagentEnd;
}
//# sourceMappingURL=index.d.ts.map
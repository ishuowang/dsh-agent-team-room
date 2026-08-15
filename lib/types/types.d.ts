/** Serializable room contracts shared by the host service, tools, and dashboard. */
export declare const ROOM_SCHEMA_VERSION: 1;
export type RoomStatus = 'open' | 'closed';
export type RoomMemberStatus = 'leader' | 'starting' | 'working' | 'idle' | 'interrupted' | 'error' | 'removed';
export type RoomTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type RoomEventType = 'room.created' | 'room.closed' | 'member.joined' | 'member.left' | 'member.started' | 'member.settled' | 'message.direct' | 'message.broadcast' | 'task.assigned' | 'task.completed' | 'task.failed' | 'task.cancelled' | 'system.recovered';
export interface RoomMember {
    /** Durable DSH Session id. The leader uses the owning parent Session id. */
    agentId: string;
    kind: 'leader' | 'agent';
    name: string;
    role: string;
    provider?: string;
    model?: string;
    status: RoomMemberStatus;
    joinedAt: string;
    updatedAt: string;
    activeTaskId?: string;
    lastResult?: string;
}
export interface RoomTask {
    id: string;
    title: string;
    instructions: string;
    assigneeAgentId: string;
    status: RoomTaskStatus;
    createdAt: string;
    updatedAt: string;
    messageId?: string;
    result?: string;
    error?: string;
}
export interface RoomEvent {
    id: string;
    type: RoomEventType;
    at: string;
    actorAgentId?: string;
    targetAgentId?: string;
    taskId?: string;
    message: string;
}
/** Optional provenance for a room expanded from a built-in scenario template. */
export interface RoomTemplateRef {
    id: string;
    name: string;
    version: number;
}
export interface Room {
    schemaVersion: typeof ROOM_SCHEMA_VERSION;
    id: string;
    name: string;
    objective: string;
    leaderAgentId: string;
    status: RoomStatus;
    revision: number;
    createdAt: string;
    updatedAt: string;
    closedAt?: string;
    summary?: string;
    template?: RoomTemplateRef;
    members: RoomMember[];
    tasks: RoomTask[];
    events: RoomEvent[];
}
export interface RoomSummary {
    id: string;
    name: string;
    objective: string;
    status: RoomStatus;
    revision: number;
    memberCount: number;
    activeMemberCount: number;
    openTaskCount: number;
    template?: RoomTemplateRef;
    createdAt: string;
    updatedAt: string;
}
export interface PersistedRoomDocument {
    schemaVersion: typeof ROOM_SCHEMA_VERSION;
    rooms: Room[];
}
export interface AddAgentInput {
    agentId?: string;
    name: string;
    role: string;
    provider?: string;
    modelProvider?: string;
    model?: string;
    systemPrompt?: string;
}
export interface BroadcastDelivery {
    agentId: string;
    messageId?: string;
    error?: string;
}
export interface WaitResult {
    completed: boolean;
    timedOut: boolean;
    tasks: RoomTask[];
}
export declare function isTerminalTask(status: RoomTaskStatus): boolean;
export declare function roomSummary(room: Room): RoomSummary;
//# sourceMappingURL=types.d.ts.map
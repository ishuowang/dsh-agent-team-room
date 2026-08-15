import type { JsonValue } from '@deepseek-ai/dsh-session';
/** Serializable Room contracts shared by the host, adapters, tools, and native UI. */
export declare const ROOM_SCHEMA_VERSION: 2;
export declare const DSH_SESSION_MEMBER_PROVIDER: "dsh-session";
export declare const DSH_SESSION_MEMBER_PROTOCOL: "dsh.session/v1";
export declare const ROLEHUB_ROLE_API_VERSION: "rolehub.dev/v1alpha1";
export type RoomStatus = 'open' | 'closed';
export type RoomMemberStatus = 'leader' | 'working' | 'idle' | 'interrupted' | 'error' | 'removed';
export type RoomEventType = 'room.created' | 'room.closed' | 'member.joined' | 'member.left' | 'member.started' | 'member.settled' | 'message.direct' | 'message.broadcast' | 'system.recovered' | 'system.migrated';
/**
 * Provider-neutral profile reference carried with a member. Room stores provenance but
 * does not load, install, or execute the referenced role.
 */
export interface RoomMemberProfileRef {
    apiVersion: string;
    kind: string;
    id: string;
    version?: string;
    digest?: string;
}
/** Exact RoleHub profile-reference shape accepted from an independent, trusted bridge. */
export interface RoleHubRoleRef extends RoomMemberProfileRef {
    apiVersion: typeof ROLEHUB_ROLE_API_VERSION;
    kind: 'AgentRole';
    version: string;
    digest: `sha256:${string}`;
}
/** Opaque, provider-owned address persisted by Room for later delivery. */
export interface RoomMemberConnection {
    providerId: string;
    protocol: string;
    address: JsonValue;
    /** Optional backing DSH Session used only for navigation and lifecycle hints. */
    sessionId?: string;
}
export interface RoomMember {
    memberId: string;
    kind: 'leader' | 'member';
    name: string;
    connection: RoomMemberConnection;
    profile?: RoomMemberProfileRef;
    status: RoomMemberStatus;
    joinedAt: string;
    updatedAt: string;
}
export interface RoomEvent {
    id: string;
    type: RoomEventType;
    at: string;
    actorMemberId?: string;
    targetMemberId?: string;
    message: string;
}
export interface Room {
    schemaVersion: typeof ROOM_SCHEMA_VERSION;
    id: string;
    name: string;
    topic?: string;
    leaderSessionId: string;
    status: RoomStatus;
    revision: number;
    createdAt: string;
    updatedAt: string;
    closedAt?: string;
    summary?: string;
    members: RoomMember[];
    events: RoomEvent[];
}
export interface RoomSummary {
    id: string;
    name: string;
    topic?: string;
    leaderSessionId: string;
    status: RoomStatus;
    revision: number;
    memberCount: number;
    activeMemberCount: number;
    roleHubMemberCount: number;
    createdAt: string;
    updatedAt: string;
}
export interface PersistedRoomDocument {
    schemaVersion: typeof ROOM_SCHEMA_VERSION;
    rooms: Room[];
}
/** Provider-specific descriptor accepted only by trusted Host integrations. */
export interface AttachRoomMemberInput {
    providerId: string;
    descriptor: JsonValue;
    name?: string;
    profile?: RoomMemberProfileRef;
}
/**
 * Public convenience input for attaching an existing continuable DSH Session.
 * `profile` is optional provider-neutral provenance; it never grants authority.
 */
export interface AttachDshSessionInput {
    sessionId: string;
    name?: string;
    profile?: RoomMemberProfileRef;
}
export interface RoomMemberAttachment {
    name: string;
    connection: Omit<RoomMemberConnection, 'providerId'>;
    profile?: RoomMemberProfileRef;
    initialStatus?: Exclude<RoomMemberStatus, 'leader' | 'removed'>;
    /** Provider-owned compensation when Room cannot commit the prepared member. */
    rollback?: () => Promise<void>;
}
export interface BroadcastDelivery {
    memberId: string;
    deliveryId?: string;
    error?: string;
}
export declare function roomSummary(room: Room): RoomSummary;
//# sourceMappingURL=types.d.ts.map
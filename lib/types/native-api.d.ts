import type { IncomingMessage } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import { type NativeRoomConversation } from './conversation.js';
import { type Room, type RoomEvent } from './types.js';
export declare const name = "agent-team-room-native-api";
export declare const inject: string[];
export declare const ROOM_NATIVE_API_PREFIX = "/agent-team-room/api/session/";
export declare const ROOM_NATIVE_CLIENT_HEADER = "x-agent-team-room-client";
export declare const ROOM_CONVERSATION_CACHE_MS = 2500;
/** Browser hardening only; deployments still need origin authentication. */
export declare function isSameSiteRead(req: Pick<IncomingMessage, 'headers'>): boolean;
export declare function isNativeRoomClient(req: Pick<IncomingMessage, 'headers'>): boolean;
/** Whitelist only the fields rendered by the native client. */
export declare function nativeRoomView(room: Room, includeActivity?: boolean): {
    activity?: {
        label: string;
        relayId?: string;
        acceptedCount?: number;
        failedCount?: number;
        targetMemberId?: string;
        actorMemberId?: string;
        id: string;
        type: import("./types.js").RoomEventType;
        at: string;
    }[];
    leaderSessionId: string;
    status: import("./types.js").RoomStatus;
    members: {
        status: import("./types.js").RoomMemberStatus;
        profile?: {
            version?: string;
            apiVersion: string;
            kind: string;
            id: string;
        };
        memberId: string;
        kind: "leader" | "member";
        name: string;
        connection: {
            sessionId?: string;
            protocol: string;
        };
    }[];
    topic?: string;
    id: string;
    name: string;
};
/** Metadata-only copy for lifecycle rows; arbitrary stored summaries stay private. */
export declare function nativeActivityLabel(room: Room, event: RoomEvent): string;
/** Read-through projection: Room stores correlation only; DSH Session logs keep message bodies. */
export declare function nativeRoomConversation(ctx: Context, room: Room): Promise<NativeRoomConversation>;
/**
 * Read-only snapshot transport for the native DSH UI. All mutations still go
 * through Agent-scoped `/room` commands and repeat Room ownership checks.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=native-api.d.ts.map
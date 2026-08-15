import type { IncomingMessage } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import type { Room } from './types.js';
export declare const name = "agent-team-room-native-api";
export declare const inject: string[];
export declare const ROOM_NATIVE_API_PREFIX = "/agent-team-room/api/session/";
/** Reject browser cross-site reads; this endpoint never accepts writes. */
export declare function isSameSiteRead(req: Pick<IncomingMessage, 'headers'>): boolean;
/** Whitelist only the fields rendered by the native client. */
export declare function nativeRoomView(room: Room): {
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
/**
 * Read-only snapshot transport for the native DSH UI. All mutations still go
 * through Agent-scoped `/room` commands and repeat Room ownership checks.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=native-api.d.ts.map
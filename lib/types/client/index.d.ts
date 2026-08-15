import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client';
interface RoomMemberView {
    memberId: string;
    kind: 'leader' | 'member';
    name: string;
    connection: {
        protocol: string;
        sessionId?: string;
    };
    profile?: {
        apiVersion: string;
        kind: string;
        id: string;
        version?: string;
    };
    status: 'leader' | 'working' | 'idle' | 'interrupted' | 'error' | 'removed';
}
interface RoomView {
    id: string;
    name: string;
    topic?: string;
    leaderSessionId: string;
    status: 'open' | 'closed';
    members: RoomMemberView[];
}
export declare const ROOM_HEADER_ENTRY_ID = "dsh-agent-team-room-header";
export declare const ROOM_FOOTER_ENTRY_ID = "dsh-agent-team-room-footer";
export declare const ROOM_NATIVE_API_PREFIX = "/agent-team-room/api/session/";
export declare const ROOM_INVITE_PROVIDER_SLOT = "agent-team-room.invite.provider";
/** Owner props exposed to optional member-source plugins inside the Room invite panel. */
export interface RoomInviteProviderOwnerProps {
    sessionId: string;
    roomId: string;
    roomName: string;
    disabled: boolean;
    onAttached: () => void;
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /** Additive, provider-owned member pickers. Room never interprets role or policy data. */
        'agent-team-room.invite.provider': {
            kind: 'list';
            scope: 'session';
            owner: RoomInviteProviderOwnerProps;
        };
    }
}
export type RoomsHeaderActionProps = PropsRuntime<'conversation.session.header.actions'>;
export type RoomsFooterActionProps = PropsRuntime<'sidebar.footer.action'> & SidebarFooterActionOwnerProps;
interface RoomsSnapshot {
    rooms: RoomView[];
}
export declare function roomSnapshotUrl(sessionId: string): string;
export declare function loadRoomSnapshot(sessionId: string, signal?: AbortSignal): Promise<RoomsSnapshot>;
/** Required DSH services: additive slots and the native Session runtime. */
export declare const inject: string[];
/** Register Room controls without replacing any DSH root, sidebar, conversation, or details surface. */
export declare function apply(ctx: ClientContext): void;
export {};
//# sourceMappingURL=index.d.ts.map
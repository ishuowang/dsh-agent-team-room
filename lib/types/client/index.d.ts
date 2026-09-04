import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { InputTriggerCandidate, InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
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
    activity?: Array<{
        id: string;
        type: string;
        at: string;
        actorMemberId?: string;
        targetMemberId?: string;
        relayId?: string;
        acceptedCount?: number;
        failedCount?: number;
        label: string;
    }>;
    conversation?: {
        messages: Array<{
            id: string;
            at: number;
            role: 'leader' | 'member';
            authorMemberId: string;
            authorName: string;
            recipientMemberIds: string[];
            text: string;
            status: 'accepted' | 'completed';
            sessionId?: string;
            relayId?: string;
            mode?: 'direct' | 'broadcast';
            replyTo?: string[];
        }>;
        unavailableMemberIds: string[];
        hiddenMixedReplyCount: number;
    };
}
export declare const ROOM_HEADER_ENTRY_ID = "dsh-agent-team-room-header";
export declare const ROOM_FOOTER_ENTRY_ID = "dsh-agent-team-room-footer";
export declare const ROOM_VIEW_ENTRY_ID = "agent-team-room";
export declare const ROOM_NATIVE_API_PREFIX = "/agent-team-room/api/session/";
export declare const ROOM_INVITE_PROVIDER_SLOT = "agent-team-room.invite.provider";
export declare const ROOM_FOOTER_INVITE_PROVIDER_SLOT = "agent-team-room.invite.provider.footer";
export declare const ROOM_VIEW_INVITE_PROVIDER_SLOT = "agent-team-room.invite.provider.view";
export declare const ROOM_MENTION_SOURCE_NAME = "Room members";
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
        /** Footer-owned equivalent; SlotCore requires every declared child key to be globally unique. */
        'agent-team-room.invite.provider.footer': {
            kind: 'list';
            scope: 'session';
            owner: RoomInviteProviderOwnerProps;
        };
        /** Conversation-view equivalent for providers rendered inside the native Room tab. */
        'agent-team-room.invite.provider.view': {
            kind: 'list';
            scope: 'session';
            owner: RoomInviteProviderOwnerProps;
        };
    }
}
export type RoomsHeaderActionProps = PropsRuntime<'conversation.session.header.actions'>;
export type RoomsFooterActionProps = PropsRuntime<'sidebar.footer.action'> & SidebarFooterActionOwnerProps;
export type RoomsViewProps = PropsRuntime<'conversation.view'>;
interface RoomsSnapshot {
    rooms: RoomView[];
}
/** Extra identity kept on native @ candidates without changing their rendered contract. */
export interface RoomMentionCandidate extends InputTriggerCandidate {
    readonly roomId: string;
    readonly roomName: string;
    readonly memberId: string;
    readonly memberName: string;
}
type RoomSnapshotLoader = (sessionId: string, signal?: AbortSignal, roomId?: string) => Promise<RoomsSnapshot>;
type RoomMentionSender = (sessionId: string, roomId: string, memberId: string, message: string) => Promise<void>;
/** Current, deliverable Room members projected into the native DSH @ menu. */
export declare function roomMentionCandidates(snapshot: RoomsSnapshot, sessionId: string): RoomMentionCandidate[];
/**
 * Register through DSH's native input-trigger pipeline. That pipeline owns
 * the accessible listbox, caret-span CAS, keyboard navigation, and pointer
 * selection; Room contributes only trusted candidate data.
 */
export declare function createRoomMentionSource(loader?: RoomSnapshotLoader, send?: RoomMentionSender): InputTriggerSource;
export declare function roomSnapshotUrl(sessionId: string, roomId?: string): string;
export declare function loadRoomSnapshot(sessionId: string, signal?: AbortSignal, roomId?: string): Promise<RoomsSnapshot>;
/** Required DSH services: additive slots, native Session runtime, and native @ pipeline. */
export declare const inject: string[];
/** Register the additive native Room view and launchers without replacing a DSH root surface. */
export declare function apply(ctx: ClientContext): void;
export {};
//# sourceMappingURL=index.d.ts.map
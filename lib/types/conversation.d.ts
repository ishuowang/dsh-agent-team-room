import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { Room, RoomDeliveryMode, RoomRelayMessageSource } from './types.js';
export declare const ROOM_CONVERSATION_MESSAGE_LIMIT = 200;
export declare const ROOM_CONVERSATION_TEXT_LIMIT = 20000;
export declare const ROOM_CONVERSATION_TOTAL_TEXT_LIMIT = 200000;
export interface NativeRoomConversationMessage {
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
    mode?: RoomDeliveryMode;
    replyTo?: string[];
}
export interface NativeRoomConversation {
    messages: NativeRoomConversationMessage[];
    unavailableMemberIds: string[];
    hiddenMixedReplyCount: number;
}
/** Narrow opaque, merge-extensible MessageSource values to this plugin's durable relay source. */
export declare function roomRelaySource(value: unknown): RoomRelayMessageSource | undefined;
/** Merge Room-correlated DSH Session logs into one deterministic, text-only timeline. */
export declare function projectRoomConversation(room: Room, histories: ReadonlyMap<string, readonly SessionEvent[]>, unavailableMemberIds?: readonly string[]): NativeRoomConversation;
//# sourceMappingURL=conversation.d.ts.map
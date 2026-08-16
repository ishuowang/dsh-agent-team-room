import type { Agent } from '@deepseek-ai/dsh-agent';
import type { JsonValue } from '@deepseek-ai/dsh-session';
import type { AttachRoomMemberInput, Room, RoomDeliveryMode, RoomMember, RoomMemberAttachment } from './types.js';
export interface RoomMemberAttachContext {
    parent: Agent;
    room: Room;
    descriptor: JsonValue;
    requestedName?: string;
    requestedProfile?: AttachRoomMemberInput['profile'];
    signal: AbortSignal;
}
export interface RoomMemberDeliveryContext {
    parent: Agent;
    room: Room;
    member: RoomMember;
    message: string;
    relay: {
        id: string;
        mode: RoomDeliveryMode;
    };
    signal: AbortSignal;
}
export interface RoomMemberInterruptContext {
    parent: Agent;
    room: Room;
    member: RoomMember;
}
/**
 * Trusted Host adapter for one member transport. A provider owns attachment,
 * delivery, and interruption; Room owns membership, provenance, and history.
 */
export interface RoomMemberProvider {
    readonly id: string;
    attach(context: RoomMemberAttachContext): Promise<RoomMemberAttachment>;
    /**
     * Return a provider-owned delivery id to the caller. Room treats this value
     * as opaque and does not persist or expose it through history. The built-in
     * `dsh-session` adapter is the sole exception: its value is a non-secret DSH
     * Session MessageId used for exact transcript correlation.
     */
    deliver(context: RoomMemberDeliveryContext): Promise<{
        deliveryId: string;
    }>;
    interrupt?(context: RoomMemberInterruptContext): Promise<void> | void;
}
//# sourceMappingURL=member-provider.d.ts.map
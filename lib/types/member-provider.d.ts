import type { Agent } from '@deepseek-ai/dsh-agent';
import type { JsonValue } from '@deepseek-ai/dsh-session';
import type { AttachRoomMemberInput, Room, RoomMember, RoomMemberAttachment } from './types.js';
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
    deliver(context: RoomMemberDeliveryContext): Promise<{
        deliveryId: string;
    }>;
    interrupt?(context: RoomMemberInterruptContext): Promise<void> | void;
}
//# sourceMappingURL=member-provider.d.ts.map
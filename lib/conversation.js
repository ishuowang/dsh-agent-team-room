export const ROOM_CONVERSATION_MESSAGE_LIMIT = 200;
export const ROOM_CONVERSATION_TEXT_LIMIT = 20_000;
export const ROOM_CONVERSATION_TOTAL_TEXT_LIMIT = 200_000;
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
/** Narrow opaque, merge-extensible MessageSource values to this plugin's durable relay source. */
export function roomRelaySource(value) {
    const source = record(value);
    if (source?.['kind'] !== 'agent-team-room' || source['form'] !== 'relay')
        return undefined;
    if (typeof source['senderSessionId'] !== 'string'
        || typeof source['roomId'] !== 'string'
        || typeof source['memberId'] !== 'string'
        || typeof source['relayId'] !== 'string'
        || (source['mode'] !== 'direct' && source['mode'] !== 'broadcast'))
        return undefined;
    return {
        kind: 'agent-team-room',
        form: 'relay',
        senderSessionId: source['senderSessionId'],
        roomId: source['roomId'],
        memberId: source['memberId'],
        relayId: source['relayId'],
        mode: source['mode'],
    };
}
function visibleText(content) {
    const text = content.flatMap((block) => {
        const value = record(block);
        return value?.['type'] === 'text' && typeof value['text'] === 'string' && value['text'].trim().length > 0
            ? [value['text']]
            : [];
    }).join('\n\n');
    return text.length <= ROOM_CONVERSATION_TEXT_LIMIT
        ? text
        : `${text.slice(0, ROOM_CONVERSATION_TEXT_LIMIT - 1)}…`;
}
function authorizedRelays(room, member) {
    const result = new Map();
    for (const event of room.events) {
        if (!event.relay)
            continue;
        const receipt = event.relay.deliveries.find(delivery => delivery.memberId === member.memberId);
        if (!receipt || receipt.status !== 'accepted' || !receipt.sessionMessageId)
            continue;
        result.set(event.relay.id, { sessionMessageId: receipt.sessionMessageId, mode: event.relay.mode });
    }
    return result;
}
function projectMember(room, member, events, memberOrder) {
    const leader = room.members.find(candidate => candidate.kind === 'leader');
    if (!leader)
        return { messages: [], hiddenMixedReplyCount: 0 };
    const turns = new Map();
    const messages = [];
    let currentTurn;
    let hiddenMixedReplyCount = 0;
    const authorized = authorizedRelays(room, member);
    for (const event of events) {
        if (event.type === 'turn/start') {
            currentTurn = event.data.turn;
            turns.set(currentTurn, { relayIds: new Set(), conflictingRoom: false });
            continue;
        }
        if (event.type === 'turn/end') {
            currentTurn = undefined;
            continue;
        }
        if (event.type === 'user/message') {
            if (event.surfaceOp !== 'append')
                continue;
            const source = roomRelaySource(event.data.source);
            const receipt = source ? authorized.get(source.relayId) : undefined;
            if (source?.roomId === room.id
                && source.memberId === member.memberId
                && source.senderSessionId === room.leaderSessionId
                && receipt?.mode === source.mode
                && receipt.sessionMessageId === String(event.data.id)) {
                if (currentTurn !== undefined) {
                    const turn = turns.get(currentTurn) ?? { relayIds: new Set(), conflictingRoom: false };
                    turn.relayIds.add(source.relayId);
                    turns.set(currentTurn, turn);
                }
                const text = visibleText(event.data.content);
                if (text.length === 0)
                    continue;
                messages.push({
                    id: `relay:${source.relayId}`,
                    at: event.time,
                    role: 'leader',
                    authorMemberId: leader.memberId,
                    authorName: leader.name,
                    recipientMemberIds: [member.memberId],
                    text,
                    status: 'accepted',
                    sessionId: room.leaderSessionId,
                    relayId: source.relayId,
                    mode: source.mode,
                    order: event.seq,
                    memberOrder,
                });
                continue;
            }
            // Any other appended input can influence the shared answer (notices,
            // goals, skills, references, plugin sources, human prompts, or another
            // Room), so fail closed without trying to enumerate source kinds.
            if (currentTurn !== undefined) {
                const turn = turns.get(currentTurn) ?? { relayIds: new Set(), conflictingRoom: false };
                turn.conflictingRoom = true;
                turns.set(currentTurn, turn);
            }
            continue;
        }
        if (event.type !== 'assistant/message')
            continue;
        if (event.surfaceOp !== 'append')
            continue;
        const turn = turns.get(event.data.turn);
        if (!turn || turn.relayIds.size === 0)
            continue;
        const text = visibleText(event.data.message.content);
        if (text.length === 0)
            continue;
        // One child turn can consume messages from several Rooms. Do not leak the
        // shared answer into either Room; the backing Session remains navigable.
        if (turn.conflictingRoom) {
            hiddenMixedReplyCount += 1;
            continue;
        }
        messages.push({
            id: `reply:${member.connection.sessionId ?? member.memberId}:${String(event.data.message.id)}`,
            at: event.time,
            role: 'member',
            authorMemberId: member.memberId,
            authorName: member.name,
            recipientMemberIds: [leader.memberId],
            text,
            status: 'completed',
            ...(member.connection.sessionId ? { sessionId: member.connection.sessionId } : {}),
            replyTo: [...turn.relayIds],
            order: event.seq,
            memberOrder,
        });
    }
    return { messages, hiddenMixedReplyCount };
}
/** Merge Room-correlated DSH Session logs into one deterministic, text-only timeline. */
export function projectRoomConversation(room, histories, unavailableMemberIds = []) {
    const ordered = [];
    let hiddenMixedReplyCount = 0;
    room.members.forEach((member, memberOrder) => {
        if (member.kind !== 'member' || !member.connection.sessionId)
            return;
        const events = histories.get(member.memberId);
        if (!events)
            return;
        const projected = projectMember(room, member, events, memberOrder);
        ordered.push(...projected.messages);
        hiddenMixedReplyCount += projected.hiddenMixedReplyCount;
    });
    const outgoing = new Map();
    const merged = [];
    for (const message of ordered) {
        if (message.role !== 'leader' || !message.relayId) {
            merged.push(message);
            continue;
        }
        const existing = outgoing.get(message.relayId);
        if (!existing) {
            outgoing.set(message.relayId, message);
            merged.push(message);
            continue;
        }
        existing.recipientMemberIds = [...new Set([
                ...existing.recipientMemberIds,
                ...message.recipientMemberIds,
            ])];
        existing.at = Math.min(existing.at, message.at);
        existing.order = Math.min(existing.order, message.order);
    }
    merged.sort((left, right) => (left.at - right.at
        || left.memberOrder - right.memberOrder
        || left.order - right.order
        || left.id.localeCompare(right.id, 'en')));
    const bounded = [];
    let textChars = 0;
    for (const message of merged.slice(-ROOM_CONVERSATION_MESSAGE_LIMIT).reverse()) {
        if (textChars + message.text.length > ROOM_CONVERSATION_TOTAL_TEXT_LIMIT)
            break;
        bounded.push(message);
        textChars += message.text.length;
    }
    bounded.reverse();
    return {
        messages: bounded.map(({ order: _order, memberOrder: _memberOrder, ...message }) => message),
        unavailableMemberIds: [...new Set(unavailableMemberIds)],
        hiddenMixedReplyCount,
    };
}
//# sourceMappingURL=conversation.js.map
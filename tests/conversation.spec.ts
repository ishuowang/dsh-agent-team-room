import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { projectRoomConversation, roomRelaySource } from '../src/conversation.js'
import { DSH_SESSION_MEMBER_PROTOCOL, DSH_SESSION_MEMBER_PROVIDER, ROOM_SCHEMA_VERSION, type Room } from '../src/types.js'

function room(): Room {
  const at = '2026-08-16T00:00:00.000Z'
  return {
    schemaVersion: ROOM_SCHEMA_VERSION,
    id: 'room-a',
    name: 'Release Room',
    leaderSessionId: 'leader-1',
    status: 'open',
    revision: 4,
    createdAt: at,
    updatedAt: at,
    members: [
      {
        memberId: 'leader-member',
        kind: 'leader',
        name: 'You',
        connection: {
          providerId: DSH_SESSION_MEMBER_PROVIDER,
          protocol: DSH_SESSION_MEMBER_PROTOCOL,
          address: { sessionId: 'leader-1' },
          sessionId: 'leader-1',
        },
        status: 'leader',
        joinedAt: at,
        updatedAt: at,
      },
      {
        memberId: 'member-alex',
        kind: 'member',
        name: 'Alex',
        connection: {
          providerId: DSH_SESSION_MEMBER_PROVIDER,
          protocol: DSH_SESSION_MEMBER_PROTOCOL,
          address: { sessionId: 'child-alex' },
          sessionId: 'child-alex',
        },
        status: 'idle',
        joinedAt: at,
        updatedAt: at,
      },
      {
        memberId: 'member-bob',
        kind: 'member',
        name: 'Bob',
        connection: {
          providerId: DSH_SESSION_MEMBER_PROVIDER,
          protocol: DSH_SESSION_MEMBER_PROTOCOL,
          address: { sessionId: 'child-bob' },
          sessionId: 'child-bob',
        },
        status: 'working',
        joinedAt: at,
        updatedAt: at,
      },
    ],
    events: [{
      id: 'event-broadcast',
      type: 'message.broadcast',
      at,
      actorMemberId: 'leader-member',
      relay: {
        id: 'relay-broadcast',
        mode: 'broadcast',
        deliveries: [
          { memberId: 'member-alex', status: 'accepted', sessionMessageId: 'broadcast-alex' },
          { memberId: 'member-bob', status: 'accepted', sessionMessageId: 'broadcast-bob' },
        ],
      },
      message: 'Broadcast attempted for 2 member(s)',
    }],
  }
}

function authorize(value: Room, input: {
  relayId: string
  memberId: string
  sessionMessageId: string
  mode?: 'direct' | 'broadcast'
}): void {
  value.events.push({
    id: `event:${input.relayId}`,
    type: input.mode === 'broadcast' ? 'message.broadcast' : 'message.direct',
    at: '2026-08-16T00:00:01.000Z',
    relay: {
      id: input.relayId,
      mode: input.mode ?? 'direct',
      deliveries: [{
        memberId: input.memberId,
        status: 'accepted',
        sessionMessageId: input.sessionMessageId,
      }],
    },
    message: 'Delivery accepted',
  })
}

function relayEvent(input: {
  seq: number
  time: number
  turn: number
  messageId: string
  roomId?: string
  memberId: string
  relayId: string
  mode?: 'direct' | 'broadcast'
  text: string
}): SessionEvent[] {
  return [
    { type: 'turn/start', seq: input.seq, time: input.time, data: { turn: input.turn } },
    {
      type: 'user/message',
      seq: input.seq + 1,
      time: input.time + 1,
      data: {
        id: input.messageId,
        role: 'user',
        content: [{ type: 'text', text: input.text }],
        source: {
          kind: 'agent-team-room',
          form: 'relay',
          senderSessionId: 'leader-1',
          roomId: input.roomId ?? 'room-a',
          memberId: input.memberId,
          relayId: input.relayId,
          mode: input.mode ?? 'direct',
        },
      },
      surfaceOp: 'append',
    },
  ] as SessionEvent[]
}

function replyEvents(input: { seq: number; time: number; turn: number; messageId: string; text: string }): SessionEvent[] {
  return [
    {
      type: 'assistant/message',
      seq: input.seq,
      time: input.time,
      data: {
        turn: input.turn,
        step: 1,
        message: {
          id: input.messageId,
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'PRIVATE_REASONING' },
            { type: 'text', text: input.text },
          ],
          source: { kind: 'model', provider: 'fixture', model: 'fixture' },
        },
      },
      surfaceOp: 'append',
    },
    { type: 'turn/end', seq: input.seq + 1, time: input.time + 1, data: { turn: input.turn, reason: 'completed' } },
  ] as SessionEvent[]
}

describe('Room conversation read model', () => {
  it('accepts only complete plugin-owned relay sources', () => {
    expect(roomRelaySource({
      kind: 'agent-team-room',
      form: 'relay',
      senderSessionId: 'leader',
      roomId: 'room',
      memberId: 'member',
      relayId: 'relay',
      mode: 'direct',
    })).toMatchObject({ roomId: 'room', relayId: 'relay', mode: 'direct' })
    expect(roomRelaySource({ kind: 'coordinator', form: 'relay', senderSessionId: 'leader' })).toBeUndefined()
    expect(roomRelaySource({ kind: 'agent-team-room', form: 'relay', roomId: 'room' })).toBeUndefined()
  })

  it('projects correlated prompts and replies, deduplicates broadcasts, and excludes unrelated turns', () => {
    const value = room()
    authorize(value, {
      relayId: 'relay-direct',
      memberId: 'member-alex',
      sessionMessageId: 'child-message-1',
    })
    authorize(value, {
      relayId: 'relay-mixed',
      memberId: 'member-bob',
      sessionMessageId: 'ordinary-room',
    })
    const alex: SessionEvent[] = [
      ...relayEvent({ seq: 0, time: 100, turn: 1, messageId: 'child-message-1', memberId: 'member-alex', relayId: 'relay-direct', text: 'Review the release.' }),
      ...replyEvents({ seq: 2, time: 110, turn: 1, messageId: 'reply-alex-1', text: 'Release looks good.' }),
      ...relayEvent({ seq: 4, time: 120, turn: 2, messageId: 'foreign-message', roomId: 'room-b', memberId: 'member-alex', relayId: 'foreign-relay', text: 'PRIVATE_OTHER_ROOM' }),
      ...replyEvents({ seq: 6, time: 130, turn: 2, messageId: 'foreign-reply', text: 'PRIVATE_OTHER_REPLY' }),
      ...relayEvent({ seq: 8, time: 200, turn: 3, messageId: 'broadcast-alex', memberId: 'member-alex', relayId: 'relay-broadcast', mode: 'broadcast', text: 'Status update?' }),
      ...replyEvents({ seq: 10, time: 210, turn: 3, messageId: 'reply-alex-2', text: 'Alex is ready.' }),
    ]
    const bob: SessionEvent[] = [
      ...relayEvent({ seq: 0, time: 201, turn: 1, messageId: 'broadcast-bob', memberId: 'member-bob', relayId: 'relay-broadcast', mode: 'broadcast', text: 'Status update?' }),
      ...replyEvents({ seq: 2, time: 220, turn: 1, messageId: 'reply-bob-1', text: 'Bob is testing.' }),
      ...relayEvent({ seq: 4, time: 230, turn: 2, messageId: 'ordinary-room', memberId: 'member-bob', relayId: 'relay-mixed', text: 'One more check.' }),
      ...relayEvent({ seq: 6, time: 232, turn: 2, messageId: 'other-room-same-turn', roomId: 'room-c', memberId: 'member-bob', relayId: 'other-room', text: 'PRIVATE_MIXED_ROOM' }).slice(1),
      ...replyEvents({ seq: 8, time: 240, turn: 2, messageId: 'mixed-reply', text: 'PRIVATE_MIXED_REPLY' }),
    ]

    const result = projectRoomConversation(value, new Map([
      ['member-alex', alex],
      ['member-bob', bob],
    ]), ['member-external'])

    expect(result.unavailableMemberIds).toEqual(['member-external'])
    expect(result.hiddenMixedReplyCount).toBe(1)
    expect(result.messages.map(message => ({
      role: message.role,
      author: message.authorName,
      text: message.text,
      relayId: message.relayId,
      recipients: message.recipientMemberIds,
      replyTo: message.replyTo,
    }))).toEqual([
      {
        role: 'leader',
        author: 'You',
        text: 'Review the release.',
        relayId: 'relay-direct',
        recipients: ['member-alex'],
        replyTo: undefined,
      },
      {
        role: 'member',
        author: 'Alex',
        text: 'Release looks good.',
        relayId: undefined,
        recipients: ['leader-member'],
        replyTo: ['relay-direct'],
      },
      {
        role: 'leader',
        author: 'You',
        text: 'Status update?',
        relayId: 'relay-broadcast',
        recipients: ['member-alex', 'member-bob'],
        replyTo: undefined,
      },
      {
        role: 'member',
        author: 'Alex',
        text: 'Alex is ready.',
        relayId: undefined,
        recipients: ['leader-member'],
        replyTo: ['relay-broadcast'],
      },
      {
        role: 'member',
        author: 'Bob',
        text: 'Bob is testing.',
        relayId: undefined,
        recipients: ['leader-member'],
        replyTo: ['relay-broadcast'],
      },
      {
        role: 'leader',
        author: 'You',
        text: 'One more check.',
        relayId: 'relay-mixed',
        recipients: ['member-bob'],
        replyTo: undefined,
      },
    ])
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_/u)
  })

  it('keeps departed-member history while rejecting forged senders and mixed human turns', () => {
    const value = room()
    for (const [relayId, sessionMessageId] of [
      ['forged-relay', 'forged'],
      ['real-relay', 'real'],
      ['history-relay', 'historical'],
      ['same-room-real-relay', 'same-room-real'],
      ['same-room-forged-relay', 'same-room-forged'],
    ] as const) {
      authorize(value, { relayId, memberId: 'member-alex', sessionMessageId })
    }
    const alex = value.members.find(member => member.memberId === 'member-alex')!
    alex.status = 'removed'
    const events: SessionEvent[] = [
      ...relayEvent({
        seq: 0,
        time: 100,
        turn: 1,
        messageId: 'forged',
        memberId: 'member-alex',
        relayId: 'forged-relay',
        text: 'PRIVATE_FORGED',
      }).map((event) => event.type === 'user/message'
        ? {
            ...event,
            data: {
              ...event.data,
              source: { ...event.data.source, senderSessionId: 'other-leader' },
            },
          } as SessionEvent
        : event),
      ...replyEvents({ seq: 2, time: 110, turn: 1, messageId: 'forged-reply', text: 'PRIVATE_FORGED_REPLY' }),
      ...relayEvent({
        seq: 4,
        time: 200,
        turn: 2,
        messageId: 'real',
        memberId: 'member-alex',
        relayId: 'real-relay',
        text: 'Keep this history.',
      }),
      {
        type: 'user/message',
        seq: 6,
        time: 202,
        data: {
          id: 'human-message',
          role: 'user',
          content: [{ type: 'text', text: 'PRIVATE_HUMAN_PROMPT' }],
          source: { kind: 'user' },
        },
        surfaceOp: 'append',
      } as SessionEvent,
      ...replyEvents({ seq: 7, time: 210, turn: 2, messageId: 'mixed-human-reply', text: 'PRIVATE_MIXED_HUMAN_REPLY' }),
      ...relayEvent({
        seq: 9,
        time: 300,
        turn: 3,
        messageId: 'historical',
        memberId: 'member-alex',
        relayId: 'history-relay',
        text: 'Historical prompt.',
      }),
      ...replyEvents({ seq: 11, time: 310, turn: 3, messageId: 'historical-reply', text: 'Historical reply.' }),
      ...relayEvent({
        seq: 13,
        time: 400,
        turn: 4,
        messageId: 'same-room-real',
        memberId: 'member-alex',
        relayId: 'same-room-real-relay',
        text: 'Same-Room prompt.',
      }),
      ...relayEvent({
        seq: 15,
        time: 402,
        turn: 4,
        messageId: 'same-room-forged',
        memberId: 'member-alex',
        relayId: 'same-room-forged-relay',
        text: 'PRIVATE_SAME_ROOM_FORGED',
      }).slice(1).map((event) => event.type === 'user/message'
        ? {
            ...event,
            data: {
              ...event.data,
              source: { ...event.data.source, senderSessionId: 'other-leader' },
            },
          } as SessionEvent
        : event),
      ...replyEvents({ seq: 17, time: 410, turn: 4, messageId: 'same-room-mixed-reply', text: 'PRIVATE_SAME_ROOM_REPLY' }),
    ]

    const result = projectRoomConversation(value, new Map([['member-alex', events]]))

    expect(result.hiddenMixedReplyCount).toBe(2)
    expect(result.messages.map(message => message.text)).toEqual([
      'Keep this history.',
      'Historical prompt.',
      'Historical reply.',
      'Same-Room prompt.',
    ])
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_/u)
  })

  it('fails closed for every extra appended input and ignores replacement surface copies', () => {
    const value = room()
    authorize(value, {
      relayId: 'notice-relay',
      memberId: 'member-alex',
      sessionMessageId: 'notice-prompt',
    })
    authorize(value, {
      relayId: 'replacement-prompt-relay',
      memberId: 'member-alex',
      sessionMessageId: 'replacement-prompt',
    })
    authorize(value, {
      relayId: 'replacement-reply-relay',
      memberId: 'member-alex',
      sessionMessageId: 'replacement-reply-prompt',
    })
    const replacement = { op: 'replace' as const, start: 0, end: 0 }
    const noticeTurn: SessionEvent[] = [
      ...relayEvent({
        seq: 0,
        time: 100,
        turn: 1,
        messageId: 'notice-prompt',
        memberId: 'member-alex',
        relayId: 'notice-relay',
        text: 'Room prompt with notice.',
      }),
      {
        type: 'user/message',
        seq: 2,
        time: 102,
        data: {
          id: 'notice',
          role: 'user',
          content: [{ type: 'text', text: 'PRIVATE_NOTICE_INPUT' }],
          source: { kind: 'plugin', form: 'notice', plugin: 'fixture' },
        },
        surfaceOp: 'append',
      } as SessionEvent,
      ...replyEvents({ seq: 3, time: 110, turn: 1, messageId: 'notice-reply', text: 'PRIVATE_NOTICE_REPLY' }),
    ]
    const replacedPrompt = relayEvent({
      seq: 6,
      time: 200,
      turn: 2,
      messageId: 'replacement-prompt',
      memberId: 'member-alex',
      relayId: 'replacement-prompt-relay',
      text: 'PRIVATE_REPLACEMENT_PROMPT',
    }).map(event => event.type === 'user/message'
      ? { ...event, surfaceOp: replacement } as SessionEvent
      : event)
    const replacedReply: SessionEvent[] = [
      ...relayEvent({
        seq: 10,
        time: 300,
        turn: 3,
        messageId: 'replacement-reply-prompt',
        memberId: 'member-alex',
        relayId: 'replacement-reply-relay',
        text: 'Room prompt before replacement.',
      }),
      ...replyEvents({
        seq: 12,
        time: 310,
        turn: 3,
        messageId: 'replacement-reply',
        text: 'PRIVATE_REPLACEMENT_REPLY',
      }).map(event => event.type === 'assistant/message'
        ? { ...event, surfaceOp: replacement } as SessionEvent
        : event),
    ]

    const result = projectRoomConversation(value, new Map([[
      'member-alex',
      [
        ...noticeTurn,
        ...replacedPrompt,
        ...replyEvents({ seq: 8, time: 210, turn: 2, messageId: 'reply-after-copy', text: 'PRIVATE_COPY_REPLY' }),
        ...replacedReply,
      ],
    ]]))

    expect(result.hiddenMixedReplyCount).toBe(1)
    expect(result.messages.map(message => message.text)).toEqual([
      'Room prompt with notice.',
      'Room prompt before replacement.',
    ])
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_/u)
  })
})

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import {
  ROOM_NATIVE_API_PREFIX,
  ROOM_NATIVE_CLIENT_HEADER,
  apply,
  inject,
  isNativeRoomClient,
  isSameSiteRead,
  nativeRoomConversation,
} from '../src/native-api.js'
import { DSH_SESSION_MEMBER_PROTOCOL, DSH_SESSION_MEMBER_PROVIDER, ROOM_SCHEMA_VERSION, type Room } from '../src/types.js'

interface RegisteredRoute {
  kind: 'prefix'
  path: string
  handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>
}

function request(method: string, url: string, site?: string, nativeClient = true): IncomingMessage {
  return {
    method,
    url,
    headers: {
      ...(site ? { 'sec-fetch-site': site } : {}),
      ...(nativeClient ? { [ROOM_NATIVE_CLIENT_HEADER]: '1' } : {}),
    },
  } as IncomingMessage
}

function response() {
  let status: number | undefined
  let headers: Record<string, string> | undefined
  let body: unknown
  const value = {
    writeHead: vi.fn((nextStatus: number, nextHeaders?: Record<string, string>) => {
      status = nextStatus
      headers = nextHeaders
      return value
    }),
    end: vi.fn((nextBody?: unknown) => {
      body = nextBody
      return value
    }),
  }
  return {
    value: value as unknown as ServerResponse,
    status: () => status,
    headers: () => headers,
    body: () => body,
  }
}

function mount() {
  let route: RegisteredRoute | undefined
  const rooms = {
    listRoomsForSession: vi.fn(() => [{
      schemaVersion: 2,
      id: 'room-1',
      name: 'Build room',
      topic: 'Release safely',
      leaderSessionId: 'leader-1',
      status: 'open',
      revision: 2,
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:01.000Z',
      summary: 'PRIVATE_SUMMARY',
      members: [{
        memberId: 'leader-member',
        kind: 'leader',
        name: 'Leader',
        connection: {
          providerId: 'dsh-session',
          protocol: 'dsh.session/v1',
          address: { endpoint: 'PRIVATE_PROVIDER_ADDRESS' },
          sessionId: 'leader-1',
        },
        profile: {
          apiVersion: 'rolehub.dev/v1alpha1',
          kind: 'AgentRole',
          id: 'community/leader',
          version: '1.0.0',
          digest: `sha256:${'c'.repeat(64)}`,
        },
        status: 'leader',
        joinedAt: '2026-08-15T00:00:00.000Z',
        updatedAt: '2026-08-15T00:00:00.000Z',
      }],
      events: [{
        id: 'event-1',
        type: 'room.created',
        at: '2026-08-15T00:00:00.000Z',
        message: 'PRIVATE_EVENT',
      }],
    }]),
  }
  const register = vi.fn((candidate: RegisteredRoute) => {
    route = candidate
    return () => undefined
  })
  const effect = vi.fn((callback: () => unknown) => callback())
  const sessions = { get: vi.fn() }
  const get = vi.fn(() => undefined)
  apply({ webServer: { register }, rooms, sessions, get, effect } as unknown as Context)
  if (!route) throw new Error('native Room route was not registered')
  return { route, rooms, sessions, get, register, effect }
}

describe('native UI read API', () => {
  it('registers one prefix route behind explicit Room and WebServer dependencies', () => {
    const { route, register, effect } = mount()

    expect(inject).toEqual(['rooms', 'sessions', 'webServer'])
    expect(register).toHaveBeenCalledOnce()
    expect(effect).toHaveBeenCalledOnce()
    expect(route).toMatchObject({ kind: 'prefix', path: '/agent-team-room/api' })
    expect(ROOM_NATIVE_API_PREFIX).toBe('/agent-team-room/api/session/')
  })

  it('accepts only an explicit same-origin browser context and native client marker', () => {
    const req = request('GET', '/', 'same-origin')
    expect(isSameSiteRead(req)).toBe(true)
    expect(isNativeRoomClient(req)).toBe(true)
  })

  it.each([undefined, 'same-site', 'none', 'cross-site', 'unknown'])('rejects non-origin browser context %s', (site) => {
    expect(isSameSiteRead(request('GET', '/', site))).toBe(false)
  })

  it('returns only the rooms visible to the requested Session', async () => {
    const { route, rooms } = mount()
    const res = response()

    await route.handler(request('GET', `${ROOM_NATIVE_API_PREFIX}leader-1?roomId=room-1`, 'same-origin'), res.value)

    expect(rooms.listRoomsForSession).toHaveBeenCalledExactlyOnceWith('leader-1', true)
    expect(res.status()).toBe(200)
    expect(res.headers()).toMatchObject({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    })
    expect(JSON.parse(String(res.body()))).toEqual({
      rooms: [{
        id: 'room-1',
        name: 'Build room',
        topic: 'Release safely',
        leaderSessionId: 'leader-1',
        status: 'open',
        members: [{
          memberId: 'leader-member',
          kind: 'leader',
          name: 'Leader',
          connection: {
            protocol: 'dsh.session/v1',
            sessionId: 'leader-1',
          },
          profile: {
            apiVersion: 'rolehub.dev/v1alpha1',
            kind: 'AgentRole',
            id: 'community/leader',
            version: '1.0.0',
          },
          status: 'leader',
        }],
        activity: [{
          id: 'event-1',
          type: 'room.created',
          at: '2026-08-15T00:00:00.000Z',
          label: 'Room created',
        }],
        conversation: {
          messages: [],
          unavailableMemberIds: [],
          hiddenMixedReplyCount: 0,
        },
      }],
    })
    expect(String(res.body())).not.toMatch(/PRIVATE_PROVIDER_ADDRESS|PRIVATE_EVENT|PRIVATE_SUMMARY|sha256:/u)
  })

  it('returns metadata only until the client selects one visible Room', async () => {
    const { route, get } = mount()
    const res = response()

    await route.handler(request('GET', `${ROOM_NATIVE_API_PREFIX}leader-1`, 'same-origin'), res.value)

    expect(res.status()).toBe(200)
    const body = JSON.parse(String(res.body())) as { rooms: Array<Record<string, unknown>> }
    expect(body.rooms).toHaveLength(1)
    expect(body.rooms[0]).not.toHaveProperty('activity')
    expect(body.rooms[0]).not.toHaveProperty('conversation')
    expect(get).not.toHaveBeenCalled()
  })

  it('rejects selection of a Room outside the Session-visible list', async () => {
    const { route, get } = mount()
    const res = response()

    await route.handler(request(
      'GET',
      `${ROOM_NATIVE_API_PREFIX}leader-1?roomId=room-private`,
      'same-origin',
    ), res.value)

    expect(res.status()).toBe(404)
    expect(JSON.parse(String(res.body()))).toEqual({ error: 'room_not_visible' })
    expect(get).not.toHaveBeenCalled()
  })

  it.each(['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])('rejects unsupported method %s before touching Room state', async (method) => {
    const { route, rooms } = mount()
    const res = response()

    await route.handler(request(method, `${ROOM_NATIVE_API_PREFIX}leader-1`, 'same-origin'), res.value)

    expect(rooms.listRoomsForSession).not.toHaveBeenCalled()
    expect(res.status()).toBe(405)
    expect(res.headers()).toEqual({ allow: 'GET' })
  })

  it('rejects cross-site reads before resolving a Session', async () => {
    const { route, rooms } = mount()
    const res = response()

    await route.handler(request('GET', `${ROOM_NATIVE_API_PREFIX}leader-1`, 'cross-site'), res.value)

    expect(rooms.listRoomsForSession).not.toHaveBeenCalled()
    expect(res.status()).toBe(403)
    expect(JSON.parse(String(res.body()))).toEqual({ error: 'native_room_read_denied' })
  })

  it('rejects requests without the native client marker before resolving a Session', async () => {
    const { route, rooms } = mount()
    const res = response()

    await route.handler(request(
      'GET',
      `${ROOM_NATIVE_API_PREFIX}leader-1`,
      'same-origin',
      false,
    ), res.value)

    expect(rooms.listRoomsForSession).not.toHaveBeenCalled()
    expect(res.status()).toBe(403)
    expect(JSON.parse(String(res.body()))).toEqual({ error: 'native_room_read_denied' })
  })

  it.each([
    ['/agent-team-room/api', 404, 'not_found'],
    [`${ROOM_NATIVE_API_PREFIX}`, 404, 'not_found'],
    [`${ROOM_NATIVE_API_PREFIX}leader-1/extra`, 404, 'not_found'],
    [`${ROOM_NATIVE_API_PREFIX}%E0%A4%A`, 400, 'URI malformed'],
  ])('rejects invalid route %s', async (url, expectedStatus, expectedError) => {
    const { route, rooms } = mount()
    const res = response()

    await route.handler(request('GET', url, 'same-origin'), res.value)

    expect(rooms.listRoomsForSession).not.toHaveBeenCalled()
    expect(res.status()).toBe(expectedStatus)
    expect(JSON.parse(String(res.body()))).toMatchObject({ error: expect.stringContaining(expectedError) })
  })

  it('reads persisted child Sessions and preserves history for departed members', async () => {
    const at = '2026-08-16T00:00:00.000Z'
    const room: Room = {
      schemaVersion: ROOM_SCHEMA_VERSION,
      id: 'room-history',
      name: 'History room',
      leaderSessionId: 'leader-1',
      status: 'open',
      revision: 3,
      createdAt: at,
      updatedAt: at,
      members: [
        {
          memberId: 'leader-member',
          kind: 'leader',
          name: 'Leader',
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
          memberId: 'departed-member',
          kind: 'member',
          name: 'Departed',
          connection: {
            providerId: DSH_SESSION_MEMBER_PROVIDER,
            protocol: DSH_SESSION_MEMBER_PROTOCOL,
            address: { sessionId: 'child-1' },
            sessionId: 'child-1',
          },
          status: 'removed',
          joinedAt: at,
          updatedAt: at,
        },
        {
          memberId: 'external-spoof',
          kind: 'member',
          name: 'External',
          connection: {
            providerId: 'external-provider',
            protocol: DSH_SESSION_MEMBER_PROTOCOL,
            address: { endpoint: 'opaque' },
            sessionId: 'external-session',
          },
          status: 'idle',
          joinedAt: at,
          updatedAt: at,
        },
        {
          memberId: 'missing-session',
          kind: 'member',
          name: 'Missing Session',
          connection: {
            providerId: DSH_SESSION_MEMBER_PROVIDER,
            protocol: DSH_SESSION_MEMBER_PROTOCOL,
            address: { sessionId: 'missing' },
          },
          status: 'idle',
          joinedAt: at,
          updatedAt: at,
        },
      ],
      events: [{
        id: 'relay-event',
        type: 'message.direct',
        at,
        actorMemberId: 'leader-member',
        targetMemberId: 'departed-member',
        relay: {
          id: 'relay-1',
          mode: 'direct',
          deliveries: [{
            memberId: 'departed-member',
            status: 'accepted',
            sessionMessageId: 'relay-message',
          }],
        },
        message: 'Message delivered to Departed',
      }],
    }
    const events = [
      { type: 'turn/start', seq: 0, time: 100, data: { turn: 1 } },
      {
        type: 'user/message',
        seq: 1,
        time: 101,
        data: {
          id: 'relay-message',
          role: 'user',
          content: [{ type: 'text', text: 'Retained prompt' }],
          source: {
            kind: 'agent-team-room',
            form: 'relay',
            senderSessionId: 'leader-1',
            roomId: 'room-history',
            memberId: 'departed-member',
            relayId: 'relay-1',
            mode: 'direct',
          },
        },
        surfaceOp: 'append',
      },
      {
        type: 'assistant/message',
        seq: 2,
        time: 110,
        data: {
          turn: 1,
          step: 1,
          message: {
            id: 'reply-message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Retained reply' }],
            source: { kind: 'model', provider: 'fixture', model: 'fixture' },
          },
        },
        surfaceOp: 'append',
      },
      { type: 'turn/end', seq: 3, time: 111, data: { turn: 1, reason: 'completed' } },
    ] as SessionEvent[]
    const readSession = vi.fn(async () => ({ events }))
    const ctx = {
      get: vi.fn((name: string) => name === 'sessionQuery' ? { readSession } : undefined),
      sessions: { get: vi.fn() },
    } as unknown as Context

    const conversation = await nativeRoomConversation(ctx, room)

    expect(readSession).toHaveBeenCalledOnce()
    expect(conversation.messages.map(message => message.text)).toEqual(['Retained prompt', 'Retained reply'])
    expect(conversation.unavailableMemberIds).toEqual(['external-spoof', 'missing-session'])
  })

  it('prefers a live Session log over a potentially stale persisted query snapshot', async () => {
    const at = '2026-08-16T00:00:00.000Z'
    const room: Room = {
      schemaVersion: ROOM_SCHEMA_VERSION,
      id: 'room-live',
      name: 'Live room',
      leaderSessionId: 'leader-1',
      status: 'open',
      revision: 1,
      createdAt: at,
      updatedAt: at,
      members: [
        {
          memberId: 'leader-member',
          kind: 'leader',
          name: 'Leader',
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
          memberId: 'live-member',
          kind: 'member',
          name: 'Live member',
          connection: {
            providerId: DSH_SESSION_MEMBER_PROVIDER,
            protocol: DSH_SESSION_MEMBER_PROTOCOL,
            address: { sessionId: 'child-live' },
            sessionId: 'child-live',
          },
          status: 'working',
          joinedAt: at,
          updatedAt: at,
        },
      ],
      events: [{
        id: 'relay-event',
        type: 'message.direct',
        at,
        targetMemberId: 'live-member',
        relay: {
          id: 'relay-live',
          mode: 'direct',
          deliveries: [{
            memberId: 'live-member',
            status: 'accepted',
            sessionMessageId: 'live-message',
          }],
        },
        message: 'Message delivered to Live member',
      }],
    }
    const liveEvents = [
      { type: 'turn/start', seq: 0, time: 100, data: { turn: 1 } },
      {
        type: 'user/message',
        seq: 1,
        time: 101,
        data: {
          id: 'live-message',
          role: 'user',
          content: [{ type: 'text', text: 'Newest live prompt' }],
          source: {
            kind: 'agent-team-room',
            form: 'relay',
            senderSessionId: 'leader-1',
            roomId: 'room-live',
            memberId: 'live-member',
            relayId: 'relay-live',
            mode: 'direct',
          },
        },
        surfaceOp: 'append',
      },
    ] as SessionEvent[]
    const readSession = vi.fn(async () => ({ events: [] }))
    const sessionsGet = vi.fn(() => ({ events: liveEvents }))
    const ctx = {
      get: vi.fn((name: string) => name === 'sessionQuery' ? { readSession } : undefined),
      sessions: { get: sessionsGet },
    } as unknown as Context

    const conversation = await nativeRoomConversation(ctx, room)

    expect(conversation.messages.map(message => message.text)).toEqual(['Newest live prompt'])
    expect(sessionsGet).toHaveBeenCalledOnce()
    expect(readSession).not.toHaveBeenCalled()
  })

  it('deduplicates cold projections but invalidates immediately when a live Session log appears or grows', async () => {
    const at = '2026-08-16T00:00:00.000Z'
    const room: Room = {
      schemaVersion: ROOM_SCHEMA_VERSION,
      id: 'room-cached',
      name: 'Cached room',
      leaderSessionId: 'leader-1',
      status: 'open',
      revision: 1,
      createdAt: at,
      updatedAt: at,
      members: [
        {
          memberId: 'leader-member',
          kind: 'leader',
          name: 'Leader',
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
          memberId: 'member-1',
          kind: 'member',
          name: 'Member',
          connection: {
            providerId: DSH_SESSION_MEMBER_PROVIDER,
            protocol: DSH_SESSION_MEMBER_PROTOCOL,
            address: { sessionId: 'child-1' },
            sessionId: 'child-1',
          },
          status: 'idle',
          joinedAt: at,
          updatedAt: at,
        },
      ],
      events: [{
        id: 'relay-event',
        type: 'message.direct',
        at,
        targetMemberId: 'member-1',
        relay: {
          id: 'relay-live-cache',
          mode: 'direct',
          deliveries: [{
            memberId: 'member-1',
            status: 'accepted',
            sessionMessageId: 'live-cache-message',
          }],
        },
        message: 'Message delivered to Member',
      }],
    }
    let route: RegisteredRoute | undefined
    const readSession = vi.fn(async () => ({ events: [] }))
    let liveSession: { events: SessionEvent[] } | undefined
    const sessionsGet = vi.fn(() => liveSession)
    const register = vi.fn((candidate: RegisteredRoute) => {
      route = candidate
      return () => undefined
    })
    const context = {
      rooms: { listRoomsForSession: vi.fn(() => [room]) },
      sessions: { get: sessionsGet },
      webServer: { register },
      get: vi.fn((name: string) => name === 'sessionQuery' ? { readSession } : undefined),
      effect: vi.fn((callback: () => unknown) => callback()),
    }
    apply(context as unknown as Context)
    if (!route) throw new Error('native Room route was not registered')

    for (let index = 0; index < 2; index += 1) {
      const res = response()
      await route.handler(request(
        'GET',
        `${ROOM_NATIVE_API_PREFIX}leader-1?roomId=room-cached`,
        'same-origin',
      ), res.value)
      expect(res.status()).toBe(200)
    }
    expect(readSession).toHaveBeenCalledOnce()

    liveSession = {
      events: [
        { type: 'turn/start', seq: 0, time: 100, data: { turn: 1 } },
        {
          type: 'user/message',
          seq: 1,
          time: 101,
          data: {
            id: 'live-cache-message',
            role: 'user',
            content: [{ type: 'text', text: 'Appeared live' }],
            source: {
              kind: 'agent-team-room',
              form: 'relay',
              senderSessionId: 'leader-1',
              roomId: 'room-cached',
              memberId: 'member-1',
              relayId: 'relay-live-cache',
              mode: 'direct',
            },
          },
          surfaceOp: 'append',
        },
      ] as SessionEvent[],
    }
    const appeared = response()
    await route.handler(request(
      'GET',
      `${ROOM_NATIVE_API_PREFIX}leader-1?roomId=room-cached`,
      'same-origin',
    ), appeared.value)
    expect(JSON.parse(String(appeared.body())).rooms[0].conversation.messages.map(
      (message: { text: string }) => message.text,
    )).toEqual(['Appeared live'])
    expect(readSession).toHaveBeenCalledOnce()

    liveSession.events.push({
      type: 'assistant/message',
      seq: 2,
      time: 110,
      data: {
        turn: 1,
        step: 1,
        message: {
          id: 'live-cache-reply',
          role: 'assistant',
          content: [{ type: 'text', text: 'Fresh reply' }],
          source: { kind: 'model', provider: 'fixture', model: 'fixture' },
        },
      },
      surfaceOp: 'append',
    } as SessionEvent)
    const grown = response()
    await route.handler(request(
      'GET',
      `${ROOM_NATIVE_API_PREFIX}leader-1?roomId=room-cached`,
      'same-origin',
    ), grown.value)
    expect(JSON.parse(String(grown.body())).rooms[0].conversation.messages.map(
      (message: { text: string }) => message.text,
    )).toEqual(['Appeared live', 'Fresh reply'])
  })
})

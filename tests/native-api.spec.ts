import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import {
  ROOM_NATIVE_API_PREFIX,
  apply,
  inject,
  isSameSiteRead,
} from '../src/native-api.js'

interface RegisteredRoute {
  kind: 'prefix'
  path: string
  handler(req: IncomingMessage, res: ServerResponse): void
}

function request(method: string, url: string, site?: string): IncomingMessage {
  return {
    method,
    url,
    headers: site ? { 'sec-fetch-site': site } : {},
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
  apply({ webServer: { register }, rooms, effect } as unknown as Context)
  if (!route) throw new Error('native Room route was not registered')
  return { route, rooms, register, effect }
}

describe('native UI read API', () => {
  it('registers one prefix route behind explicit Room and WebServer dependencies', () => {
    const { route, register, effect } = mount()

    expect(inject).toEqual(['rooms', 'webServer'])
    expect(register).toHaveBeenCalledOnce()
    expect(effect).toHaveBeenCalledOnce()
    expect(route).toMatchObject({ kind: 'prefix', path: '/agent-team-room/api' })
    expect(ROOM_NATIVE_API_PREFIX).toBe('/agent-team-room/api/session/')
  })

  it.each([undefined, 'same-origin', 'same-site', 'none'])('accepts same-site browser context %s', (site) => {
    expect(isSameSiteRead(request('GET', '/', site))).toBe(true)
  })

  it.each(['cross-site', 'unknown'])('rejects cross-site browser context %s', (site) => {
    expect(isSameSiteRead(request('GET', '/', site))).toBe(false)
  })

  it('returns only the rooms visible to the requested Session', () => {
    const { route, rooms } = mount()
    const res = response()

    route.handler(request('GET', `${ROOM_NATIVE_API_PREFIX}leader-1`, 'same-origin'), res.value)

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
      }],
    })
    expect(String(res.body())).not.toMatch(/PRIVATE_PROVIDER_ADDRESS|PRIVATE_EVENT|PRIVATE_SUMMARY|sha256:/u)
  })

  it('supports HEAD without exposing a response body', () => {
    const { route, rooms } = mount()
    const res = response()

    route.handler(request('HEAD', `${ROOM_NATIVE_API_PREFIX}leader-1`, 'same-site'), res.value)

    expect(rooms.listRoomsForSession).toHaveBeenCalledOnce()
    expect(res.status()).toBe(200)
    expect(res.body()).toBeUndefined()
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects mutation method %s before touching Room state', (method) => {
    const { route, rooms } = mount()
    const res = response()

    route.handler(request(method, `${ROOM_NATIVE_API_PREFIX}leader-1`, 'same-origin'), res.value)

    expect(rooms.listRoomsForSession).not.toHaveBeenCalled()
    expect(res.status()).toBe(405)
    expect(res.headers()).toEqual({ allow: 'GET, HEAD' })
  })

  it('rejects cross-site reads before resolving a Session', () => {
    const { route, rooms } = mount()
    const res = response()

    route.handler(request('GET', `${ROOM_NATIVE_API_PREFIX}leader-1`, 'cross-site'), res.value)

    expect(rooms.listRoomsForSession).not.toHaveBeenCalled()
    expect(res.status()).toBe(403)
    expect(JSON.parse(String(res.body()))).toEqual({ error: 'cross_site_room_read_denied' })
  })

  it.each([
    ['/agent-team-room/api', 404, 'not_found'],
    [`${ROOM_NATIVE_API_PREFIX}`, 404, 'not_found'],
    [`${ROOM_NATIVE_API_PREFIX}leader-1/extra`, 404, 'not_found'],
    [`${ROOM_NATIVE_API_PREFIX}%E0%A4%A`, 400, 'URI malformed'],
  ])('rejects invalid route %s', (url, expectedStatus, expectedError) => {
    const { route, rooms } = mount()
    const res = response()

    route.handler(request('GET', url, 'same-origin'), res.value)

    expect(rooms.listRoomsForSession).not.toHaveBeenCalled()
    expect(res.status()).toBe(expectedStatus)
    expect(JSON.parse(String(res.body()))).toMatchObject({ error: expect.stringContaining(expectedError) })
  })
})

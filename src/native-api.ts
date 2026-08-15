import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from './index.js'
import type { Room } from './types.js'

export const name = 'agent-team-room-native-api'
export const inject = ['rooms', 'webServer']
export const ROOM_NATIVE_API_PREFIX = '/agent-team-room/api/session/'

function json(req: IncomingMessage, res: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}

/** Reject browser cross-site reads; this endpoint never accepts writes. */
export function isSameSiteRead(req: Pick<IncomingMessage, 'headers'>): boolean {
  const value = req.headers['sec-fetch-site']
  if (value === undefined) return true
  return value === 'same-origin' || value === 'same-site' || value === 'none'
}

/** Whitelist only the fields rendered by the native client. */
export function nativeRoomView(room: Room) {
  return {
    id: room.id,
    name: room.name,
    ...(room.topic ? { topic: room.topic } : {}),
    leaderSessionId: room.leaderSessionId,
    status: room.status,
    members: room.members.map(member => ({
      memberId: member.memberId,
      kind: member.kind,
      name: member.name,
      connection: {
        protocol: member.connection.protocol,
        ...(member.connection.sessionId ? { sessionId: member.connection.sessionId } : {}),
      },
      ...(member.profile ? {
        profile: {
          apiVersion: member.profile.apiVersion,
          kind: member.profile.kind,
          id: member.profile.id,
          ...(member.profile.version ? { version: member.profile.version } : {}),
        },
      } : {}),
      status: member.status,
    })),
  }
}

/**
 * Read-only snapshot transport for the native DSH UI. All mutations still go
 * through Agent-scoped `/room` commands and repeat Room ownership checks.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/agent-team-room/api',
    handler(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' })
        res.end()
        return
      }
      if (!isSameSiteRead(req)) {
        json(req, res, 403, { error: 'cross_site_room_read_denied' })
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.local').pathname
      if (!pathname.startsWith(ROOM_NATIVE_API_PREFIX)) {
        json(req, res, 404, { error: 'not_found' })
        return
      }
      const encoded = pathname.slice(ROOM_NATIVE_API_PREFIX.length)
      if (encoded.length === 0 || encoded.includes('/')) {
        json(req, res, 404, { error: 'not_found' })
        return
      }
      try {
        const sessionId = decodeURIComponent(encoded)
        json(req, res, 200, {
          rooms: ctx.rooms.listRoomsForSession(sessionId, true).map(nativeRoomView),
        })
      } catch (error) {
        json(req, res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'agent-team-room: native UI read API')
}

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session-query'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { projectRoomConversation, type NativeRoomConversation } from './conversation.js'
import type {} from './index.js'
import {
  DSH_SESSION_MEMBER_PROTOCOL,
  DSH_SESSION_MEMBER_PROVIDER,
  type Room,
  type RoomEvent,
  type RoomMember,
} from './types.js'

export const name = 'agent-team-room-native-api'
export const inject = ['rooms', 'sessions', 'webServer']
export const ROOM_NATIVE_API_PREFIX = '/agent-team-room/api/session/'
export const ROOM_NATIVE_CLIENT_HEADER = 'x-agent-team-room-client'
export const ROOM_CONVERSATION_CACHE_MS = 2_500
const ROOM_CONVERSATION_CACHE_LIMIT = 256
const ROOM_NATIVE_ROOM_LIMIT = 200
const ROOM_CONVERSATION_READ_CONCURRENCY = 4

function json(req: IncomingMessage, res: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(body)),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  res.end(body)
}

/** Browser hardening only; deployments still need origin authentication. */
export function isSameSiteRead(req: Pick<IncomingMessage, 'headers'>): boolean {
  return req.headers['sec-fetch-site'] === 'same-origin'
}

export function isNativeRoomClient(req: Pick<IncomingMessage, 'headers'>): boolean {
  return req.headers[ROOM_NATIVE_CLIENT_HEADER] === '1'
}

/** Whitelist only the fields rendered by the native client. */
export function nativeRoomView(room: Room, includeActivity = true) {
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
    ...(includeActivity ? {
      activity: room.events.slice(-200).map(event => ({
        id: event.id,
        type: event.type,
        at: event.at,
        ...(event.actorMemberId ? { actorMemberId: event.actorMemberId } : {}),
        ...(event.targetMemberId ? { targetMemberId: event.targetMemberId } : {}),
        ...(event.relay ? {
          relayId: event.relay.id,
          acceptedCount: event.relay.deliveries.filter(delivery => delivery.status === 'accepted').length,
          failedCount: event.relay.deliveries.filter(delivery => delivery.status === 'failed').length,
        } : {}),
        label: nativeActivityLabel(room, event),
      })),
    } : {}),
  }
}

function memberName(room: Room, memberId: string | undefined): string {
  return room.members.find(member => member.memberId === memberId)?.name ?? 'Member'
}

/** Metadata-only copy for lifecycle rows; arbitrary stored summaries stay private. */
export function nativeActivityLabel(room: Room, event: RoomEvent): string {
  switch (event.type) {
    case 'room.created': return 'Room created'
    case 'room.closed': return 'Room closed'
    case 'member.joined': return `${memberName(room, event.targetMemberId)} joined`
    case 'member.left': return `${memberName(room, event.targetMemberId)} left`
    case 'member.started': return `${memberName(room, event.targetMemberId)} started a turn`
    case 'member.settled': return `${memberName(room, event.targetMemberId)} finished a turn`
    case 'message.direct': {
      if (!event.relay) return 'Legacy direct-message delivery'
      const accepted = event.relay.deliveries.some(delivery => delivery.status === 'accepted')
      return accepted
        ? `Message accepted for ${memberName(room, event.targetMemberId)}`
        : `Message failed for ${memberName(room, event.targetMemberId)}`
    }
    case 'message.broadcast': {
      if (!event.relay) return 'Legacy broadcast delivery'
      const accepted = event.relay.deliveries.filter(delivery => delivery.status === 'accepted').length
      const failed = event.relay.deliveries.length - accepted
      return failed > 0
        ? `Broadcast accepted for ${accepted}; failed for ${failed}`
        : `Broadcast accepted for ${accepted} member(s)`
    }
    case 'system.recovered': return 'Room member state recovered after restart'
    case 'system.migrated': return 'Room metadata migrated'
    default: return 'Room updated'
  }
}

async function memberEvents(ctx: Context, member: RoomMember): Promise<readonly SessionEvent[] | undefined> {
  const sessionId = member.connection.sessionId
  if (!sessionId
    || member.connection.providerId !== DSH_SESSION_MEMBER_PROVIDER
    || member.connection.protocol !== DSH_SESSION_MEMBER_PROTOCOL) return undefined
  const live = ctx.sessions.get(SessionId(sessionId))
  if (live) return live.events
  const query = ctx.get('sessionQuery')
  if (query) return (await query.readSession(SessionId(sessionId))).events
  return undefined
}

function liveConversationRevision(ctx: Context, room: Room): string {
  const tails = room.members.flatMap((member) => {
    const sessionId = member.connection.sessionId
    if (member.kind !== 'member'
      || !sessionId
      || member.connection.providerId !== DSH_SESSION_MEMBER_PROVIDER
      || member.connection.protocol !== DSH_SESSION_MEMBER_PROTOCOL) return []
    const events = ctx.sessions.get(SessionId(sessionId))?.events
    const last = events?.at(-1)
    return [`${member.memberId}:${events?.length ?? 'cold'}:${last?.seq ?? 'none'}`]
  })
  return `${room.revision}|${tails.join('|')}`
}

/** Read-through projection: Room stores correlation only; DSH Session logs keep message bodies. */
export async function nativeRoomConversation(ctx: Context, room: Room): Promise<NativeRoomConversation> {
  const histories = new Map<string, readonly SessionEvent[]>()
  const unavailable = new Set<string>()
  const members = room.members.filter(member => member.kind === 'member')
  let cursor = 0
  await Promise.all(Array.from({
    length: Math.min(ROOM_CONVERSATION_READ_CONCURRENCY, members.length),
  }, async () => {
    while (cursor < members.length) {
      const member = members[cursor]
      cursor += 1
      if (!member) continue
      try {
        const events = await memberEvents(ctx, member)
        if (events) histories.set(member.memberId, events)
        else unavailable.add(member.memberId)
      } catch {
        // Per-member persistence faults must not leak paths or break the complete Room snapshot.
        unavailable.add(member.memberId)
      }
    }
  }))
  return projectRoomConversation(
    room,
    histories,
    members.filter(member => unavailable.has(member.memberId)).map(member => member.memberId),
  )
}

/**
 * Read-only snapshot transport for the native DSH UI. All mutations still go
 * through Agent-scoped `/room` commands and repeat Room ownership checks.
 */
export function apply(ctx: Context): void {
  const conversationCache = new Map<string, {
    sourceRevision: string
    expiresAt: number
    value: Promise<NativeRoomConversation>
    timer?: ReturnType<typeof setTimeout>
  }>()
  const removeCached = (roomId: string): void => {
    const cached = conversationCache.get(roomId)
    if (cached?.timer) clearTimeout(cached.timer)
    conversationCache.delete(roomId)
  }
  const cachedConversation = (room: Room): Promise<NativeRoomConversation> => {
    const currentTime = Date.now()
    for (const [roomId, entry] of conversationCache) {
      if (entry.expiresAt <= currentTime) removeCached(roomId)
    }
    const sourceRevision = liveConversationRevision(ctx, room)
    const cached = conversationCache.get(room.id)
    if (cached && cached.sourceRevision === sourceRevision && cached.expiresAt > currentTime) return cached.value
    const value = nativeRoomConversation(ctx, room)
    removeCached(room.id)
    const entry = {
      sourceRevision,
      expiresAt: currentTime + ROOM_CONVERSATION_CACHE_MS,
      value,
    }
    const cachedEntry: typeof entry & { timer?: ReturnType<typeof setTimeout> } = entry
    cachedEntry.timer = setTimeout(() => {
      if (conversationCache.get(room.id) === cachedEntry) conversationCache.delete(room.id)
    }, ROOM_CONVERSATION_CACHE_MS)
    cachedEntry.timer.unref?.()
    conversationCache.set(room.id, cachedEntry)
    while (conversationCache.size > ROOM_CONVERSATION_CACHE_LIMIT) {
      const oldest = conversationCache.keys().next().value as string | undefined
      if (oldest === undefined) break
      removeCached(oldest)
    }
    return value
  }
  ctx.effect(() => {
    const disposeRoute = ctx.webServer.register({
      kind: 'prefix',
      path: '/agent-team-room/api',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' })
          res.end()
          return
        }
        if (!isSameSiteRead(req) || !isNativeRoomClient(req)) {
          json(req, res, 403, { error: 'native_room_read_denied' })
          return
        }
        const url = new URL(req.url ?? '/', 'http://dsh.local')
        const pathname = url.pathname
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
          const rooms = ctx.rooms.listRoomsForSession(sessionId, true).slice(0, ROOM_NATIVE_ROOM_LIMIT)
          const selectedRoomId = url.searchParams.get('roomId') ?? undefined
          const selectedRoom = selectedRoomId
            ? rooms.find(room => room.id === selectedRoomId)
            : undefined
          if (selectedRoomId && !selectedRoom) {
            json(req, res, 404, { error: 'room_not_visible' })
            return
          }
          json(req, res, 200, {
            rooms: await Promise.all(rooms.map(async room => room === selectedRoom
              ? {
                  ...nativeRoomView(room, true),
                  conversation: await cachedConversation(room),
                }
              : nativeRoomView(room, false))),
          })
        } catch (error) {
          json(req, res, 400, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    })
    return () => {
      disposeRoute()
      for (const roomId of [...conversationCache.keys()]) removeCached(roomId)
    }
  }, 'agent-team-room: native UI read API')
}

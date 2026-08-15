import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import {
  DSH_SESSION_MEMBER_PROTOCOL,
  DSH_SESSION_MEMBER_PROVIDER,
  ROOM_SCHEMA_VERSION,
  type PersistedRoomDocument,
  type Room,
  type RoomEvent,
  type RoomEventType,
  type RoomMember,
} from './types.js'

export function defaultStorageFile(): string {
  const dshHome = process.env.DSH_HOME?.trim()
  const root = dshHome && dshHome.length > 0 ? resolve(dshHome) : join(homedir(), '.dsh')
  return join(root, 'agent-team-room', 'rooms.json')
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`agent-team-room: ${field} is not an object`)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`agent-team-room: ${field} is not a non-empty string`)
  }
  return value
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  return string(value, field)
}

function assertMember(value: unknown, roomIndex: number, memberIndex: number): asserts value is RoomMember {
  const member = record(value, `stored room ${roomIndex} member ${memberIndex}`)
  string(member['memberId'], `stored room ${roomIndex} member ${memberIndex} memberId`)
  if (member['kind'] !== 'leader' && member['kind'] !== 'member') {
    throw new Error(`agent-team-room: stored room ${roomIndex} member ${memberIndex} has an unsupported kind`)
  }
  string(member['name'], `stored room ${roomIndex} member ${memberIndex} name`)
  const connection = record(member['connection'], `stored room ${roomIndex} member ${memberIndex} connection`)
  string(connection['providerId'], `stored room ${roomIndex} member ${memberIndex} providerId`)
  string(connection['protocol'], `stored room ${roomIndex} member ${memberIndex} protocol`)
  if (connection['address'] === undefined) {
    throw new Error(`agent-team-room: stored room ${roomIndex} member ${memberIndex} has no address`)
  }
  optionalString(connection['sessionId'], `stored room ${roomIndex} member ${memberIndex} sessionId`)
  if (!['leader', 'working', 'idle', 'interrupted', 'error', 'removed'].includes(String(member['status']))) {
    throw new Error(`agent-team-room: stored room ${roomIndex} member ${memberIndex} has an unsupported status`)
  }
  if (member['profile'] !== undefined) {
    const profile = record(member['profile'], `stored room ${roomIndex} member ${memberIndex} profile`)
    string(profile['apiVersion'], `stored room ${roomIndex} member ${memberIndex} profile apiVersion`)
    string(profile['kind'], `stored room ${roomIndex} member ${memberIndex} profile kind`)
    string(profile['id'], `stored room ${roomIndex} member ${memberIndex} profile id`)
    const version = optionalString(profile['version'], `stored room ${roomIndex} member ${memberIndex} profile version`)
    const digest = optionalString(profile['digest'], `stored room ${roomIndex} member ${memberIndex} profile digest`)
    if (profile['apiVersion'] === 'rolehub.dev/v1alpha1') {
      if (profile['kind'] !== 'AgentRole' || version === undefined || digest === undefined
        || !/^sha256:[a-f0-9]{64}$/u.test(digest)) {
        throw new Error(`agent-team-room: stored room ${roomIndex} member ${memberIndex} has an invalid RoleHub profile`)
      }
    }
  }
}

function assertRoom(value: unknown, index: number): asserts value is Room {
  const room = record(value, `stored room ${index}`)
  if (room['schemaVersion'] !== ROOM_SCHEMA_VERSION) {
    throw new Error(`agent-team-room: stored room ${index} has an unsupported schema`)
  }
  string(room['id'], `stored room ${index} id`)
  string(room['name'], `stored room ${index} name`)
  string(room['leaderSessionId'], `stored room ${index} leaderSessionId`)
  if (room['status'] !== 'open' && room['status'] !== 'closed') {
    throw new Error(`agent-team-room: stored room ${index} has an unsupported status`)
  }
  if (!Array.isArray(room['members']) || !Array.isArray(room['events'])) {
    throw new Error(`agent-team-room: stored room ${index} is missing collections`)
  }
  room['members'].forEach((member, memberIndex) => assertMember(member, index, memberIndex))
  if (!room['members'].some(member => record(member, 'stored member')['kind'] === 'leader')) {
    throw new Error(`agent-team-room: stored room ${index} has no leader`)
  }
}

function legacyEventType(value: unknown): RoomEventType {
  switch (value) {
    case 'room.created':
    case 'room.closed':
    case 'member.joined':
    case 'member.left':
    case 'member.started':
    case 'member.settled':
    case 'system.recovered':
      return value
    case 'message.direct':
    case 'message.broadcast':
      return value
    default:
      return 'system.migrated'
  }
}

function migrateV1Room(value: unknown, index: number): Room {
  const legacy = record(value, `stored room ${index}`)
  if (legacy['schemaVersion'] !== 1) {
    throw new Error(`agent-team-room: stored room ${index} has an unsupported schema`)
  }
  const id = string(legacy['id'], `stored room ${index} id`)
  const leaderSessionId = string(legacy['leaderAgentId'], `stored room ${index} leaderAgentId`)
  if (!Array.isArray(legacy['members']) || !Array.isArray(legacy['events'])) {
    throw new Error(`agent-team-room: stored room ${index} is missing collections`)
  }
  const memberIds = new Map<string, string>()
  const members: RoomMember[] = legacy['members'].map((candidate, memberIndex) => {
    const member = record(candidate, `stored room ${index} member ${memberIndex}`)
    const sessionId = string(member['agentId'], `stored room ${index} member ${memberIndex} agentId`)
    const memberId = randomUUID()
    memberIds.set(sessionId, memberId)
    const kind = member['kind'] === 'leader' ? 'leader' : 'member'
    const legacyStatus = string(member['status'], `stored room ${index} member ${memberIndex} status`)
    const status: RoomMember['status'] = kind === 'leader'
      ? 'leader'
      : legacyStatus === 'starting' ? 'working'
        : legacyStatus === 'working' || legacyStatus === 'idle' || legacyStatus === 'interrupted'
          || legacyStatus === 'error' || legacyStatus === 'removed'
          ? legacyStatus
          : 'idle'
    return {
      memberId,
      kind,
      name: string(member['name'], `stored room ${index} member ${memberIndex} name`),
      connection: {
        providerId: DSH_SESSION_MEMBER_PROVIDER,
        protocol: DSH_SESSION_MEMBER_PROTOCOL,
        address: { sessionId },
        sessionId,
      },
      status,
      joinedAt: string(member['joinedAt'], `stored room ${index} member ${memberIndex} joinedAt`),
      updatedAt: string(member['updatedAt'], `stored room ${index} member ${memberIndex} updatedAt`),
    }
  })
  const events: RoomEvent[] = legacy['events'].map((candidate, eventIndex) => {
    const event = record(candidate, `stored room ${index} event ${eventIndex}`)
    const originalType = event['type']
    const type = legacyEventType(originalType)
    const originalMessage = string(event['message'], `stored room ${index} event ${eventIndex} message`)
    const message = originalType === 'message.direct'
      ? 'Legacy direct-message delivery migrated without duplicated message content'
      : originalType === 'message.broadcast'
        ? 'Legacy broadcast delivery migrated without duplicated message content'
        : type === 'system.migrated'
          ? `Legacy ${String(originalType)} record migrated: ${originalMessage.slice(0, 240)}`
          : originalMessage
    const actorSessionId = optionalString(event['actorAgentId'], `stored room ${index} event ${eventIndex} actorAgentId`)
    const targetSessionId = optionalString(event['targetAgentId'], `stored room ${index} event ${eventIndex} targetAgentId`)
    const actorMemberId = actorSessionId ? memberIds.get(actorSessionId) : undefined
    const targetMemberId = targetSessionId ? memberIds.get(targetSessionId) : undefined
    return {
      id: string(event['id'], `stored room ${index} event ${eventIndex} id`),
      type,
      at: string(event['at'], `stored room ${index} event ${eventIndex} at`),
      message,
      ...(actorMemberId ? { actorMemberId } : {}),
      ...(targetMemberId ? { targetMemberId } : {}),
    }
  })
  const tasks = Array.isArray(legacy['tasks']) ? legacy['tasks'] : []
  if (tasks.length > 0) {
    events.push({
      id: randomUUID(),
      type: 'system.migrated',
      at: new Date().toISOString(),
      message: `Removed ${tasks.length} legacy task-board record(s) while upgrading Room to the membership-only schema`,
    })
  }
  const topic = optionalString(legacy['objective'], `stored room ${index} objective`)
  const closedAt = optionalString(legacy['closedAt'], `stored room ${index} closedAt`)
  const summary = optionalString(legacy['summary'], `stored room ${index} summary`)
  const room: Room = {
    schemaVersion: ROOM_SCHEMA_VERSION,
    id,
    name: string(legacy['name'], `stored room ${index} name`),
    ...(topic ? { topic } : {}),
    leaderSessionId,
    status: legacy['status'] === 'closed' ? 'closed' : 'open',
    revision: typeof legacy['revision'] === 'number' ? legacy['revision'] + 1 : 1,
    createdAt: string(legacy['createdAt'], `stored room ${index} createdAt`),
    updatedAt: string(legacy['updatedAt'], `stored room ${index} updatedAt`),
    ...(closedAt ? { closedAt } : {}),
    ...(summary ? { summary } : {}),
    members,
    events,
  }
  assertRoom(room, index)
  return room
}

function parseDocument(raw: string, file: string): { rooms: Room[]; migrated: boolean } {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new Error(`agent-team-room: cannot parse storage file ${file}`, { cause: error })
  }
  const document = record(value, `storage file ${file}`)
  if (!Array.isArray(document['rooms'])) {
    throw new Error(`agent-team-room: storage file ${file} uses an unsupported schema`)
  }
  if (document['schemaVersion'] === 1) {
    return { rooms: document['rooms'].map(migrateV1Room), migrated: true }
  }
  if (document['schemaVersion'] !== ROOM_SCHEMA_VERSION) {
    throw new Error(`agent-team-room: storage file ${file} uses an unsupported schema`)
  }
  document['rooms'].forEach(assertRoom)
  return { rooms: structuredClone(document['rooms'] as Room[]), migrated: false }
}

/** Atomic JSON-file persistence with one-shot v1 → v2 migration. */
export class RoomStorage {
  readonly file: string
  migrated = false

  constructor(file?: string) {
    this.file = file && file.trim().length > 0 ? resolve(file) : defaultStorageFile()
  }

  async load(): Promise<Room[]> {
    try {
      const parsed = parseDocument(await readFile(this.file, 'utf8'), this.file)
      this.migrated = parsed.migrated
      return structuredClone(parsed.rooms)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  async save(rooms: readonly Room[]): Promise<void> {
    const directory = dirname(this.file)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporary = join(directory, `.rooms.${process.pid}.${randomUUID()}.tmp`)
    const document: PersistedRoomDocument = {
      schemaVersion: ROOM_SCHEMA_VERSION,
      rooms: structuredClone([...rooms]),
    }
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.file)
    this.migrated = false
  }
}

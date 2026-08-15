import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RoomStorage, defaultStorageFile } from '../src/storage.js'
import {
  DSH_SESSION_MEMBER_PROTOCOL,
  DSH_SESSION_MEMBER_PROVIDER,
  ROOM_SCHEMA_VERSION,
  type Room,
} from '../src/types.js'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'agent-team-room-test-'))
  temporaryDirectories.push(directory)
  return directory
}

function room(id = 'room-1'): Room {
  const at = '2026-08-14T00:00:00.000Z'
  return {
    schemaVersion: ROOM_SCHEMA_VERSION,
    id,
    name: 'Test room',
    topic: 'Prove persistence',
    leaderSessionId: 'leader-1',
    status: 'open',
    revision: 1,
    createdAt: at,
    updatedAt: at,
    members: [{
      memberId: 'member-leader',
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
    }],
    events: [{
      id: 'event-1',
      type: 'room.created',
      at,
      actorMemberId: 'member-leader',
      message: 'Created',
    }],
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('RoomStorage v2', () => {
  it('atomically replaces and round-trips a detached membership-only document', async () => {
    const directory = await temporaryDirectory()
    const file = join(directory, 'nested', 'rooms.json')
    const storage = new RoomStorage(file)
    const first = room('first')

    await storage.save([first])
    first.name = 'mutated after save'

    const loaded = await storage.load()
    expect(storage.migrated).toBe(false)
    expect(loaded).toEqual([expect.objectContaining({
      schemaVersion: ROOM_SCHEMA_VERSION,
      id: 'first',
      name: 'Test room',
      topic: 'Prove persistence',
    })])
    loaded[0]!.name = 'mutated after load'
    expect((await storage.load())[0]!.name).toBe('Test room')

    await storage.save([room('replacement')])
    expect((await storage.load()).map(item => item.id)).toEqual(['replacement'])
    expect(await readdir(join(directory, 'nested'))).toEqual(['rooms.json'])
    expect((await readFile(file, 'utf8')).endsWith('\n')).toBe(true)
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  })

  it('treats a missing storage file as an empty room list', async () => {
    const directory = await temporaryDirectory()
    await expect(new RoomStorage(join(directory, 'missing.json')).load()).resolves.toEqual([])
  })

  it('rejects malformed JSON with the storage filename in the diagnostic', async () => {
    const directory = await temporaryDirectory()
    const file = join(directory, 'rooms.json')
    await writeFile(file, '{ definitely not json', 'utf8')

    await expect(new RoomStorage(file).load()).rejects.toThrow(`cannot parse storage file ${file}`)
  })

  it.each([
    ['a non-object root', '[]', 'is not an object'],
    ['an unsupported document schema', '{"schemaVersion":3,"rooms":[]}', 'uses an unsupported schema'],
    [
      'an invalid room schema',
      '{"schemaVersion":2,"rooms":[{"schemaVersion":1,"id":"room","name":"bad","members":[],"events":[]}]}',
      'stored room 0 has an unsupported schema',
    ],
    [
      'missing room collections',
      '{"schemaVersion":2,"rooms":[{"schemaVersion":2,"id":"room","name":"bad","leaderSessionId":"leader","status":"open"}]}',
      'stored room 0 is missing collections',
    ],
    [
      'a room without a leader',
      '{"schemaVersion":2,"rooms":[{"schemaVersion":2,"id":"room","name":"bad","leaderSessionId":"leader","status":"open","members":[],"events":[]}]}',
      'stored room 0 has no leader',
    ],
  ])('rejects %s', async (_description, contents, message) => {
    const directory = await temporaryDirectory()
    const file = join(directory, 'rooms.json')
    await writeFile(file, contents, 'utf8')

    await expect(new RoomStorage(file).load()).rejects.toThrow(message)
  })
})

describe('RoomStorage v1 migration', () => {
  it('maps legacy agents to provider-backed members and removes task-board data', async () => {
    const directory = await temporaryDirectory()
    const file = join(directory, 'rooms.json')
    const at = '2026-08-14T00:00:00.000Z'
    const legacySecret = 'LEGACY_MESSAGE_BODY_MUST_BE_REMOVED'
    await writeFile(file, JSON.stringify({
      schemaVersion: 1,
      rooms: [{
        schemaVersion: 1,
        id: 'legacy-room',
        name: 'Legacy team',
        objective: 'Legacy objective',
        leaderAgentId: 'legacy-leader',
        status: 'open',
        revision: 7,
        createdAt: at,
        updatedAt: at,
        members: [
          {
            agentId: 'legacy-leader',
            kind: 'leader',
            name: 'Leader',
            role: 'Coordinator',
            status: 'leader',
            joinedAt: at,
            updatedAt: at,
          },
          {
            agentId: 'legacy-worker',
            kind: 'agent',
            name: 'Worker',
            role: 'Engineer',
            status: 'starting',
            joinedAt: at,
            updatedAt: at,
          },
        ],
        tasks: [{ id: 'legacy-task', title: 'Remove me' }],
        events: [{
          id: 'legacy-event',
          type: 'message.direct',
          at,
          actorAgentId: 'legacy-leader',
          targetAgentId: 'legacy-worker',
          message: legacySecret,
        }],
      }],
    }), 'utf8')

    const storage = new RoomStorage(file)
    const [migrated] = await storage.load()

    expect(storage.migrated).toBe(true)
    expect(migrated).toMatchObject({
      schemaVersion: ROOM_SCHEMA_VERSION,
      id: 'legacy-room',
      name: 'Legacy team',
      topic: 'Legacy objective',
      leaderSessionId: 'legacy-leader',
      revision: 8,
    })
    expect(migrated).not.toHaveProperty('objective')
    expect(migrated).not.toHaveProperty('tasks')
    expect(migrated!.members).toEqual([
      expect.objectContaining({
        kind: 'leader',
        status: 'leader',
        connection: expect.objectContaining({
          providerId: DSH_SESSION_MEMBER_PROVIDER,
          protocol: DSH_SESSION_MEMBER_PROTOCOL,
          sessionId: 'legacy-leader',
        }),
      }),
      expect.objectContaining({
        kind: 'member',
        status: 'working',
        connection: expect.objectContaining({ sessionId: 'legacy-worker' }),
      }),
    ])
    const direct = migrated!.events.find(event => event.id === 'legacy-event')!
    expect(direct).toMatchObject({
      type: 'message.direct',
      message: 'Legacy direct-message delivery migrated without duplicated message content',
      actorMemberId: migrated!.members[0]!.memberId,
      targetMemberId: migrated!.members[1]!.memberId,
    })
    expect(JSON.stringify(migrated)).not.toContain(legacySecret)
    expect(migrated!.events.at(-1)).toMatchObject({
      type: 'system.migrated',
      message: 'Removed 1 legacy task-board record(s) while upgrading Room to the membership-only schema',
    })

    await storage.save([migrated!])
    expect(storage.migrated).toBe(false)
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ schemaVersion: ROOM_SCHEMA_VERSION })
    await expect(storage.load()).resolves.toEqual([migrated])
  })
})

describe('defaultStorageFile', () => {
  it('uses a trimmed DSH_HOME when configured', () => {
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = '  /tmp/custom-dsh-home  '
    try {
      expect(defaultStorageFile()).toBe('/tmp/custom-dsh-home/agent-team-room/rooms.json')
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  })
})

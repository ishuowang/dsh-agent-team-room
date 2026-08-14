import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RoomStorage, defaultStorageFile } from '../src/storage.js'
import { ROOM_SCHEMA_VERSION, type Room } from '../src/types.js'

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
    objective: 'Prove persistence',
    leaderAgentId: 'leader-1',
    status: 'open',
    revision: 1,
    createdAt: at,
    updatedAt: at,
    members: [{
      agentId: 'leader-1',
      kind: 'leader',
      name: 'Leader',
      role: 'Coordinator',
      status: 'leader',
      joinedAt: at,
      updatedAt: at,
    }],
    tasks: [],
    events: [{
      id: 'event-1',
      type: 'room.created',
      at,
      actorAgentId: 'leader-1',
      message: 'Created',
    }],
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('RoomStorage', () => {
  it('atomically replaces and round-trips a detached room document', async () => {
    const directory = await temporaryDirectory()
    const file = join(directory, 'nested', 'rooms.json')
    const storage = new RoomStorage(file)
    const first = room('first')

    await storage.save([first])
    first.name = 'mutated after save'

    const loaded = await storage.load()
    expect(loaded).toEqual([expect.objectContaining({ id: 'first', name: 'Test room' })])
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
    ['an unsupported document schema', '{"schemaVersion":2,"rooms":[]}', 'uses an unsupported schema'],
    [
      'an invalid room schema',
      '{"schemaVersion":1,"rooms":[{"schemaVersion":2,"id":"room","name":"bad","members":[],"tasks":[],"events":[]}]}',
      'stored room 0 has an unsupported schema',
    ],
    [
      'missing room collections',
      '{"schemaVersion":1,"rooms":[{"schemaVersion":1,"id":"room","name":"bad"}]}',
      'stored room 0 is missing collections',
    ],
  ])('rejects %s', async (_description, contents, message) => {
    const directory = await temporaryDirectory()
    const file = join(directory, 'rooms.json')
    await writeFile(file, contents, 'utf8')

    await expect(new RoomStorage(file).load()).rejects.toThrow(message)
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

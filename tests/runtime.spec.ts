import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock, MessageId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {
  SubagentFollowupOptions,
  SubagentInterruptAuthority,
  SubagentListEntry,
  SubagentRunEndInfo,
  SubagentRunInfo,
} from '@deepseek-ai/dsh-subagent'
import { afterEach, describe, expect, it } from 'vitest'
import RoomRuntime, {
  DSH_SESSION_MEMBER_PROTOCOL,
  DSH_SESSION_MEMBER_PROVIDER,
  ROLEHUB_ROLE_API_VERSION,
  type Config,
  type RoomMemberProvider,
} from '../src/index.js'

interface FollowupCall {
  parent: Agent
  childId: string
  content: ContentBlock[]
  options: SubagentFollowupOptions
}

class FakeSubagents extends Service {
  readonly followups: FollowupCall[] = []
  readonly interrupts: Array<{ childId: string; authority: SubagentInterruptAuthority }> = []
  children: SubagentListEntry[] = []
  failFollowup: Error | undefined
  listedParentId: string | undefined

  constructor(ctx: Context) {
    super(ctx, 'subagents')
  }

  async followup(
    parent: Agent,
    childId: SessionId,
    content: ContentBlock[],
    options: SubagentFollowupOptions,
  ): Promise<MessageId> {
    this.followups.push({ parent, childId, content, options })
    if (this.failFollowup) throw this.failFollowup
    return `followup-${this.followups.length}` as MessageId
  }

  async listChildren(parentId: SessionId, _signal?: AbortSignal): Promise<SubagentListEntry[]> {
    this.listedParentId = parentId
    return structuredClone(this.children)
  }

  interrupt(childId: SessionId, authority: SubagentInterruptAuthority): void {
    this.interrupts.push({ childId, authority })
  }
}

interface Harness {
  context: Context
  runtime: RoomRuntime
  subagents: FakeSubagents
  storageFile: string
}

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

const temporaryDirectories: string[] = []

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

function leader(id = 'leader-1'): Agent {
  return { id } as unknown as Agent
}

function signal(): AbortSignal {
  return new AbortController().signal
}

function child(id: string, activity: 'running' | 'inactive' = 'inactive'): SubagentListEntry {
  return {
    kind: 'child',
    id: SessionId(id),
    activity,
    hasChildren: false,
    mode: 'continuable',
    label: `Session ${id}`,
  }
}

function startInfo(childId: string): SubagentRunInfo {
  return {
    runId: 'run-1' as SubagentRunInfo['runId'],
    provider: 'fake-provider',
    id: SessionId(childId),
    local: true,
  }
}

function endInfo(childId: string, stopReason: 'completed' | 'error'): SubagentRunEndInfo {
  return {
    ...startInfo(childId),
    stopReason,
    lastAssistantMessage: [{ type: 'text', text: 'private child output' }],
  }
}

async function createHarness(storageFile?: string, overrides: Partial<Config> = {}): Promise<Harness> {
  let file = storageFile
  if (!file) {
    const directory = await mkdtemp(join(tmpdir(), 'agent-team-room-runtime-'))
    temporaryDirectories.push(directory)
    file = join(directory, 'rooms.json')
  }
  const context = new Context()
  const subagents = new FakeSubagents(context)
  const runtime = new RoomRuntime(context, {
    storageFile: file,
    maxMembersPerRoom: 4,
    maxMessageChars: 2_000,
    maxEventsPerRoom: 10_000,
    ...overrides,
  })
  await runtime[Service.init]()
  return { context, runtime, subagents, storageFile: file }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('RoomRuntime ownership and provider SPI', () => {
  it('creates an owned room, exposes detached copies, and keeps other leaders out', async () => {
    const { runtime } = await createHarness()
    const owner = leader()
    const outsider = leader('leader-2')

    const created = await runtime.createRoom(owner, { name: '  Release room  ', topic: '  Ship safely  ' })

    expect(created).toMatchObject({
      schemaVersion: 2,
      name: 'Release room',
      topic: 'Ship safely',
      leaderSessionId: owner.id,
      status: 'open',
      revision: 1,
    })
    expect(created.members).toEqual([
      expect.objectContaining({
        kind: 'leader',
        name: 'Leader',
        status: 'leader',
        connection: {
          providerId: DSH_SESSION_MEMBER_PROVIDER,
          protocol: DSH_SESSION_MEMBER_PROTOCOL,
          address: { sessionId: owner.id },
          sessionId: owner.id,
        },
      }),
    ])
    expect(created.events).toEqual([
      expect.objectContaining({
        type: 'room.created',
        actorMemberId: created.members[0]!.memberId,
      }),
    ])
    expect(runtime.listRooms(owner)).toEqual([
      expect.objectContaining({ id: created.id, memberCount: 1, leaderSessionId: owner.id }),
    ])
    expect(runtime.listRooms(outsider)).toEqual([])
    expect(runtime.listRoomsForSession(owner.id)).toHaveLength(1)
    expect(() => runtime.getRoom(outsider, created.id)).toThrow('caller does not lead room')

    created.name = 'caller mutation'
    created.members[0]!.name = 'caller mutation'
    expect(runtime.getRoom(owner, created.id)).toMatchObject({
      name: 'Release room',
      members: [expect.objectContaining({ name: 'Leader' })],
    })
  })

  it('keeps durable mutations committed when an observer throws', async () => {
    const { runtime, storageFile } = await createHarness()
    const owner = leader()
    runtime.subscribe(() => {
      throw new Error('broken observer')
    })

    const room = await runtime.createRoom(owner, { name: 'Observable room' })

    expect(runtime.getRoom(owner, room.id).name).toBe('Observable room')
    expect(await readFile(storageFile, 'utf8')).toContain(room.id)
  })

  it('registers a provider, preserves trusted provenance, and rolls back an invalid profile', async () => {
    const { runtime } = await createHarness()
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Provider room' })
    const rollbacks: string[] = []
    const provider: RoomMemberProvider = {
      id: 'remote-session',
      attach: async ({ descriptor, requestedName, requestedProfile }) => ({
        name: requestedName || 'Remote member',
        connection: {
          protocol: 'remote.session/v1',
          address: descriptor,
        },
        ...(requestedProfile ? { profile: requestedProfile } : {}),
        initialStatus: 'idle',
        rollback: async () => { rollbacks.push('rolled back') },
      }),
      deliver: async () => ({ deliveryId: 'delivery-1' }),
    }

    const unregister = runtime.registerMemberProvider(provider)
    expect(runtime.listMemberProviders()).toEqual([DSH_SESSION_MEMBER_PROVIDER, 'remote-session'])
    expect(() => runtime.registerMemberProvider(provider)).toThrow('already registered')

    const profile = {
      apiVersion: ROLEHUB_ROLE_API_VERSION,
      kind: 'AgentRole' as const,
      id: 'reviewer',
      version: '1.2.0',
      digest: `sha256:${'a'.repeat(64)}` as const,
    }
    const attached = await runtime.attachMember(owner, room.id, {
      providerId: provider.id,
      descriptor: { endpoint: 'remote://reviewer' },
      name: '  Reviewer  ',
      profile,
    }, signal())

    expect(attached).toMatchObject({
      kind: 'member',
      name: 'Reviewer',
      status: 'idle',
      connection: {
        providerId: 'remote-session',
        protocol: 'remote.session/v1',
        address: { endpoint: 'remote://reviewer' },
      },
      profile,
    })
    expect(runtime.listRooms(owner)[0]).toMatchObject({ memberCount: 2, roleHubMemberCount: 1 })

    await expect(runtime.attachMember(owner, room.id, {
      providerId: provider.id,
      descriptor: { endpoint: 'remote://invalid-role' },
      profile: {
        apiVersion: ROLEHUB_ROLE_API_VERSION,
        kind: 'AgentRole',
        id: 'invalid',
        version: '1.0.0',
        digest: 'sha256:not-a-digest',
      },
    }, signal())).rejects.toThrow('RoleHub digest')
    expect(rollbacks).toEqual(['rolled back'])

    unregister()
    unregister()
    expect(runtime.listMemberProviders()).toEqual([DSH_SESSION_MEMBER_PROVIDER])
    await expect(runtime.attachMember(owner, room.id, {
      providerId: provider.id,
      descriptor: {},
    }, signal())).rejects.toThrow('provider remote-session is unavailable')
  })
})

describe('RoomRuntime DSH Session membership and messaging', () => {
  it('attaches only a continuable direct child and relays with coordinator metadata', async () => {
    const { runtime, subagents } = await createHarness()
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Session room' })
    subagents.children = [
      child('existing-child', 'running'),
      {
        kind: 'child',
        id: SessionId('one-shot-child'),
        activity: 'inactive',
        hasChildren: false,
        mode: 'one-shot',
      },
    ]

    const member = await runtime.attachSession(owner, room.id, {
      sessionId: 'existing-child',
      name: '  Existing session  ',
      profile: {
        apiVersion: ROLEHUB_ROLE_API_VERSION,
        kind: 'AgentRole',
        id: 'io.github.example/reviewer',
        version: '1.2.3',
        digest: `sha256:${'d'.repeat(64)}`,
      },
    }, signal())

    expect(subagents.listedParentId).toBe(owner.id)
    expect(member).toMatchObject({
      name: 'Existing session',
      status: 'working',
      connection: {
        providerId: DSH_SESSION_MEMBER_PROVIDER,
        protocol: DSH_SESSION_MEMBER_PROTOCOL,
        address: { sessionId: 'existing-child' },
        sessionId: 'existing-child',
      },
      profile: {
        apiVersion: ROLEHUB_ROLE_API_VERSION,
        kind: 'AgentRole',
        id: 'io.github.example/reviewer',
        version: '1.2.3',
        digest: `sha256:${'d'.repeat(64)}`,
      },
    })
    expect(runtime.getRoom(owner, room.id).members).toContainEqual(
      expect.objectContaining({ memberId: member.memberId, profile: member.profile }),
    )
    await expect(runtime.attachSession(owner, room.id, {
      sessionId: 'one-shot-child',
    }, signal())).rejects.toThrow('not a continuable direct child')
    await expect(runtime.attachSession(owner, room.id, {
      sessionId: 'not-a-child',
    }, signal())).rejects.toThrow('not a continuable direct child')
    await expect(runtime.attachSession(owner, room.id, {
      sessionId: 'existing-child',
    }, signal())).rejects.toThrow('is already in room')

    await expect(runtime.sendMessage(owner, room.id, member.memberId, 'Review this change', signal()))
      .resolves.toEqual({ deliveryId: 'followup-1' })
    expect(subagents.followups).toEqual([
      expect.objectContaining({
        parent: owner,
        childId: 'existing-child',
        content: [{ type: 'text', text: 'Review this change' }],
        options: expect.objectContaining({
          source: { kind: 'coordinator', form: 'relay', senderSessionId: owner.id },
        }),
      }),
    ])
  })

  it('delivers direct and broadcast messages without retaining their contents in metadata or storage', async () => {
    const { runtime, storageFile } = await createHarness()
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Private relay' })
    const delivered: Array<{ endpoint: string; message: string }> = []
    const provider: RoomMemberProvider = {
      id: 'private-relay',
      attach: async ({ descriptor }) => {
        const endpoint = (descriptor as { endpoint: string }).endpoint
        return {
          name: endpoint,
          connection: { protocol: 'private.relay/v1', address: { endpoint } },
        }
      },
      deliver: async ({ member, message }) => {
        const endpoint = (member.connection.address as { endpoint: string }).endpoint
        delivered.push({ endpoint, message })
        if (endpoint === 'broken') throw new Error('remote unavailable')
        return { deliveryId: `${endpoint}-${delivered.length}` }
      },
    }
    runtime.registerMemberProvider(provider)
    const ready = await runtime.attachMember(owner, room.id, {
      providerId: provider.id,
      descriptor: { endpoint: 'ready' },
    }, signal())
    const broken = await runtime.attachMember(owner, room.id, {
      providerId: provider.id,
      descriptor: { endpoint: 'broken' },
    }, signal())
    const directSecret = 'DIRECT_SECRET_DO_NOT_PERSIST'
    const broadcastSecret = 'BROADCAST_SECRET_DO_NOT_PERSIST'

    await expect(runtime.sendMessage(owner, room.id, ready.memberId, directSecret, signal()))
      .resolves.toEqual({ deliveryId: 'ready-1' })
    await expect(runtime.broadcast(owner, room.id, broadcastSecret, signal())).resolves.toEqual([
      expect.objectContaining({ memberId: ready.memberId, deliveryId: 'ready-2' }),
      expect.objectContaining({ memberId: broken.memberId, error: 'remote unavailable' }),
    ])

    expect(delivered).toEqual([
      { endpoint: 'ready', message: directSecret },
      { endpoint: 'ready', message: broadcastSecret },
      { endpoint: 'broken', message: broadcastSecret },
    ])
    const updated = runtime.getRoom(owner, room.id)
    expect(updated.members.find(candidate => candidate.memberId === ready.memberId)?.status).toBe('working')
    expect(updated.members.find(candidate => candidate.memberId === broken.memberId)?.status).toBe('error')
    expect(updated.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'message.direct', message: 'Message delivered to ready' }),
      expect.objectContaining({ type: 'message.broadcast', message: 'Broadcast delivered to 2 member(s)' }),
    ]))
    expect(JSON.stringify(updated)).not.toContain(directSecret)
    expect(JSON.stringify(updated)).not.toContain(broadcastSecret)
    const persisted = await readFile(storageFile, 'utf8')
    expect(persisted).not.toContain(directSecret)
    expect(persisted).not.toContain(broadcastSecret)
  })
})

describe('RoomRuntime concurrency, removal, and closure', () => {
  it('prevents close or removal from racing an in-flight delivery', async () => {
    const { runtime } = await createHarness()
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Serialized delivery room' })
    const gate = deferred<{ deliveryId: string }>()
    const provider: RoomMemberProvider = {
      id: 'delayed-delivery',
      attach: async () => ({
        name: 'Delayed member',
        connection: { protocol: 'delayed/v1', address: { id: 'delayed' } },
      }),
      deliver: async () => gate.promise,
    }
    runtime.registerMemberProvider(provider)
    const member = await runtime.attachMember(owner, room.id, {
      providerId: provider.id,
      descriptor: { id: 'delayed' },
    }, signal())

    const pending = runtime.sendMessage(owner, room.id, member.memberId, 'Deliver once', signal())
    await expect(runtime.removeMember(owner, room.id, member.memberId)).rejects.toThrow('mutation in progress')
    await expect(runtime.closeRoom(owner, room.id, {})).rejects.toThrow('mutation in progress')

    gate.resolve({ deliveryId: 'delayed-1' })
    await expect(pending).resolves.toEqual({ deliveryId: 'delayed-1' })
    const closed = await runtime.closeRoom(owner, room.id, {})
    expect(closed.status).toBe('closed')
    expect(closed.events.at(-1)?.type).toBe('room.closed')
  })

  it('reserves capacity before asynchronous provider work and releases it after settlement', async () => {
    const { runtime } = await createHarness(undefined, { maxMembersPerRoom: 2 })
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Capacity room' })
    const gate = deferred<Awaited<ReturnType<RoomMemberProvider['attach']>>>()
    let attachCalls = 0
    const provider: RoomMemberProvider = {
      id: 'slow-provider',
      attach: async () => {
        attachCalls += 1
        return gate.promise
      },
      deliver: async () => ({ deliveryId: 'delivered' }),
    }
    runtime.registerMemberProvider(provider)

    const first = runtime.attachMember(owner, room.id, {
      providerId: provider.id,
      descriptor: { id: 1 },
    }, signal())
    expect(attachCalls).toBe(1)
    await expect(runtime.attachMember(owner, room.id, {
      providerId: provider.id,
      descriptor: { id: 2 },
    }, signal())).rejects.toThrow('room member limit 2 reached')
    expect(attachCalls).toBe(1)

    gate.resolve({
      name: 'Only member',
      connection: { protocol: 'slow/v1', address: { id: 1 } },
    })
    const attached = await first
    await runtime.removeMember(owner, room.id, attached.memberId, false)

    const replacementProvider: RoomMemberProvider = {
      id: 'replacement-provider',
      attach: async () => ({
        name: 'Replacement',
        connection: { protocol: 'replacement/v1', address: { id: 2 } },
      }),
      deliver: async () => ({ deliveryId: 'replacement-delivery' }),
    }
    runtime.registerMemberProvider(replacementProvider)
    await expect(runtime.attachMember(owner, room.id, {
      providerId: replacementProvider.id,
      descriptor: { id: 2 },
    }, signal())).resolves.toMatchObject({ name: 'Replacement' })
  })

  it('runs provider rollback if the room closes after preparation but before commit', async () => {
    const { runtime } = await createHarness()
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Rollback room' })
    const gate = deferred<Awaited<ReturnType<RoomMemberProvider['attach']>>>()
    let rollbackCalls = 0
    const provider: RoomMemberProvider = {
      id: 'prepared-provider',
      attach: async () => gate.promise,
      deliver: async () => ({ deliveryId: 'unused' }),
    }
    runtime.registerMemberProvider(provider)

    const pending = runtime.attachMember(owner, room.id, {
      providerId: provider.id,
      descriptor: { id: 'prepared' },
    }, signal())
    await runtime.closeRoom(owner, room.id, {})
    gate.resolve({
      name: 'Prepared member',
      connection: { protocol: 'prepared/v1', address: { id: 'prepared' } },
      rollback: async () => { rollbackCalls += 1 },
    })

    await expect(pending).rejects.toThrow(`room ${room.id} is closed`)
    expect(rollbackCalls).toBe(1)
    expect(runtime.getRoom(owner, room.id).members).toHaveLength(1)
  })

  it('removes members, interrupts active transports, and closes the room atomically', async () => {
    const { runtime } = await createHarness()
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Closable room' })
    const interrupted: string[] = []
    let next = 0
    const provider: RoomMemberProvider = {
      id: 'interruptible',
      attach: async () => {
        const id = `remote-${++next}`
        return {
          name: id,
          connection: { protocol: 'interruptible/v1', address: { id } },
        }
      },
      deliver: async () => ({ deliveryId: 'delivery' }),
      interrupt: async ({ member }) => { interrupted.push(member.name) },
    }
    runtime.registerMemberProvider(provider)
    const first = await runtime.attachMember(owner, room.id, {
      providerId: provider.id,
      descriptor: {},
    }, signal())
    const second = await runtime.attachMember(owner, room.id, {
      providerId: provider.id,
      descriptor: {},
    }, signal())

    const removed = await runtime.removeMember(owner, room.id, first.memberId)
    expect(removed.status).toBe('removed')
    expect(interrupted).toEqual(['remote-1'])
    await expect(runtime.sendMessage(owner, room.id, first.memberId, 'too late', signal()))
      .rejects.toThrow('is not active')

    const closed = await runtime.closeRoom(owner, room.id, { summary: '  Archived cleanly  ' })
    expect(closed).toMatchObject({ status: 'closed', summary: 'Archived cleanly' })
    expect(closed.members.find(candidate => candidate.memberId === first.memberId)?.status).toBe('removed')
    expect(closed.members.find(candidate => candidate.memberId === second.memberId)?.status).toBe('interrupted')
    expect(interrupted).toEqual(['remote-1', 'remote-2'])
    expect(runtime.listRooms(owner)).toEqual([])
    expect(runtime.listRooms(owner, true)).toHaveLength(1)
    await expect(runtime.attachMember(owner, room.id, {
      providerId: provider.id,
      descriptor: {},
    }, signal())).rejects.toThrow('is closed')
    await expect(runtime.closeRoom(owner, room.id, {})).rejects.toThrow('is closed')
  })

  it('never persists provider interrupt details when detaching a member', async () => {
    const { runtime, storageFile } = await createHarness()
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Private interrupt room' })
    const secret = 'https://provider.invalid/interrupt?token=DO_NOT_PERSIST'
    const provider: RoomMemberProvider = {
      id: 'private-interrupt',
      attach: async () => ({
        name: 'Private member',
        connection: { protocol: 'private/v1', address: { id: 'private' } },
      }),
      deliver: async () => ({ deliveryId: 'unused' }),
      interrupt: async () => { throw new Error(secret) },
    }
    runtime.registerMemberProvider(provider)
    const member = await runtime.attachMember(owner, room.id, {
      providerId: provider.id,
      descriptor: { id: 'private' },
    }, signal())

    await expect(runtime.removeMember(owner, room.id, member.memberId)).resolves.toMatchObject({ status: 'removed' })
    expect(JSON.stringify(runtime.getRoom(owner, room.id))).not.toContain(secret)
    expect(await readFile(storageFile, 'utf8')).not.toContain(secret)
  })
})

describe('RoomRuntime DSH lifecycle recovery', () => {
  it('tracks DSH child starts and settlements without persisting child output', async () => {
    const { context, runtime, subagents, storageFile } = await createHarness()
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Lifecycle room' })
    subagents.children = [child('lifecycle-child')]
    const member = await runtime.attachSession(owner, room.id, { sessionId: 'lifecycle-child' }, signal())

    await context.parallel('subagent/start', startInfo('lifecycle-child'))
    expect(runtime.getRoom(owner, room.id).members.find(candidate => candidate.memberId === member.memberId)?.status)
      .toBe('working')
    expect(runtime.getRoom(owner, room.id).events.at(-1)).toMatchObject({
      type: 'member.started',
      targetMemberId: member.memberId,
    })

    await context.parallel('subagent/end', endInfo('lifecycle-child', 'completed'))
    expect(runtime.getRoom(owner, room.id).members.find(candidate => candidate.memberId === member.memberId)?.status)
      .toBe('idle')
    await context.parallel('subagent/end', endInfo('lifecycle-child', 'error'))
    expect(runtime.getRoom(owner, room.id).members.find(candidate => candidate.memberId === member.memberId)?.status)
      .toBe('error')
    expect(await readFile(storageFile, 'utf8')).not.toContain('private child output')
  })

  it('recovers persisted working members to idle after a Harness restart', async () => {
    const first = await createHarness()
    const owner = leader()
    const room = await first.runtime.createRoom(owner, { name: 'Recovery room' })
    first.subagents.children = [child('recovering-child')]
    const member = await first.runtime.attachSession(owner, room.id, { sessionId: 'recovering-child' }, signal())
    await first.context.parallel('subagent/start', startInfo('recovering-child'))

    const second = await createHarness(first.storageFile)
    const recovered = second.runtime.getRoom(owner, room.id)

    expect(recovered.members.find(candidate => candidate.memberId === member.memberId)?.status).toBe('idle')
    expect(recovered.events.at(-1)).toMatchObject({
      type: 'system.recovered',
      message: 'Recovered member state after Harness restart',
    })
  })
})

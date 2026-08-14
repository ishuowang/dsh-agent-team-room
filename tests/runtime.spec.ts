import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock, MessageId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {
  ContinuableStartSpec,
  SubagentFollowupOptions,
  SubagentInterruptAuthority,
  SubagentListEntry,
  SubagentRunEndInfo,
} from '@deepseek-ai/dsh-subagent'
import { afterEach, describe, expect, it } from 'vitest'
import RoomRuntime, { type Config } from '../src/index.js'

interface FollowupCall {
  parent: Agent
  childId: string
  content: ContentBlock[]
  options: SubagentFollowupOptions
}

class FakeSubagents extends Service {
  readonly starts: ContinuableStartSpec[] = []
  readonly followups: FollowupCall[] = []
  readonly interrupts: Array<{ childId: string; authority: SubagentInterruptAuthority }> = []
  children: SubagentListEntry[] = []
  nextChild = 1
  failFollowup: Error | undefined

  constructor(ctx: Context) {
    super(ctx, 'subagents')
  }

  async startContinuable(spec: ContinuableStartSpec): Promise<{ childId: SessionId; messageId: MessageId }> {
    this.starts.push(spec)
    const childId = SessionId(`child-${this.nextChild++}`)
    return { childId, messageId: `initial-${childId}` as MessageId }
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

  async listChildren(_parentId: SessionId, _signal?: AbortSignal): Promise<SubagentListEntry[]> {
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

const temporaryDirectories: string[] = []

function leader(id = 'leader-1'): Agent {
  return { id } as unknown as Agent
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
    provider: 'fake-provider',
    storageFile: file,
    maxMembersPerRoom: 4,
    maxMessageChars: 2_000,
    maxResultChars: 2_000,
    maxEventsPerRoom: 10_000,
    maxTasksPerRoom: 2_000,
    ...overrides,
  })
  await runtime[Service.init]()
  return { context, runtime, subagents, storageFile: file }
}

function endInfo(childId: string, stopReason: 'completed' | 'error', text = 'done'): SubagentRunEndInfo {
  return {
    runId: 'run-1' as SubagentRunEndInfo['runId'],
    provider: 'fake-provider',
    id: SessionId(childId),
    local: true,
    stopReason,
    lastAssistantMessage: [{ type: 'text', text }],
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('RoomRuntime ownership and membership', () => {
  it('creates a detached persistent room and enforces leader ownership', async () => {
    const { runtime } = await createHarness()
    const owner = leader()
    const outsider = leader('leader-2')

    const created = await runtime.createRoom(owner, { name: '  Release crew  ', objective: '  Ship the plugin  ' })

    expect(created).toMatchObject({
      name: 'Release crew',
      objective: 'Ship the plugin',
      leaderAgentId: owner.id,
      status: 'open',
      revision: 1,
    })
    expect(created.members).toEqual([expect.objectContaining({ agentId: owner.id, kind: 'leader', status: 'leader' })])
    expect(created.events).toEqual([expect.objectContaining({ type: 'room.created', actorAgentId: owner.id })])
    expect(runtime.listRooms(owner)).toHaveLength(1)
    expect(runtime.listRooms(outsider)).toEqual([])
    expect(() => runtime.getRoom(outsider, created.id)).toThrow('caller does not lead room')

    created.name = 'caller mutation'
    expect(runtime.getRoom(owner, created.id).name).toBe('Release crew')
  })

  it('starts a new independent child and validates existing direct children', async () => {
    const { runtime, subagents } = await createHarness()
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Builders', objective: 'Implement the feature' })

    const created = await runtime.addAgent(owner, room.id, {
      name: '  Ada  ',
      role: '  Runtime engineer  ',
      modelProvider: 'test-llm',
      model: 'test-model',
      systemPrompt: 'Be exact.',
    }, new AbortController().signal)

    expect(created).toMatchObject({
      agentId: 'child-1',
      name: 'Ada',
      role: 'Runtime engineer',
      provider: 'fake-provider',
      model: 'test-model',
      status: 'working',
    })
    expect(subagents.starts).toHaveLength(1)
    expect(subagents.starts[0]).toMatchObject({
      provider: 'fake-provider',
      label: 'Builders: Ada',
      request: { agentOptions: { provider: 'test-llm', model: 'test-model' }, persona: 'Be exact.' },
    })
    expect(subagents.starts[0]!.request.prompt[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('Room objective: Implement the feature'),
    })

    subagents.children = [{
      kind: 'child',
      id: SessionId('existing-child'),
      activity: 'inactive',
      hasChildren: false,
      mode: 'continuable',
      label: 'Existing',
    }]
    await expect(runtime.addAgent(owner, room.id, {
      agentId: 'existing-child',
      name: 'Grace',
      role: 'Reviewer',
    }, new AbortController().signal)).resolves.toMatchObject({
      agentId: 'existing-child',
      provider: 'existing',
    })
    await expect(runtime.addAgent(owner, room.id, {
      agentId: 'not-a-child',
      name: 'Mallory',
      role: 'Intruder',
    }, new AbortController().signal)).rejects.toThrow('not a continuable direct child')
  })
})

describe('RoomRuntime task lifecycle', () => {
  it('requires an explicit correlated task report and ignores unrelated subagent turns', async () => {
    const { context, runtime, subagents } = await createHarness()
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Delivery', objective: 'Deliver a result' })
    const member = await runtime.addAgent(owner, room.id, {
      name: 'Worker',
      role: 'Implementer',
    }, new AbortController().signal)

    const assigned = await runtime.assignTask(owner, room.id, {
      assigneeAgentId: member.agentId,
      title: '  Build tests  ',
      instructions: '  Cover the lifecycle  ',
    }, new AbortController().signal)

    expect(assigned).toMatchObject({
      title: 'Build tests',
      instructions: 'Cover the lifecycle',
      status: 'running',
      messageId: 'followup-1',
    })
    expect(subagents.followups[0]!.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining(`task_id "${assigned.id}"`),
    })
    await expect(runtime.assignTask(owner, room.id, {
      assigneeAgentId: member.agentId,
      title: 'Second task',
      instructions: 'Must wait',
    }, new AbortController().signal)).rejects.toThrow('already owns active task')

    const waiting = runtime.waitForTasks(owner, room.id, [assigned.id], 1_000, new AbortController().signal)
    await context.parallel('subagent/end', endInfo(member.agentId, 'completed', 'Unrelated queued message finished.'))
    await expect(runtime.waitForTasks(owner, room.id, [assigned.id], 0, new AbortController().signal)).resolves.toMatchObject({
      completed: false,
      timedOut: true,
      tasks: [expect.objectContaining({ status: 'running' })],
    })
    await expect(runtime.completeTask(leader(member.agentId), room.id, assigned.id, {
      status: 'completed',
      report: 'All checks passed.',
    })).resolves.toMatchObject({ status: 'completed', result: 'All checks passed.' })

    await expect(waiting).resolves.toMatchObject({
      completed: true,
      timedOut: false,
      tasks: [expect.objectContaining({ status: 'completed', result: 'All checks passed.' })],
    })
    const updated = runtime.getRoom(owner, room.id)
    expect(updated.members.find(item => item.agentId === member.agentId)).toMatchObject({
      status: 'idle',
      lastResult: 'All checks passed.',
    })
    expect(updated.events.at(-1)).toMatchObject({ type: 'task.completed', taskId: assigned.id })

    await expect(runtime.completeTask(leader('different-child'), room.id, assigned.id, {
      status: 'completed',
      report: 'spoofed',
    })).rejects.toThrow('not an active room member')
    await expect(runtime.completeTask(leader(member.agentId), room.id, assigned.id, {
      status: 'completed',
      report: 'safe retry',
    })).resolves.toMatchObject({ status: 'completed', result: 'All checks passed.' })
  })

  it('marks delivery failures terminal and supports immediate timeout snapshots', async () => {
    const { runtime, subagents } = await createHarness()
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Failures', objective: 'Expose errors' })
    const member = await runtime.addAgent(owner, room.id, {
      name: 'Worker',
      role: 'Implementer',
    }, new AbortController().signal)
    subagents.failFollowup = new Error('transport unavailable')

    const failed = await runtime.assignTask(owner, room.id, {
      assigneeAgentId: member.agentId,
      title: 'Undeliverable',
      instructions: 'This will fail',
    }, new AbortController().signal)

    expect(failed).toMatchObject({ status: 'failed', error: 'Error: transport unavailable' })
    await expect(runtime.waitForTasks(owner, room.id, [failed.id], 0, new AbortController().signal)).resolves.toMatchObject({
      completed: true,
      timedOut: false,
    })

    subagents.failFollowup = undefined
    const running = await runtime.assignTask(owner, room.id, {
      assigneeAgentId: member.agentId,
      title: 'Still running',
      instructions: 'Do not settle yet',
    }, new AbortController().signal)
    await expect(runtime.waitForTasks(owner, room.id, [running.id], 0, new AbortController().signal)).resolves.toMatchObject({
      completed: false,
      timedOut: true,
    })
    await expect(runtime.waitForTasks(owner, room.id, ['missing-task'], 0, new AbortController().signal))
      .rejects.toThrow('unknown task missing-task')
  })

  it('closes a room, cancels active tasks, ignores late lifecycle events, and blocks later writes', async () => {
    const { context, runtime, subagents } = await createHarness()
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Closable', objective: 'Finish cleanly' })
    const member = await runtime.addAgent(owner, room.id, {
      name: 'Worker',
      role: 'Implementer',
    }, new AbortController().signal)
    const task = await runtime.assignTask(owner, room.id, {
      assigneeAgentId: member.agentId,
      title: 'In flight',
      instructions: 'Await closure',
    }, new AbortController().signal)

    const closed = await runtime.closeRoom(owner, room.id, { summary: '  Work archived  ' })

    expect(closed).toMatchObject({ status: 'closed', summary: 'Work archived' })
    expect(closed.tasks.find(item => item.id === task.id)).toMatchObject({ status: 'cancelled', error: 'Room closed' })
    expect(closed.members.find(item => item.agentId === member.agentId)).toMatchObject({ status: 'interrupted' })
    expect(subagents.interrupts).toEqual([
      expect.objectContaining({ childId: member.agentId, authority: { kind: 'ancestor', agent: owner } }),
    ])
    const eventCount = closed.events.length
    await context.parallel('subagent/end', endInfo(member.agentId, 'error', 'late interrupt result'))
    expect(runtime.getRoom(owner, room.id).members.find(item => item.agentId === member.agentId))
      .toMatchObject({ status: 'interrupted' })
    expect(runtime.getRoom(owner, room.id).events).toHaveLength(eventCount)
    await expect(runtime.sendMessage(
      owner,
      room.id,
      member.agentId,
      'too late',
      new AbortController().signal,
    )).rejects.toThrow('is closed')
    expect(runtime.listRooms(owner)).toEqual([])
    expect(runtime.listRooms(owner, true)).toHaveLength(1)
  })

  it('validates a close summary before interrupting agents or mutating room state', async () => {
    const { runtime, subagents } = await createHarness()
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Atomic close', objective: 'Remain open on invalid input' })
    await runtime.addAgent(owner, room.id, {
      name: 'Worker',
      role: 'Implementer',
    }, new AbortController().signal)

    await expect(runtime.closeRoom(owner, room.id, { summary: 'x'.repeat(2_001) }))
      .rejects.toThrow('summary exceeds 2000 characters')
    expect(runtime.getRoom(owner, room.id).status).toBe('open')
    expect(subagents.interrupts).toEqual([])
  })

  it('bounds the retained room timeline and rejects tasks beyond the configured ceiling', async () => {
    const { runtime } = await createHarness(undefined, { maxEventsPerRoom: 3, maxTasksPerRoom: 1 })
    const owner = leader()
    const room = await runtime.createRoom(owner, { name: 'Bounded', objective: 'Bound persistent growth' })
    const member = await runtime.addAgent(owner, room.id, {
      name: 'Worker',
      role: 'Implementer',
    }, new AbortController().signal)
    const first = await runtime.assignTask(owner, room.id, {
      assigneeAgentId: member.agentId,
      title: 'Only task',
      instructions: 'Finish once',
    }, new AbortController().signal)
    await runtime.completeTask(leader(member.agentId), room.id, first.id, {
      status: 'completed',
      report: 'done',
    })

    expect(runtime.getRoom(owner, room.id).events).toHaveLength(3)
    await expect(runtime.assignTask(owner, room.id, {
      assigneeAgentId: member.agentId,
      title: 'Too many',
      instructions: 'Exceeds retained task limit',
    }, new AbortController().signal)).rejects.toThrow('room task limit 1 reached')
  })

  it('recovers persisted in-flight work after a harness restart', async () => {
    const first = await createHarness()
    const owner = leader()
    const room = await first.runtime.createRoom(owner, { name: 'Recovery', objective: 'Survive restart' })
    const member = await first.runtime.addAgent(owner, room.id, {
      name: 'Worker',
      role: 'Implementer',
    }, new AbortController().signal)
    const task = await first.runtime.assignTask(owner, room.id, {
      assigneeAgentId: member.agentId,
      title: 'Interrupted',
      instructions: 'Running during restart',
    }, new AbortController().signal)

    const second = await createHarness(first.storageFile)
    const recovered = second.runtime.getRoom(owner, room.id)

    expect(recovered.members.find(item => item.agentId === member.agentId)).toMatchObject({ status: 'idle' })
    expect(recovered.members.find(item => item.agentId === member.agentId)).not.toHaveProperty('activeTaskId')
    expect(recovered.tasks.find(item => item.id === task.id)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('Harness restarted'),
    })
    expect(recovered.events.at(-1)).toMatchObject({ type: 'system.recovered' })
  })
})

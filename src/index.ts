import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SubagentRunEndInfo, SubagentRunInfo } from '@deepseek-ai/dsh-subagent'
import { RoomStorage } from './storage.js'
import {
  ROOM_SCHEMA_VERSION,
  isTerminalTask,
  roomSummary,
  type AddAgentInput,
  type BroadcastDelivery,
  type Room,
  type RoomEvent,
  type RoomEventType,
  type RoomMember,
  type RoomSummary,
  type RoomTask,
  type WaitResult,
} from './types.js'

export * from './types.js'
export { RoomStorage, defaultStorageFile } from './storage.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    rooms: RoomRuntime
  }
}

export interface Config {
  /** Continuable subagent provider used for newly created room members. */
  provider: string
  /** JSON persistence path. Empty uses $DSH_HOME/agent-team-room/rooms.json. */
  storageFile?: string
  /** Hard room membership ceiling, including the leader. */
  maxMembersPerRoom: number
  /** Maximum direct/broadcast/task instruction length. */
  maxMessageChars: number
  /** Maximum assistant result text persisted in room state. */
  maxResultChars: number
  /** Maximum retained events per room. Oldest events are discarded first. */
  maxEventsPerRoom: number
  /** Maximum tracked tasks retained in one room. */
  maxTasksPerRoom: number
}

export const Config: z<Config> = z.object({
  provider: z.string().default('spawn'),
  storageFile: z.string().default(''),
  maxMembersPerRoom: z.natural().min(2).max(128).default(16),
  maxMessageChars: z.natural().min(256).max(1_000_000).default(20_000),
  maxResultChars: z.natural().min(256).max(1_000_000).default(40_000),
  maxEventsPerRoom: z.natural().min(100).max(100_000).default(10_000),
  maxTasksPerRoom: z.natural().min(10).max(100_000).default(2_000),
})

interface LifecycleInfo {
  readonly id: string
  readonly stopReason?: string
}

function now(): string {
  return new Date().toISOString()
}

function cleanText(value: string, field: string, maximum: number): string {
  const text = value.trim()
  if (text.length === 0) throw new Error(`agent-team-room: ${field} cannot be empty`)
  if (text.length > maximum) throw new Error(`agent-team-room: ${field} exceeds ${maximum} characters`)
  return text
}

/** Durable room coordinator exposed as ctx.rooms. */
export default class RoomRuntime extends Service {
  static inject = ['subagents']
  static Config = Config

  private readonly storage: RoomStorage
  private readonly roomsById = new Map<string, Room>()
  private readonly listeners = new Set<(roomId: string) => void>()
  private persistQueue: Promise<void> = Promise.resolve()

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'rooms')
    this.storage = new RoomStorage(config.storageFile)
    ctx.on('subagent/start', (info: SubagentRunInfo) => this.onSubagentStart(info))
    ctx.on('subagent/end', (info: SubagentRunEndInfo) => this.onSubagentEnd(info))
  }

  async [Service.init](): Promise<void> {
    const loaded = await this.storage.load()
    for (const room of loaded) this.roomsById.set(room.id, room)
    const recovered = this.recoverInterruptedState()
    const trimmed = this.trimLoadedEvents()
    if (recovered || trimmed) await this.persist()
  }

  subscribe(listener: (roomId: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async createRoom(parent: Agent, input: { name: string; objective: string }): Promise<Room> {
    const createdAt = now()
    const room: Room = {
      schemaVersion: ROOM_SCHEMA_VERSION,
      id: randomUUID(),
      name: cleanText(input.name, 'name', 120),
      objective: cleanText(input.objective, 'objective', this.config.maxMessageChars),
      leaderAgentId: parent.id,
      status: 'open',
      revision: 0,
      createdAt,
      updatedAt: createdAt,
      members: [{
        agentId: parent.id,
        kind: 'leader',
        name: 'Leader',
        role: 'Room coordinator',
        status: 'leader',
        joinedAt: createdAt,
        updatedAt: createdAt,
      }],
      tasks: [],
      events: [],
    }
    this.appendEvent(room, 'room.created', `Room created: ${room.name}`, { actorAgentId: parent.id })
    this.roomsById.set(room.id, room)
    await this.changed(room)
    return this.copy(room)
  }

  listRooms(parent: Agent, includeClosed = false): RoomSummary[] {
    return [...this.roomsById.values()]
      .filter(room => room.leaderAgentId === parent.id && (includeClosed || room.status === 'open'))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(roomSummary)
  }

  /** Dashboard-only inventory. It contains no storage path or hidden Agent transcript. */
  listAllRooms(includeClosed = true): RoomSummary[] {
    return [...this.roomsById.values()]
      .filter(room => includeClosed || room.status === 'open')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(roomSummary)
  }

  getRoom(parent: Agent, roomId: string): Room {
    return this.copy(this.ownedRoom(parent, roomId))
  }

  getRoomForDashboard(roomId: string): Room {
    return this.copy(this.room(roomId))
  }

  roomHistory(parent: Agent, roomId: string, limit = 100): RoomEvent[] {
    const room = this.ownedRoom(parent, roomId)
    const count = Math.max(1, Math.min(Math.trunc(limit), 1000))
    return structuredClone(room.events.slice(-count))
  }

  getTask(parent: Agent, roomId: string, taskId: string): RoomTask {
    const room = this.ownedRoom(parent, roomId)
    const task = room.tasks.find(candidate => candidate.id === taskId)
    if (!task) throw new Error(`agent-team-room: unknown task ${taskId}`)
    return structuredClone(task)
  }

  async addAgent(parent: Agent, roomId: string, input: AddAgentInput, signal: AbortSignal): Promise<RoomMember> {
    const room = this.openOwnedRoom(parent, roomId)
    const name = cleanText(input.name, 'agent name', 120)
    const role = cleanText(input.role, 'agent role', 240)
    this.assertMemberCapacity(room)

    let agentId = input.agentId?.trim()
    let provider = input.provider?.trim() || this.config.provider
    if (agentId) {
      const children = await this.ctx.subagents.listChildren(SessionId(parent.id), signal)
      const child = children.find(candidate => candidate.kind === 'child' && candidate.id === agentId)
      if (!child || child.kind !== 'child' || child.mode !== 'continuable') {
        throw new Error(`agent-team-room: ${agentId} is not a continuable direct child of this leader`)
      }
      provider = input.provider?.trim() || 'existing'
    } else {
      const options: AgentOptions = {}
      if (input.modelProvider?.trim()) options.provider = input.modelProvider.trim()
      if (input.model?.trim()) options.model = input.model.trim()
      const prompt = [
        `You joined the DSH Agent Team Room "${room.name}" as ${name}.`,
        `Role: ${role}`,
        `Room objective: ${room.objective}`,
        'Work in your own Session. The leader will send room tasks as follow-up messages.',
        'For tracked room tasks, call room_task_complete with the exact room and task ids supplied in the assignment.',
        'Use the report tool for other material results. Do not assume you share another member\'s context.',
      ].join('\n')
      const started = await this.ctx.subagents.startContinuable({
        provider,
        label: `${room.name}: ${name}`,
        request: {
          prompt: [{ type: 'text', text: prompt }],
          parent,
          ...(Object.keys(options).length > 0 ? { agentOptions: options } : {}),
          ...(input.systemPrompt?.trim() ? { persona: input.systemPrompt.trim() } : {}),
        },
        signal,
      })
      agentId = started.childId
    }

    const current = this.openOwnedRoom(parent, roomId)
    this.assertMemberCapacity(current)
    if (current.members.some(member => member.agentId === agentId && member.status !== 'removed')) {
      throw new Error(`agent-team-room: agent ${agentId} is already in room ${roomId}`)
    }
    const timestamp = now()
    const member: RoomMember = {
      agentId,
      kind: 'agent',
      name,
      role,
      provider,
      ...(input.model?.trim() ? { model: input.model.trim() } : {}),
      status: 'working',
      joinedAt: timestamp,
      updatedAt: timestamp,
    }
    current.members.push(member)
    this.appendEvent(current, 'member.joined', `${name} joined as ${role}`, {
      actorAgentId: parent.id,
      targetAgentId: agentId,
    })
    await this.changed(current)
    return structuredClone(member)
  }

  async sendMessage(
    parent: Agent,
    roomId: string,
    targetAgentId: string,
    message: string,
    signal: AbortSignal,
  ): Promise<{ messageId: string }> {
    const room = this.openOwnedRoom(parent, roomId)
    const member = this.activeAgentMember(room, targetAgentId)
    const text = cleanText(message, 'message', this.config.maxMessageChars)
    const messageId = await this.followup(parent, member.agentId, text, signal)
    member.status = 'working'
    member.updatedAt = now()
    this.appendEvent(room, 'message.direct', text, {
      actorAgentId: parent.id,
      targetAgentId: member.agentId,
    })
    await this.changed(room)
    return { messageId }
  }

  async broadcast(parent: Agent, roomId: string, message: string, signal: AbortSignal): Promise<BroadcastDelivery[]> {
    const room = this.openOwnedRoom(parent, roomId)
    const text = cleanText(message, 'message', this.config.maxMessageChars)
    const members = room.members.filter(member => member.kind === 'agent' && member.status !== 'removed')
    if (members.length === 0) throw new Error('agent-team-room: room has no Agent members')

    const deliveries = await Promise.all(members.map(async (member): Promise<BroadcastDelivery> => {
      try {
        const messageId = await this.followup(parent, member.agentId, text, signal)
        member.status = 'working'
        member.updatedAt = now()
        return { agentId: member.agentId, messageId }
      } catch (error) {
        member.status = 'error'
        member.updatedAt = now()
        return { agentId: member.agentId, error: String(error) }
      }
    }))
    this.appendEvent(room, 'message.broadcast', text, { actorAgentId: parent.id })
    await this.changed(room)
    return structuredClone(deliveries)
  }

  async assignTask(
    parent: Agent,
    roomId: string,
    input: { assigneeAgentId: string; title: string; instructions: string },
    signal: AbortSignal,
  ): Promise<RoomTask> {
    const room = this.openOwnedRoom(parent, roomId)
    const member = this.activeAgentMember(room, input.assigneeAgentId)
    if (room.tasks.length >= this.config.maxTasksPerRoom) {
      throw new Error(`agent-team-room: room task limit ${this.config.maxTasksPerRoom} reached`)
    }
    if (member.activeTaskId) {
      const active = room.tasks.find(task => task.id === member.activeTaskId)
      if (active && !isTerminalTask(active.status)) {
        throw new Error(`agent-team-room: ${member.name} already owns active task ${active.id}`)
      }
    }
    const timestamp = now()
    const task: RoomTask = {
      id: randomUUID(),
      title: cleanText(input.title, 'task title', 200),
      instructions: cleanText(input.instructions, 'task instructions', this.config.maxMessageChars),
      assigneeAgentId: member.agentId,
      status: 'queued',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    room.tasks.push(task)
    member.activeTaskId = task.id
    this.appendEvent(room, 'task.assigned', `Assigned “${task.title}” to ${member.name}`, {
      actorAgentId: parent.id,
      targetAgentId: member.agentId,
      taskId: task.id,
    })
    await this.changed(room)

    try {
      task.messageId = await this.followup(
        parent,
        member.agentId,
        `[Room task ${task.id}]\nRoom id: ${room.id}\nTitle: ${task.title}\n\n${task.instructions}`
          + `\n\nWhen finished, call room_task_complete with room_id "${room.id}", task_id "${task.id}", `
          + 'status "completed", and a concise report. If blocked, call it with status "failed" and explain why.',
        signal,
      )
      task.status = 'running'
      task.updatedAt = now()
      member.status = 'working'
      member.updatedAt = task.updatedAt
    } catch (error) {
      task.status = 'failed'
      task.error = String(error)
      task.updatedAt = now()
      member.status = 'error'
      member.updatedAt = task.updatedAt
      delete member.activeTaskId
      this.appendEvent(room, 'task.failed', `Could not deliver “${task.title}”: ${String(error)}`, {
        actorAgentId: parent.id,
        targetAgentId: member.agentId,
        taskId: task.id,
      })
    }
    await this.changed(room)
    return structuredClone(task)
  }

  async completeTask(
    reporter: Agent,
    roomId: string,
    taskId: string,
    input: { status: 'completed' | 'failed'; report: string },
  ): Promise<RoomTask> {
    const room = this.room(roomId)
    if (room.status !== 'open') throw new Error(`agent-team-room: room ${roomId} is closed`)
    const member = this.activeAgentMember(room, reporter.id)
    const task = room.tasks.find(candidate => candidate.id === taskId)
    if (!task) throw new Error(`agent-team-room: unknown task ${taskId}`)
    if (task.assigneeAgentId !== reporter.id) {
      throw new Error(`agent-team-room: caller is not assigned task ${taskId}`)
    }
    if (isTerminalTask(task.status)) {
      if (task.status === input.status) return structuredClone(task)
      throw new Error(`agent-team-room: task ${taskId} is already ${task.status}`)
    }

    const report = cleanText(input.report, 'task report', this.config.maxResultChars)
    const timestamp = now()
    task.status = input.status
    task.updatedAt = timestamp
    if (input.status === 'completed') task.result = report
    else task.error = report
    if (member.activeTaskId === task.id) delete member.activeTaskId
    member.lastResult = report
    member.status = input.status === 'completed' ? 'idle' : 'error'
    member.updatedAt = timestamp
    this.appendEvent(
      room,
      input.status === 'completed' ? 'task.completed' : 'task.failed',
      input.status === 'completed'
        ? `${member.name} completed “${task.title}”`
        : `${member.name} reported “${task.title}” failed`,
      { actorAgentId: reporter.id, targetAgentId: reporter.id, taskId: task.id },
    )
    await this.changed(room)
    return structuredClone(task)
  }

  async removeAgent(
    parent: Agent,
    roomId: string,
    agentId: string,
    interruptRunning = true,
  ): Promise<RoomMember> {
    const room = this.openOwnedRoom(parent, roomId)
    const member = this.activeAgentMember(room, agentId)
    if (interruptRunning) {
      this.ctx.subagents.interrupt(SessionId(member.agentId), { kind: 'ancestor', agent: parent })
    }
    this.cancelMemberTask(room, member, 'Agent left the room')
    member.status = 'removed'
    member.updatedAt = now()
    this.appendEvent(room, 'member.left', `${member.name} left the room`, {
      actorAgentId: parent.id,
      targetAgentId: member.agentId,
    })
    await this.changed(room)
    return structuredClone(member)
  }

  async closeRoom(
    parent: Agent,
    roomId: string,
    input: { summary?: string; interruptRunning?: boolean },
  ): Promise<Room> {
    const room = this.openOwnedRoom(parent, roomId)
    const requestedSummary = input.summary?.trim()
    const summary = requestedSummary
      ? cleanText(requestedSummary, 'summary', this.config.maxMessageChars)
      : undefined
    const shouldInterrupt = input.interruptRunning !== false
    for (const member of room.members) {
      if (member.kind !== 'agent' || member.status === 'removed') continue
      if (shouldInterrupt) {
        this.ctx.subagents.interrupt(SessionId(member.agentId), { kind: 'ancestor', agent: parent })
        member.status = 'interrupted'
      } else if (member.status === 'working' || member.status === 'starting') {
        member.status = 'idle'
      }
      member.updatedAt = now()
      this.cancelMemberTask(room, member, 'Room closed')
    }
    room.status = 'closed'
    room.closedAt = now()
    if (summary) room.summary = summary
    this.appendEvent(room, 'room.closed', room.summary || 'Room closed', { actorAgentId: parent.id })
    await this.changed(room)
    return this.copy(room)
  }

  async waitForTasks(
    parent: Agent,
    roomId: string,
    taskIds: readonly string[] | undefined,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<WaitResult> {
    const initial = this.openOwnedRoom(parent, roomId)
    const selected = taskIds && taskIds.length > 0
      ? [...new Set(taskIds)]
      : initial.tasks.filter(task => !isTerminalTask(task.status)).map(task => task.id)
    for (const taskId of selected) {
      if (!initial.tasks.some(task => task.id === taskId)) throw new Error(`agent-team-room: unknown task ${taskId}`)
    }
    const boundedTimeout = Math.max(0, Math.min(Math.trunc(timeoutMs), 300_000))

    const snapshot = (): WaitResult => {
      const room = this.ownedRoom(parent, roomId)
      const tasks = selected.map(taskId => room.tasks.find(task => task.id === taskId) as RoomTask)
      return {
        completed: tasks.every(task => isTerminalTask(task.status)),
        timedOut: false,
        tasks: structuredClone(tasks),
      }
    }
    const current = snapshot()
    if (current.completed || selected.length === 0 || boundedTimeout === 0) {
      return { ...current, timedOut: !current.completed && boundedTimeout === 0 }
    }

    return await new Promise<WaitResult>((resolve, reject) => {
      let settled = false
      const finish = (result: WaitResult): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        unsubscribe()
        signal.removeEventListener('abort', onAbort)
        resolve(result)
      }
      const onAbort = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        unsubscribe()
        reject(signal.reason ?? new Error('agent-team-room: wait aborted'))
      }
      const unsubscribe = this.subscribe(changedRoomId => {
        if (changedRoomId !== roomId) return
        const result = snapshot()
        if (result.completed) finish(result)
      })
      const timer = setTimeout(() => {
        const result = snapshot()
        finish({ ...result, timedOut: !result.completed })
      }, boundedTimeout)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    })
  }

  private async followup(parent: Agent, agentId: string, text: string, signal: AbortSignal): Promise<string> {
    const messageId = await this.ctx.subagents.followup(
      parent,
      SessionId(agentId),
      [{ type: 'text', text }],
      {
        source: { kind: 'coordinator', form: 'relay', senderSessionId: parent.id },
        signal,
      },
    )
    return messageId
  }

  private room(roomId: string): Room {
    const room = this.roomsById.get(roomId)
    if (!room) throw new Error(`agent-team-room: unknown room ${roomId}`)
    return room
  }

  private ownedRoom(parent: Agent, roomId: string): Room {
    const room = this.room(roomId)
    if (room.leaderAgentId !== parent.id) throw new Error(`agent-team-room: caller does not lead room ${roomId}`)
    return room
  }

  private openOwnedRoom(parent: Agent, roomId: string): Room {
    const room = this.ownedRoom(parent, roomId)
    if (room.status !== 'open') throw new Error(`agent-team-room: room ${roomId} is closed`)
    return room
  }

  private activeAgentMember(room: Room, agentId: string): RoomMember {
    const member = room.members.find(candidate => candidate.agentId === agentId && candidate.kind === 'agent')
    if (!member || member.status === 'removed') throw new Error(`agent-team-room: agent ${agentId} is not an active room member`)
    return member
  }

  private assertMemberCapacity(room: Room): void {
    const active = room.members.filter(member => member.status !== 'removed').length
    if (active >= this.config.maxMembersPerRoom) {
      throw new Error(`agent-team-room: room member limit ${this.config.maxMembersPerRoom} reached`)
    }
  }

  private appendEvent(
    room: Room,
    type: RoomEventType,
    message: string,
    detail: Pick<RoomEvent, 'actorAgentId' | 'targetAgentId' | 'taskId'> = {},
  ): void {
    const timestamp = now()
    room.events.push({ id: randomUUID(), type, at: timestamp, message, ...detail })
    const overflow = room.events.length - this.config.maxEventsPerRoom
    if (overflow > 0) room.events.splice(0, overflow)
    room.revision += 1
    room.updatedAt = timestamp
  }

  private cancelMemberTask(room: Room, member: RoomMember, reason: string): void {
    if (!member.activeTaskId) return
    const task = room.tasks.find(candidate => candidate.id === member.activeTaskId)
    delete member.activeTaskId
    if (!task || isTerminalTask(task.status)) return
    task.status = 'cancelled'
    task.error = reason
    task.updatedAt = now()
    this.appendEvent(room, 'task.cancelled', `${task.title}: ${reason}`, {
      targetAgentId: member.agentId,
      taskId: task.id,
    })
  }

  private copy(room: Room): Room {
    return structuredClone(room)
  }

  private async changed(room: Room): Promise<void> {
    await this.persist()
    for (const listener of this.listeners) listener(room.id)
  }

  private persist(): Promise<void> {
    const snapshot = structuredClone([...this.roomsById.values()])
    this.persistQueue = this.persistQueue.catch(() => undefined).then(() => this.storage.save(snapshot))
    return this.persistQueue
  }

  private recoverInterruptedState(): boolean {
    let changed = false
    for (const room of this.roomsById.values()) {
      if (room.status !== 'open') continue
      let roomChanged = false
      for (const member of room.members) {
        if (member.status === 'starting' || member.status === 'working') {
          member.status = 'idle'
          member.updatedAt = now()
          roomChanged = true
        }
        delete member.activeTaskId
      }
      for (const task of room.tasks) {
        if (task.status !== 'queued' && task.status !== 'running') continue
        task.status = 'failed'
        task.error = 'Harness restarted before Agent Team Room observed a terminal result'
        task.updatedAt = now()
        roomChanged = true
      }
      if (roomChanged) {
        this.appendEvent(room, 'system.recovered', 'Recovered room state after Harness restart; in-flight tasks were marked failed')
        changed = true
      }
    }
    return changed
  }

  private trimLoadedEvents(): boolean {
    let changed = false
    for (const room of this.roomsById.values()) {
      const overflow = room.events.length - this.config.maxEventsPerRoom
      if (overflow <= 0) continue
      room.events.splice(0, overflow)
      changed = true
    }
    return changed
  }

  private async onSubagentStart(info: LifecycleInfo): Promise<void> {
    const touched: Room[] = []
    for (const room of this.roomsById.values()) {
      if (room.status !== 'open') continue
      const member = room.members.find(candidate => candidate.agentId === info.id && candidate.status !== 'removed')
      if (!member) continue
      member.status = 'working'
      member.updatedAt = now()
      this.appendEvent(room, 'member.started', `${member.name} started a turn`, { targetAgentId: member.agentId })
      touched.push(room)
    }
    if (touched.length === 0) return
    await this.persist()
    for (const room of touched) for (const listener of this.listeners) listener(room.id)
  }

  private async onSubagentEnd(info: LifecycleInfo): Promise<void> {
    const touched: Room[] = []
    for (const room of this.roomsById.values()) {
      if (room.status !== 'open') continue
      const member = room.members.find(candidate => candidate.agentId === info.id && candidate.status !== 'removed')
      if (!member) continue
      const completed = info.stopReason === 'completed'
      const pendingTask = member.activeTaskId
        ? room.tasks.find(task => task.id === member.activeTaskId && !isTerminalTask(task.status))
        : undefined
      member.status = completed && !pendingTask ? 'idle' : 'error'
      member.updatedAt = now()
      const message = pendingTask
        ? `${member.name} finished a turn without reporting “${pendingTask.title}”; task remains ${pendingTask.status}`
        : `${member.name} finished a turn (${info.stopReason || 'unknown'})`
      this.appendEvent(room, 'member.settled', message, {
        targetAgentId: member.agentId,
      })
      touched.push(room)
    }
    if (touched.length === 0) return
    await this.persist()
    for (const room of touched) for (const listener of this.listeners) listener(room.id)
  }
}

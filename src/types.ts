/** Serializable room contracts shared by the host service, tools, and dashboard. */

export const ROOM_SCHEMA_VERSION = 1 as const

export type RoomStatus = 'open' | 'closed'
export type RoomMemberStatus = 'leader' | 'starting' | 'working' | 'idle' | 'interrupted' | 'error' | 'removed'
export type RoomTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type RoomEventType =
  | 'room.created'
  | 'room.closed'
  | 'member.joined'
  | 'member.left'
  | 'member.started'
  | 'member.settled'
  | 'message.direct'
  | 'message.broadcast'
  | 'task.assigned'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  | 'system.recovered'

export interface RoomMember {
  /** Durable DSH Session id. The leader uses the owning parent Session id. */
  agentId: string
  kind: 'leader' | 'agent'
  name: string
  role: string
  provider?: string
  model?: string
  status: RoomMemberStatus
  joinedAt: string
  updatedAt: string
  activeTaskId?: string
  lastResult?: string
}

export interface RoomTask {
  id: string
  title: string
  instructions: string
  assigneeAgentId: string
  status: RoomTaskStatus
  createdAt: string
  updatedAt: string
  messageId?: string
  result?: string
  error?: string
}

export interface RoomEvent {
  id: string
  type: RoomEventType
  at: string
  actorAgentId?: string
  targetAgentId?: string
  taskId?: string
  message: string
}

export interface Room {
  schemaVersion: typeof ROOM_SCHEMA_VERSION
  id: string
  name: string
  objective: string
  leaderAgentId: string
  status: RoomStatus
  revision: number
  createdAt: string
  updatedAt: string
  closedAt?: string
  summary?: string
  members: RoomMember[]
  tasks: RoomTask[]
  events: RoomEvent[]
}

export interface RoomSummary {
  id: string
  name: string
  objective: string
  status: RoomStatus
  revision: number
  memberCount: number
  activeMemberCount: number
  openTaskCount: number
  createdAt: string
  updatedAt: string
}

export interface PersistedRoomDocument {
  schemaVersion: typeof ROOM_SCHEMA_VERSION
  rooms: Room[]
}

export interface AddAgentInput {
  agentId?: string
  name: string
  role: string
  provider?: string
  modelProvider?: string
  model?: string
  systemPrompt?: string
}

export interface BroadcastDelivery {
  agentId: string
  messageId?: string
  error?: string
}

export interface WaitResult {
  completed: boolean
  timedOut: boolean
  tasks: RoomTask[]
}

export function isTerminalTask(status: RoomTaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export function roomSummary(room: Room): RoomSummary {
  return {
    id: room.id,
    name: room.name,
    objective: room.objective,
    status: room.status,
    revision: room.revision,
    memberCount: room.members.filter(member => member.status !== 'removed').length,
    activeMemberCount: room.members.filter(member => member.status === 'starting' || member.status === 'working').length,
    openTaskCount: room.tasks.filter(task => !isTerminalTask(task.status)).length,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  }
}

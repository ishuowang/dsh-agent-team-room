import { describe, expect, it } from 'vitest'
import {
  ROOM_SCHEMA_VERSION,
  isTerminalTask,
  roomSummary,
  type Room,
  type RoomMember,
  type RoomTask,
} from '../src/types.js'

const timestamp = '2026-08-14T00:00:00.000Z'

function member(agentId: string, status: RoomMember['status']): RoomMember {
  return {
    agentId,
    kind: agentId === 'leader' ? 'leader' : 'agent',
    name: agentId,
    role: 'test',
    status,
    joinedAt: timestamp,
    updatedAt: timestamp,
  }
}

function task(id: string, status: RoomTask['status']): RoomTask {
  return {
    id,
    title: id,
    instructions: 'test',
    assigneeAgentId: 'worker',
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

describe('task status helpers', () => {
  it.each([
    ['queued', false],
    ['running', false],
    ['completed', true],
    ['failed', true],
    ['cancelled', true],
  ] as const)('classifies %s as terminal=%s', (status, expected) => {
    expect(isTerminalTask(status)).toBe(expected)
  })
})

describe('roomSummary', () => {
  it('counts visible, active, and open records without exposing room detail', () => {
    const room: Room = {
      schemaVersion: ROOM_SCHEMA_VERSION,
      id: 'room-1',
      name: 'Launch room',
      objective: 'Ship safely',
      leaderAgentId: 'leader',
      status: 'open',
      revision: 9,
      createdAt: timestamp,
      updatedAt: '2026-08-14T01:00:00.000Z',
      members: [
        member('leader', 'leader'),
        member('starting', 'starting'),
        member('working', 'working'),
        member('idle', 'idle'),
        member('removed', 'removed'),
      ],
      tasks: [
        task('queued', 'queued'),
        task('running', 'running'),
        task('completed', 'completed'),
        task('failed', 'failed'),
        task('cancelled', 'cancelled'),
      ],
      events: [{
        id: 'event-1',
        type: 'room.created',
        at: timestamp,
        message: 'private detail',
      }],
    }

    expect(roomSummary(room)).toEqual({
      id: 'room-1',
      name: 'Launch room',
      objective: 'Ship safely',
      status: 'open',
      revision: 9,
      memberCount: 4,
      activeMemberCount: 2,
      openTaskCount: 2,
      createdAt: timestamp,
      updatedAt: '2026-08-14T01:00:00.000Z',
    })
  })
})

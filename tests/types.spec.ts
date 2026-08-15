import { describe, expect, it } from 'vitest'
import {
  DSH_SESSION_MEMBER_PROTOCOL,
  DSH_SESSION_MEMBER_PROVIDER,
  ROLEHUB_ROLE_API_VERSION,
  ROOM_SCHEMA_VERSION,
  roomSummary,
  type Room,
  type RoomMember,
} from '../src/types.js'

const timestamp = '2026-08-14T00:00:00.000Z'

function member(
  memberId: string,
  status: RoomMember['status'],
  profile?: RoomMember['profile'],
): RoomMember {
  const leader = memberId === 'leader'
  return {
    memberId,
    kind: leader ? 'leader' : 'member',
    name: memberId,
    connection: {
      providerId: DSH_SESSION_MEMBER_PROVIDER,
      protocol: DSH_SESSION_MEMBER_PROTOCOL,
      address: { sessionId: memberId },
      sessionId: memberId,
    },
    ...(profile ? { profile } : {}),
    status,
    joinedAt: timestamp,
    updatedAt: timestamp,
  }
}

describe('roomSummary', () => {
  it('counts visible, working, and RoleHub members without exposing room detail', () => {
    const room: Room = {
      schemaVersion: ROOM_SCHEMA_VERSION,
      id: 'room-1',
      name: 'Launch room',
      topic: 'Ship safely',
      leaderSessionId: 'leader',
      status: 'open',
      revision: 9,
      createdAt: timestamp,
      updatedAt: '2026-08-14T01:00:00.000Z',
      members: [
        member('leader', 'leader'),
        member('working-role', 'working', {
          apiVersion: ROLEHUB_ROLE_API_VERSION,
          kind: 'AgentRole',
          id: 'engineer',
          version: '1.0.0',
          digest: `sha256:${'a'.repeat(64)}`,
        }),
        member('idle-role', 'idle', {
          apiVersion: ROLEHUB_ROLE_API_VERSION,
          kind: 'AgentRole',
          id: 'reviewer',
          version: '1.0.0',
          digest: `sha256:${'b'.repeat(64)}`,
        }),
        member('generic', 'working', {
          apiVersion: 'agents.example/v1',
          kind: 'Persona',
          id: 'generic',
        }),
        member('removed-role', 'removed', {
          apiVersion: ROLEHUB_ROLE_API_VERSION,
          kind: 'AgentRole',
          id: 'removed',
          version: '1.0.0',
          digest: `sha256:${'c'.repeat(64)}`,
        }),
      ],
      events: [{
        id: 'event-1',
        type: 'room.created',
        at: timestamp,
        message: 'private metadata detail',
      }],
    }

    expect(roomSummary(room)).toEqual({
      id: 'room-1',
      name: 'Launch room',
      topic: 'Ship safely',
      leaderSessionId: 'leader',
      status: 'open',
      revision: 9,
      memberCount: 4,
      activeMemberCount: 2,
      roleHubMemberCount: 2,
      createdAt: timestamp,
      updatedAt: '2026-08-14T01:00:00.000Z',
    })
    expect(roomSummary(room)).not.toHaveProperty('members')
    expect(roomSummary(room)).not.toHaveProperty('events')
  })

  it('omits an absent optional topic', () => {
    const room: Room = {
      schemaVersion: ROOM_SCHEMA_VERSION,
      id: 'room-2',
      name: 'Untitled room',
      leaderSessionId: 'leader',
      status: 'closed',
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      members: [member('leader', 'leader')],
      events: [],
    }

    expect(roomSummary(room)).not.toHaveProperty('topic')
  })
})

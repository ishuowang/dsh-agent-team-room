import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from './index.js'

export const name = 'agent-team-room-tools'
export const inject = ['tools', 'rooms']

function callingAgent(exec: { readonly agent?: Agent }): Agent {
  if (!exec.agent) throw new Error('Agent Team Room tools require a live calling Agent')
  return exec.agent
}

function jsonValue(value: unknown): JsonValue {
  return value as JsonValue
}

const jsonOutput = {
  schema: { type: 'json' as const },
  render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
}

/** Register the small, provider-neutral Room tool suite. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'room_create',
    description:
      'Create a persistent Room owned by this Session. Room contains no built-in roles, scenarios, prompts, or skills.',
    parameters: {
      name: { type: 'string', required: true, description: 'Short room name.' },
      topic: { type: 'string', description: 'Optional shared topic or outcome.' },
    },
    output: jsonOutput,
    async execute(args, exec) {
      return jsonValue({
        room: await ctx.rooms.createRoom(callingAgent(exec), {
          name: args.name,
          ...(args.topic ? { topic: args.topic } : {}),
        }),
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'room_list',
    description: 'List Rooms led by this Session, with member counts and optional RoleHub provenance counts.',
    parameters: {
      include_closed: { type: 'boolean', description: 'Include closed Rooms. Defaults to false.' },
    },
    output: jsonOutput,
    execute(args, exec) {
      return Promise.resolve(jsonValue({
        rooms: ctx.rooms.listRooms(callingAgent(exec), args.include_closed ?? false),
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'room_get',
    description: 'Read one owned Room, including attached members and its metadata-only event timeline.',
    parameters: {
      room_id: { type: 'string', required: true, description: 'Room id returned by room_create or room_list.' },
    },
    output: jsonOutput,
    execute(args, exec) {
      return Promise.resolve(jsonValue({ room: ctx.rooms.getRoom(callingAgent(exec), args.room_id) }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'room_history',
    description: 'Read recent Room delivery and membership metadata; message bodies and Session transcripts are not copied here.',
    parameters: {
      room_id: { type: 'string', required: true, description: 'Room id.' },
      limit: { type: 'number', description: 'Newest events to return (1-1000, default 100).' },
    },
    output: jsonOutput,
    execute(args, exec) {
      return Promise.resolve(jsonValue({
        events: ctx.rooms.roomHistory(callingAgent(exec), args.room_id, args.limit ?? 100),
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'room_attach_session',
    description:
      'Attach an existing continuable direct-child DSH Session to an owned Room. This does not create a role, '
      + 'inject a prompt, or install skills. A separate trusted member provider is required for RoleHub roles.',
    parameters: {
      room_id: { type: 'string', required: true, description: 'Open Room id.' },
      session_id: { type: 'string', required: true, description: 'Existing continuable direct-child Session id.' },
      name: { type: 'string', description: 'Optional display-name override.' },
    },
    output: jsonOutput,
    async execute(args, exec) {
      return jsonValue({
        member: await ctx.rooms.attachSession(callingAgent(exec), args.room_id, {
          sessionId: args.session_id,
          ...(args.name ? { name: args.name } : {}),
        }, exec.signal),
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'room_remove_member',
    description:
      'Detach a member and optionally interrupt its current turn. The backing Session or external member is not deleted.',
    parameters: {
      room_id: { type: 'string', required: true, description: 'Open Room id.' },
      member_id: { type: 'string', required: true, description: 'Room-local member id.' },
      interrupt_running: { type: 'boolean', description: 'Interrupt current work when supported (default true).' },
    },
    output: jsonOutput,
    async execute(args, exec) {
      return jsonValue({
        member: await ctx.rooms.removeMember(
          callingAgent(exec),
          args.room_id,
          args.member_id,
          args.interrupt_running ?? true,
        ),
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'room_send',
    description: 'Send a direct message through one attached member provider without merging Session histories.',
    parameters: {
      room_id: { type: 'string', required: true, description: 'Open Room id.' },
      to_member_id: { type: 'string', required: true, description: 'Target Room-local member id.' },
      message: { type: 'string', required: true, description: 'Message to deliver.' },
    },
    output: jsonOutput,
    async execute(args, exec) {
      return jsonValue(await ctx.rooms.sendMessage(
        callingAgent(exec),
        args.room_id,
        args.to_member_id,
        args.message,
        exec.signal,
      ))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'room_broadcast',
    description:
      'Broadcast one message through every active member provider. Per-member failures remain explicit and message '
      + 'content stays in the destination Session or transport, not Room storage.',
    parameters: {
      room_id: { type: 'string', required: true, description: 'Open Room id.' },
      message: { type: 'string', required: true, description: 'Message to deliver to every member.' },
    },
    output: jsonOutput,
    async execute(args, exec) {
      return jsonValue({
        deliveries: await ctx.rooms.broadcast(callingAgent(exec), args.room_id, args.message, exec.signal),
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'room_close',
    description:
      'Close an owned Room and optionally interrupt active members. Backing Sessions remain independently available.',
    parameters: {
      room_id: { type: 'string', required: true, description: 'Open Room id.' },
      summary: { type: 'string', description: 'Optional final summary.' },
      interrupt_running_members: { type: 'boolean', description: 'Interrupt supported member transports (default true).' },
    },
    output: jsonOutput,
    async execute(args, exec) {
      return jsonValue({
        room: await ctx.rooms.closeRoom(callingAgent(exec), args.room_id, {
          ...(args.summary ? { summary: args.summary } : {}),
          interruptRunning: args.interrupt_running_members ?? true,
        }),
      })
    },
  }))
}

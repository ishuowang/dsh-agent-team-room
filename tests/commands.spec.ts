import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { describe, expect, it, vi } from 'vitest'
import {
  apply,
  inject,
  parseRoomCommand,
  tokenizeRoomCommand,
} from '../src/commands.js'

function invocation(rawInput: string, signal = new AbortController().signal): CommandInvocation {
  return {
    commandId: 'command-1' as CommandInvocation['commandId'],
    agent: { id: 'leader-1' } as unknown as Agent,
    rawInput,
    signal,
  }
}

function mount(overrides: Record<string, unknown> = {}) {
  let definition: CommandDefinition | undefined
  const rooms = {
    listRooms: vi.fn(() => [{ id: 'room-1', name: 'Build room' }]),
    getRoom: vi.fn(() => ({ id: 'room-1', name: 'Build room' })),
    createRoom: vi.fn(async () => ({ id: 'room-1', name: 'Build room' })),
    attachSession: vi.fn(async () => ({ memberId: 'member-1', name: 'Reviewer' })),
    removeMember: vi.fn(async () => ({ memberId: 'member-1', status: 'removed' })),
    sendMessage: vi.fn(async () => ({ delivered: true, memberId: 'member-1' })),
    broadcast: vi.fn(async () => [{ delivered: true, memberId: 'member-1' }]),
    closeRoom: vi.fn(async () => ({ id: 'room-1', status: 'closed' })),
    ...overrides,
  }
  apply({
    commands: {
      register(candidate: CommandDefinition) {
        definition = candidate
        return () => undefined
      },
    },
    rooms,
  } as unknown as Context)
  if (!definition) throw new Error('/room command was not registered')
  return { definition, rooms }
}

async function run(definition: CommandDefinition, rawInput: string, signal?: AbortSignal): Promise<CommandResult> {
  return await definition.handler(invocation(rawInput, signal))
}

describe('tokenizeRoomCommand()', () => {
  it('preserves quoted values and handles escaped characters without shell expansion', () => {
    expect(tokenizeRoomCommand(String.raw`create --name 'Release crew' --topic escaped\ value`)).toEqual([
      'create',
      '--name',
      'Release crew',
      '--topic',
      'escaped value',
    ])
  })

  it.each([
    ['create --name "unfinished', /unterminated/u],
    ['create --name trailing\\', /dangling escape/u],
  ])('rejects malformed quoting in %j', (input, expected) => {
    expect(() => tokenizeRoomCommand(input)).toThrow(expected)
  })
})

describe('parseRoomCommand()', () => {
  it.each([
    ['', { action: 'list', includeClosed: false }],
    [' list --include-closed true ', { action: 'list', includeClosed: true }],
    ['show room-1', { action: 'show', roomId: 'room-1' }],
    [
      'create --name "Release crew" --topic "Ship the native Room"',
      { action: 'create', name: 'Release crew', topic: 'Ship the native Room' },
    ],
    [
      'attach room-1 --session child-1 --name Reviewer',
      { action: 'attach', roomId: 'room-1', sessionId: 'child-1', name: 'Reviewer' },
    ],
    [
      'remove room-1 member-1 --interrupt false',
      { action: 'remove', roomId: 'room-1', memberId: 'member-1', interrupt: false },
    ],
    [
      'send room-1 member-1 --message "Check this change"',
      { action: 'send', roomId: 'room-1', memberId: 'member-1', message: 'Check this change' },
    ],
    [
      'broadcast room-1 --message "Status update"',
      { action: 'broadcast', roomId: 'room-1', message: 'Status update' },
    ],
    [
      'close room-1 --summary "Finished" --interrupt false',
      { action: 'close', roomId: 'room-1', summary: 'Finished', interrupt: false },
    ],
  ])('parses %j', (input, expected) => {
    expect(parseRoomCommand(input)).toEqual(expected)
  })

  it('applies safe defaults to destructive lifecycle flags', () => {
    expect(parseRoomCommand('remove room-1 member-1')).toMatchObject({ interrupt: true })
    expect(parseRoomCommand('close room-1')).toMatchObject({ interrupt: true })
  })

  it.each([
    ['wat', /unknown action "wat"/u],
    ['list extra', /unexpected positional argument "extra"/u],
    ['list --include-closed maybe', /must be true or false/u],
    ['show', /show requires exactly one room id/u],
    ['show one two', /show requires exactly one room id/u],
    ['create --topic topic', /--name is required/u],
    ['create --name one --name two', /duplicate flag "--name"/u],
    ['create --name', /flag "--name" requires a value/u],
    ['attach room-1', /--session is required/u],
    ['attach room-1 --unknown value', /unknown flag "--unknown"/u],
    ['remove room-1', /member id is required/u],
    ['send room-1 member-1', /--message is required/u],
    ['broadcast room-1 --message ""', /--message value is required/u],
    ['close room-1 --interrupt yes', /must be true or false/u],
  ])('rejects invalid syntax %j', (input, expected) => {
    expect(() => parseRoomCommand(input)).toThrow(expected)
  })
})

describe('/room Host command', () => {
  it('registers the generic command and treats bare input as list', async () => {
    const { definition, rooms } = mount()
    const call = invocation('')

    expect(inject).toEqual(['commands', 'rooms'])
    expect(definition).toMatchObject({
      name: 'room',
      description: expect.stringContaining('attached DSH Sessions'),
      input: { hint: expect.stringContaining('attach') },
    })
    await expect(definition.handler(call)).resolves.toMatchObject({
      kind: 'success',
      text: expect.stringContaining('Build room'),
    })
    expect(rooms.listRooms).toHaveBeenCalledExactlyOnceWith(call.agent, false)
  })

  it('routes read commands without mutating Room state', async () => {
    const { definition, rooms } = mount()
    const call = invocation('show room-1')

    await expect(definition.handler(call)).resolves.toMatchObject({
      kind: 'success',
      text: expect.stringContaining('room-1'),
    })
    expect(rooms.getRoom).toHaveBeenCalledExactlyOnceWith(call.agent, 'room-1')
    expect(rooms.createRoom).not.toHaveBeenCalled()
    expect(rooms.attachSession).not.toHaveBeenCalled()
    expect(rooms.removeMember).not.toHaveBeenCalled()
    expect(rooms.sendMessage).not.toHaveBeenCalled()
    expect(rooms.broadcast).not.toHaveBeenCalled()
    expect(rooms.closeRoom).not.toHaveBeenCalled()
  })

  it('passes the exact calling Agent and cancellation signal to create/attach/send operations', async () => {
    const { definition, rooms } = mount()
    const controller = new AbortController()
    const create = invocation('create --name "Release crew" --topic "Ship it"', controller.signal)
    const attach = invocation('attach room-1 --session child-1 --name Reviewer', controller.signal)
    const send = invocation('send room-1 member-1 --message "Please review"', controller.signal)

    await definition.handler(create)
    await definition.handler(attach)
    await definition.handler(send)

    expect(rooms.createRoom).toHaveBeenCalledExactlyOnceWith(create.agent, {
      name: 'Release crew',
      topic: 'Ship it',
    })
    expect(rooms.attachSession).toHaveBeenCalledExactlyOnceWith(attach.agent, 'room-1', {
      sessionId: 'child-1',
      name: 'Reviewer',
    }, controller.signal)
    expect(rooms.sendMessage).toHaveBeenCalledExactlyOnceWith(
      send.agent,
      'room-1',
      'member-1',
      'Please review',
      controller.signal,
    )
  })

  it('routes remove, broadcast, and close with explicit lifecycle options', async () => {
    const { definition, rooms } = mount()
    const remove = invocation('remove room-1 member-1 --interrupt false')
    const broadcast = invocation('broadcast room-1 --message "Status update"')
    const close = invocation('close room-1 --summary Done --interrupt false')

    await definition.handler(remove)
    await definition.handler(broadcast)
    await definition.handler(close)

    expect(rooms.removeMember).toHaveBeenCalledExactlyOnceWith(remove.agent, 'room-1', 'member-1', false)
    expect(rooms.broadcast).toHaveBeenCalledExactlyOnceWith(
      broadcast.agent,
      'room-1',
      'Status update',
      broadcast.signal,
    )
    expect(rooms.closeRoom).toHaveBeenCalledExactlyOnceWith(close.agent, 'room-1', {
      summary: 'Done',
      interruptRunning: false,
    })
  })

  it('turns parser, runtime, and pre-dispatch cancellation failures into error results', async () => {
    const runtime = mount({
      createRoom: vi.fn(async () => { throw new Error('storage unavailable') }),
    }).definition
    await expect(run(runtime, 'create --name Crew')).resolves.toEqual({
      kind: 'error',
      text: 'storage unavailable',
    })
    await expect(run(runtime, 'create --unknown value')).resolves.toMatchObject({
      kind: 'error',
      text: expect.stringContaining('unknown flag "--unknown"'),
    })

    const controller = new AbortController()
    controller.abort(new Error('operator cancelled'))
    await expect(run(runtime, 'list', controller.signal)).resolves.toEqual({
      kind: 'error',
      text: 'operator cancelled',
    })
  })
})

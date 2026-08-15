import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { describe, expect, it, vi } from 'vitest'
import {
  apply,
  inject,
  parseRoomTemplateCommand,
} from '../src/commands.js'

const template = {
  id: 'research-build-review',
  version: 1,
  name: 'Research, Build & Review',
  description: 'Investigate, implement, and independently review one outcome.',
  defaultObjective: 'Deliver a researched and reviewed implementation.',
  roles: [
    { id: 'researcher', name: 'Researcher', role: 'Gather evidence' },
    { id: 'builder', name: 'Builder', role: 'Implement the result' },
    { id: 'reviewer', name: 'Reviewer', role: 'Review independently' },
  ],
}

function invocation(rawInput: string, signal = new AbortController().signal): CommandInvocation {
  return {
    commandId: 'command-1' as CommandInvocation['commandId'],
    agent: { id: 'leader-1' } as unknown as Agent,
    rawInput,
    signal,
  }
}

function mount(overrides: Record<string, unknown> = {}): {
  definition: CommandDefinition
  rooms: {
    listRoomTemplates: ReturnType<typeof vi.fn>
    getRoomTemplate: ReturnType<typeof vi.fn>
    createRoomFromTemplate: ReturnType<typeof vi.fn>
  }
} {
  let definition: CommandDefinition | undefined
  const rooms = {
    listRoomTemplates: vi.fn(() => [structuredClone(template)]),
    getRoomTemplate: vi.fn(() => structuredClone(template)),
    createRoomFromTemplate: vi.fn(async () => ({
      template: structuredClone(template),
      room: { id: 'room-1', name: 'Research Crew', status: 'open' },
      members: [{ agentId: 'agent-1' }, { agentId: 'agent-2' }, { agentId: 'agent-3' }],
      failures: [],
    })),
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
  if (definition === undefined) throw new Error('room-template command was not registered')
  return { definition, rooms }
}

async function run(definition: CommandDefinition, rawInput: string, signal?: AbortSignal): Promise<CommandResult> {
  return await definition.handler(invocation(rawInput, signal))
}

describe('parseRoomTemplateCommand()', () => {
  it.each([
    ['', { action: 'list' }],
    ['   ', { action: 'list' }],
    [' list ', { action: 'list' }],
    ['show research-build-review', { action: 'show', templateId: 'research-build-review' }],
  ])('parses %j', (input, expected) => {
    expect(parseRoomTemplateCommand(input)).toEqual(expected)
  })

  it('parses every create override while preserving quoted content', () => {
    expect(parseRoomTemplateCommand(
      'create research-build-review --name "Release Crew" --objective "Ship a reviewed build" '
      + '--provider spawn --model-provider openai --model "gpt-5.6 sol"',
    )).toEqual({
      action: 'create',
      templateId: 'research-build-review',
      name: 'Release Crew',
      objective: 'Ship a reviewed build',
      provider: 'spawn',
      modelProvider: 'openai',
      model: 'gpt-5.6 sol',
    })
  })

  it.each([
    ['wat', /unknown action "wat"/u],
    ['list extra', /list accepts no arguments/u],
    ['show', /show requires a template id/u],
    ['show one two', /show accepts exactly one/u],
    ['create', /create requires a template id/u],
    ['create --name crew', /template id before any flags/u],
    ['create sample --wat value', /unknown flag "--wat"/u],
    ['create sample --name one --name two', /duplicate flag "--name"/u],
    ['create sample --name', /flag "--name" requires a value/u],
    ['create sample --name --model x', /flag "--name" requires a value/u],
    ['create sample extra', /unexpected positional argument "extra"/u],
    ['create sample --name="Crew"', /unknown flag "--name=Crew"/u],
    ['create sample --name ""', /--name value cannot be empty/u],
    ['create sample --name "unfinished', /unterminated/u],
    ['create sample --name trailing\\', /dangling escape/u],
  ])('rejects invalid syntax %j', (input, expected) => {
    expect(() => parseRoomTemplateCommand(input)).toThrow(expected)
  })
})

describe('room-template Host command', () => {
  it('registers one independently injectable Host command and treats bare input as list', async () => {
    const { definition, rooms } = mount()

    expect(inject).toEqual(['commands', 'rooms'])
    expect(definition).toMatchObject({
      name: 'room-template',
      description: expect.any(String),
      input: { hint: expect.stringContaining('create <id>') },
    })
    await expect(run(definition, '')).resolves.toMatchObject({
      kind: 'success',
      text: expect.stringContaining('research-build-review'),
    })
    expect(rooms.listRoomTemplates).toHaveBeenCalledOnce()
  })

  it('renders a template without creating a room', async () => {
    const { definition, rooms } = mount()

    const result = await run(definition, ' show research-build-review')

    expect(result).toMatchObject({
      kind: 'success',
      text: expect.stringContaining('Default objective:'),
    })
    expect(result.text).toContain('Reviewer — Review independently')
    expect(rooms.getRoomTemplate).toHaveBeenCalledWith('research-build-review')
    expect(rooms.createRoomFromTemplate).not.toHaveBeenCalled()
  })

  it('passes the exact calling Agent, overrides, and cancellation signal to the Room runtime', async () => {
    const { definition, rooms } = mount()
    const controller = new AbortController()
    const call = invocation(
      ' create research-build-review --name "Release Crew" --objective "Ship it" '
      + '--provider local --model-provider openai --model gpt-5.6',
      controller.signal,
    )

    const result = await definition.handler(call)

    expect(result).toEqual({
      kind: 'success',
      text: [
        'Room "Research Crew" created from research-build-review.',
        'Room id: room-1',
        'Agents started: 3/3',
      ].join('\n'),
    })
    expect(rooms.createRoomFromTemplate).toHaveBeenCalledWith(call.agent, {
      templateId: 'research-build-review',
      name: 'Release Crew',
      objective: 'Ship it',
      provider: 'local',
      modelProvider: 'openai',
      model: 'gpt-5.6',
    }, controller.signal)
  })

  it('returns a traceable error result for partial provisioning failures', async () => {
    const { definition } = mount({
      createRoomFromTemplate: vi.fn(async () => ({
        template: structuredClone(template),
        room: { id: 'room-partial', name: 'Partial Crew', status: 'closed' },
        members: [{ agentId: 'agent-1' }],
        failures: [{ roleId: 'builder', name: 'Builder', error: 'provider unavailable' }],
      })),
    })

    const result = await run(definition, 'create research-build-review')

    expect(result.kind).toBe('error')
    expect(result.text).toContain('Room id: room-partial')
    expect(result.text).toContain('Agents started: 1/3')
    expect(result.text).toContain('Builder (builder): provider unavailable')
    expect(result.text).toContain('partial room remains available for inspection')
  })

  it('turns parser, lookup, runtime, and cancellation failures into CommandResult errors', async () => {
    const lookupFailure = mount({
      getRoomTemplate: vi.fn(() => { throw new Error('unknown template missing') }),
    }).definition
    await expect(run(lookupFailure, 'show missing')).resolves.toEqual({
      kind: 'error',
      text: 'unknown template missing',
    })

    const runtimeFailure = mount({
      createRoomFromTemplate: vi.fn(async () => { throw new Error('provider exploded') }),
    }).definition
    await expect(run(runtimeFailure, 'create research-build-review')).resolves.toEqual({
      kind: 'error',
      text: 'provider exploded',
    })

    await expect(run(runtimeFailure, 'create sample --unknown x')).resolves.toMatchObject({
      kind: 'error',
      text: expect.stringContaining('unknown flag "--unknown"'),
    })

    const controller = new AbortController()
    controller.abort(new Error('operator cancelled'))
    await expect(run(runtimeFailure, 'list', controller.signal)).resolves.toEqual({
      kind: 'error',
      text: 'operator cancelled',
    })
  })
})

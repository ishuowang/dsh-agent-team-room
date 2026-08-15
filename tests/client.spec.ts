import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconUserOutline16: () => null,
  Tooltip: ({ children }: { children: unknown }) => children,
}))

import {
  ROOM_DASHBOARD_PATH,
  ROOM_FOOTER_ENTRY_ID,
  ROOM_TEMPLATE_OPTIONS,
  RoomsFooterAction,
  apply,
  inject,
} from '../src/client/index.js'
import { listRoomTemplates } from '../src/templates.js'

function clientHarness() {
  const register = vi.fn(() => () => undefined)
  const injectSlot = vi.fn((_name: string, callback: () => unknown) => callback())
  const decorate = vi.fn((_contribution: unknown) => () => undefined)
  const command = vi.fn(async () => ({ ok: true, value: { matched: true } }))
  const session = { command }
  const sessions = { binding: vi.fn((id: string) => id === 'leader-1' ? { session } : undefined) }
  const context = {
    slots: { inject: injectSlot, register },
    get: vi.fn((name: string) => {
      if (name === 'commandUi') return { decorate }
      if (name === 'sessions') return sessions
      throw new Error(`unexpected service: ${name}`)
    }),
    effect: vi.fn((callback: () => unknown) => callback()),
  }
  return { context, register, injectSlot, decorate, command }
}

describe('native DSH Web entry', () => {
  it('declares only official native UI services', () => {
    expect(inject).toEqual(['slots', 'commandUi', 'sessions'])
  })

  it('registers a uniquely identified additive sidebar footer action', () => {
    const { context, register, injectSlot } = clientHarness()

    apply(context as never)

    expect(injectSlot).toHaveBeenCalledTimes(1)
    expect(injectSlot).toHaveBeenCalledWith('sidebar.footer.action', expect.any(Function))
    expect(register).toHaveBeenCalledWith({
      name: 'sidebar.footer.action',
      id: ROOM_FOOTER_ENTRY_ID,
      order: 20,
    }, RoomsFooterAction)
  })

  it('decorates the host command with a native confirmed template picker', async () => {
    const { context, decorate, command } = clientHarness()
    apply(context as never)

    expect(decorate).toHaveBeenCalledTimes(1)
    const contribution = decorate.mock.calls[0]?.[0] as {
      name: string
      available(session: { sessionId: string }): boolean
      ui: {
        kind: string
        options(session: { sessionId: string }, signal: AbortSignal): Promise<Array<{
          id: string
          label: string
          confirmation?: { acknowledgeLabel: string; confirmLabel: string }
        }>>
        onSelect(option: { id: string; label: string }, session: { sessionId: string }): Promise<void>
      }
    } | undefined
    expect(contribution).toBeDefined()
    if (!contribution) throw new Error('room-template decoration was not registered')
    expect(contribution).toMatchObject({ name: 'room-template', ui: { kind: 'popupSelect' } })
    expect(contribution.available({ sessionId: 'leader-1' })).toBe(true)
    expect(contribution.available({ sessionId: 'not-materialized' })).toBe(false)

    const options = await contribution.ui.options({ sessionId: 'leader-1' }, new AbortController().signal)
    expect(options).toHaveLength(ROOM_TEMPLATE_OPTIONS.length)
    expect(options[0]).toMatchObject({
      id: 'opc',
      label: 'One-Person Company',
      confirmation: {
        acknowledgeLabel: expect.stringContaining('multiple Agents'),
        confirmLabel: 'Create room',
      },
    })

    const first = options[0]
    if (!first) throw new Error('room-template picker returned no options')
    await contribution.ui.onSelect(first, { sessionId: 'leader-1' })
    expect(command).toHaveBeenCalledExactlyOnceWith('/room-template create opc')
    await expect(contribution.ui.onSelect(first, { sessionId: 'not-materialized' }))
      .rejects.toThrow('not materialized')
  })

  it('keeps the client presentation ids and counts aligned with the host template registry', () => {
    expect(ROOM_TEMPLATE_OPTIONS.map(option => ({ id: option.id, count: option.agentCount })))
      .toEqual(listRoomTemplates().map(template => ({ id: template.id, count: template.roles.length })))
  })

  it('keeps the dashboard link same-origin and rooted at the default route', () => {
    expect(ROOM_DASHBOARD_PATH).toBe('/agent-team-room/')
    expect(new URL(ROOM_DASHBOARD_PATH, 'https://dsh.example').origin).toBe('https://dsh.example')
  })

  it('ships a ModuleLoader-compatible client bundle', () => {
    const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
    let id: string | undefined
    let client: unknown
    const window = {
      __ModuleLoader__: {
        load(registration: {
          id: string
          factory: (require: (specifier: string) => unknown) => unknown
        }) {
          id = registration.id
          client = registration.factory((specifier) => {
            if (specifier === 'react') {
              return {
                createElement: (type: unknown, props: unknown) => ({ type, props }),
                useState: (initial: unknown) => [initial, () => undefined],
              }
            }
            if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
              return {
                IconUserOutline16: () => null,
                Tooltip: ({ children }: { children: unknown }) => children,
              }
            }
            throw new Error(`unexpected browser external: ${specifier}`)
          })
        },
      },
    }

    runInNewContext(source, { window })

    expect(id).toBe('dsh-agent-team-room')
    expect(client).toMatchObject({ inject: ['slots', 'commandUi', 'sessions'], apply: expect.any(Function) })
  })
})

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
  RoomsFooterAction,
  apply,
  inject,
} from '../src/client/index.js'

describe('native DSH Web entry', () => {
  it('declares only the slot registry as a runtime service', () => {
    expect(inject).toEqual(['slots'])
  })

  it('registers a uniquely identified additive sidebar footer action', () => {
    const register = vi.fn(() => () => undefined)
    const injectSlot = vi.fn((_name: string, callback: () => unknown) => callback())

    apply({ slots: { inject: injectSlot, register } } as never)

    expect(injectSlot).toHaveBeenCalledTimes(1)
    expect(injectSlot).toHaveBeenCalledWith('sidebar.footer.action', expect.any(Function))
    expect(register).toHaveBeenCalledWith({
      name: 'sidebar.footer.action',
      id: ROOM_FOOTER_ENTRY_ID,
      order: 20,
    }, RoomsFooterAction)
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
    expect(client).toMatchObject({ inject: ['slots'], apply: expect.any(Function) })
  })
})

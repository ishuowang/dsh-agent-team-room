import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface FakeElement {
  type: unknown
  props: Record<string, unknown>
}

vi.mock('react', () => ({
  createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): FakeElement {
    return {
      type,
      props: {
        ...(props ?? {}),
        ...(children.length === 0
          ? {}
          : { children: children.length === 1 ? children[0] : children }),
      },
    }
  },
  useCallback<T>(callback: T): T {
    return callback
  },
  useEffect(): void {},
  useMemo<T>(factory: () => T): T {
    return factory()
  },
  useState<T>(initial: T): [T, () => void] {
    return [initial, () => undefined]
  },
}))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: 'Button',
  IconCloseOutline16: 'IconCloseOutline16',
  IconLinkOutline16: 'IconLinkOutline16',
  IconPlusOutline16: 'IconPlusOutline16',
  IconRefreshOutline16: 'IconRefreshOutline16',
  IconSendOutline16: 'IconSendOutline16',
  IconUserOutline16: 'IconUserOutline16',
  Input: 'Input',
  Modal: 'Modal',
  RiskConfirmation: 'RiskConfirmation',
  Tooltip: 'Tooltip',
}))

import {
  ROOM_FOOTER_ENTRY_ID,
  ROOM_HEADER_ENTRY_ID,
  ROOM_NATIVE_API_PREFIX,
  apply,
  inject,
  loadRoomSnapshot,
  roomSnapshotUrl,
} from '../src/client/index.js'

interface RegisteredEntry {
  registration: { name: string; id: string; order: number }
  component: (props: Record<string, unknown>) => FakeElement
}

function clientHarness() {
  const entries: RegisteredEntry[] = []
  const register = vi.fn((registration: RegisteredEntry['registration'], component: RegisteredEntry['component']) => {
    entries.push({ registration, component })
    return () => undefined
  })
  const injectSlot = vi.fn((_name: string, callback: () => unknown) => callback())
  const sessions = {}
  const context = {
    slots: { inject: injectSlot, register },
    get: vi.fn((name: string) => {
      if (name === 'sessions') return sessions
      throw new Error(`unexpected service: ${name}`)
    }),
  }
  return { context, entries, register, injectSlot }
}

function renderLauncher(entry: RegisteredEntry, location: 'header' | 'footer'): FakeElement {
  const state = { current: 'leader-1', subagentsByParent: {} }
  const ownerProps = location === 'header'
    ? { sessionId: 'leader-1', useSessions: (selector: (value: typeof state) => unknown) => selector(state) }
    : { wide: true, useSessions: (selector: (value: typeof state) => unknown) => selector(state) }
  const launcher = entry.component(ownerProps)
  if (typeof launcher.type !== 'function') throw new Error('slot contribution did not return the Room launcher')
  return launcher.type(launcher.props) as FakeElement
}

function findElement(root: unknown, type: unknown): FakeElement | undefined {
  if (root === null || root === undefined) return undefined
  if (Array.isArray(root)) {
    for (const child of root) {
      const found = findElement(child, type)
      if (found) return found
    }
    return undefined
  }
  if (typeof root !== 'object') return undefined
  const candidate = root as Partial<FakeElement>
  if (candidate.type === type && candidate.props) return candidate as FakeElement
  return findElement(candidate.props?.children, type)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('native DSH Web entry', () => {
  it('depends only on additive slots and the native Session runtime', () => {
    expect(inject).toEqual(['slots', 'sessions'])
  })

  it('registers only additive header and footer entries without replacing a native surface', () => {
    const { context, entries, injectSlot, register } = clientHarness()

    apply(context as never)

    expect(injectSlot.mock.calls.map(call => call[0])).toEqual([
      'conversation.session.header.actions',
      'sidebar.footer.action',
    ])
    expect(register).toHaveBeenCalledTimes(2)
    expect(entries.map(entry => entry.registration)).toEqual([
      {
        name: 'conversation.session.header.actions',
        id: ROOM_HEADER_ENTRY_ID,
        order: 20,
      },
      {
        name: 'sidebar.footer.action',
        id: ROOM_FOOTER_ENTRY_ID,
        order: 20,
      },
    ])
    expect(entries.map(entry => entry.registration.name)).not.toContain('root')
    expect(entries.map(entry => entry.registration.name)).not.toContain('sidebar')
    expect(entries.map(entry => entry.registration.name)).not.toContain('conversation')
    expect(entries.map(entry => entry.registration.name)).not.toContain('details')
  })

  it('renders Room management in a native Modal from either additive entry', () => {
    const { context, entries } = clientHarness()
    apply(context as never)

    const header = entries.find(entry => entry.registration.id === ROOM_HEADER_ENTRY_ID)
    const footer = entries.find(entry => entry.registration.id === ROOM_FOOTER_ENTRY_ID)
    if (!header || !footer) throw new Error('Room slot entries were not registered')

    for (const [entry, location] of [[header, 'header'], [footer, 'footer']] as const) {
      const rendered = renderLauncher(entry, location)
      const modal = findElement(rendered, 'Modal')
      const riskConfirmation = findElement(rendered, 'RiskConfirmation')
      expect(modal).toBeDefined()
      expect(modal?.props).toMatchObject({
        open: false,
        title: 'Rooms',
        description: expect.stringContaining('independent Sessions'),
      })
      expect(riskConfirmation?.props).toMatchObject({
        open: false,
        acknowledged: false,
      })
    }
  })

  it('uses a same-origin read URL and never asks the snapshot endpoint to mutate state', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ rooms: [] }),
    }))
    vi.stubGlobal('fetch', fetch)

    expect(ROOM_NATIVE_API_PREFIX).toBe('/agent-team-room/api/session/')
    expect(roomSnapshotUrl('leader/one')).toBe('/agent-team-room/api/session/leader%2Fone')
    await expect(loadRoomSnapshot('leader/one')).resolves.toEqual({ rooms: [] })
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/agent-team-room/api/session/leader%2Fone',
      {
        method: 'GET',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      },
    )
  })

  it('ships a ModuleLoader bundle with the native Modal and no retired scenario/dashboard UI', async () => {
    const entryPoint = fileURLToPath(new URL('../src/client/index.ts', import.meta.url))
    const result = await build({
      entryPoints: [entryPoint],
      bundle: true,
      format: 'cjs',
      platform: 'browser',
      target: ['es2022'],
      write: false,
      external: [
        '@deepseek-ai/cordis',
        '@deepseek-ai/dsh-*',
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'scheduler',
      ],
      banner: {
        js: "window.__ModuleLoader__.load({ id: 'dsh-agent-team-room', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
      },
      footer: { js: 'return module.exports; } });' },
    })
    const source = result.outputFiles[0]?.text
    if (!source) throw new Error('esbuild returned no client bundle')
    let id: string | undefined
    let client: unknown
    const primitive = () => null
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
                useCallback: (callback: unknown) => callback,
                useEffect: () => undefined,
                useMemo: (factory: () => unknown) => factory(),
                useState: (initial: unknown) => [initial, () => undefined],
              }
            }
            if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
              return new Proxy({}, { get: () => primitive })
            }
            throw new Error(`unexpected browser external: ${specifier}`)
          })
        },
      },
    }

    runInNewContext(source, { window })

    expect(id).toBe('dsh-agent-team-room')
    expect(client).toMatchObject({ inject: ['slots', 'sessions'], apply: expect.any(Function) })
    expect(source).toContain('.Modal')
    expect(source).not.toMatch(/ROOM_DASHBOARD|ROOM_TEMPLATE_OPTIONS|room-template|One-Person Company/u)
  })

  it('contains no standalone dashboard link or bundled scenario registry in the client source', () => {
    const source = readFileSync(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/ROOM_DASHBOARD|ROOM_TEMPLATE_OPTIONS|room-template|One-Person Company|window\.open/u)
  })
})

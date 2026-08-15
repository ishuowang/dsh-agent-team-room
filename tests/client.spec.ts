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
  ROOM_FOOTER_INVITE_PROVIDER_SLOT,
  ROOM_HEADER_ENTRY_ID,
  ROOM_INVITE_PROVIDER_SLOT,
  ROOM_MENTION_SOURCE_NAME,
  ROOM_NATIVE_API_PREFIX,
  apply,
  createRoomMentionSource,
  inject,
  loadRoomSnapshot,
  roomMentionCandidates,
  roomSnapshotUrl,
} from '../src/client/index.js'
import { parseRoomCommand } from '../src/commands.js'

interface RegisteredEntry {
  registration: {
    name: string
    id: string
    order: number
    children?: Record<string, { kind: string; scope: string }>
  }
  component: (props: Record<string, unknown>) => FakeElement
}

function clientHarness() {
  const entries: RegisteredEntry[] = []
  const register = vi.fn((registration: RegisteredEntry['registration'], component: RegisteredEntry['component']) => {
    entries.push({ registration, component })
    return () => undefined
  })
  const injectSlot = vi.fn((_name: string, callback: () => unknown) => callback())
  const registerSource = vi.fn((_source: unknown) => () => undefined)
  const sessions = { binding: vi.fn() }
  const context = {
    effect: vi.fn((callback: () => unknown) => callback()),
    slots: { inject: injectSlot, register },
    get: vi.fn((name: string) => {
      if (name === 'sessions') return sessions
      if (name === 'inputTriggers') return { registerSource }
      throw new Error(`unexpected service: ${name}`)
    }),
  }
  return { context, entries, register, injectSlot, registerSource, sessions }
}

function renderLauncher(entry: RegisteredEntry, location: 'header' | 'footer'): FakeElement {
  const state = { current: 'leader-1', subagentsByParent: {} }
  const ownerProps = location === 'header'
    ? {
        sessionId: 'leader-1',
        useSessions: (selector: (value: typeof state) => unknown) => selector(state),
        renderSlot: () => null,
      }
    : {
        wide: true,
        useSessions: (selector: (value: typeof state) => unknown) => selector(state),
        renderSlot: () => null,
      }
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

const mentionSnapshot = {
  rooms: [
    {
      id: 'room-alpha/one',
      name: 'Release Room',
      leaderSessionId: 'leader-1',
      status: 'open' as const,
      members: [
        {
          memberId: 'leader-member',
          kind: 'leader' as const,
          name: 'Leader',
          connection: { protocol: 'dsh.session/v1', sessionId: 'leader-1' },
          status: 'leader' as const,
        },
        {
          memberId: 'member-alex-111111',
          kind: 'member' as const,
          name: 'Alex',
          connection: { protocol: 'dsh.session/v1', sessionId: 'child-1' },
          status: 'idle' as const,
        },
        {
          memberId: 'member-alex-222222',
          kind: 'member' as const,
          name: 'Alex',
          connection: { protocol: 'dsh.session/v1', sessionId: 'child-2' },
          status: 'working' as const,
        },
        {
          memberId: 'member-self',
          kind: 'member' as const,
          name: 'Self alias',
          connection: { protocol: 'dsh.session/v1', sessionId: 'leader-1' },
          status: 'idle' as const,
        },
        {
          memberId: 'member-mira-333333',
          kind: 'member' as const,
          name: 'Mira',
          connection: { protocol: 'dsh.session/v1', sessionId: 'child-mira' },
          status: 'idle' as const,
        },
        {
          memberId: 'member-removed',
          kind: 'member' as const,
          name: 'Removed',
          connection: { protocol: 'dsh.session/v1', sessionId: 'child-3' },
          status: 'removed' as const,
        },
      ],
    },
    {
      id: 'room-design',
      name: 'Design Room',
      leaderSessionId: 'leader-1',
      status: 'open' as const,
      members: [
        {
          memberId: 'member-alex-444444',
          kind: 'member' as const,
          name: 'Alex',
          connection: { protocol: 'dsh.session/v1', sessionId: 'child-alex-design' },
          status: 'interrupted' as const,
        },
        {
          memberId: 'member-lin-555555',
          kind: 'member' as const,
          name: 'Lin',
          connection: { protocol: 'dsh.session/v1', sessionId: 'child-lin' },
          status: 'working' as const,
        },
      ],
    },
    {
      id: 'room-foreign',
      name: 'Foreign Room',
      leaderSessionId: 'someone-else',
      status: 'open' as const,
      members: [{
        memberId: 'member-foreign',
        kind: 'member' as const,
        name: 'Foreign member',
        connection: { protocol: 'dsh.session/v1', sessionId: 'child-foreign' },
        status: 'idle' as const,
      }],
    },
    {
      id: 'room-closed',
      name: 'Closed Room',
      leaderSessionId: 'leader-1',
      status: 'closed' as const,
      members: [{
        memberId: 'member-closed',
        kind: 'member' as const,
        name: 'Closed member',
        connection: { protocol: 'dsh.session/v1', sessionId: 'child-4' },
        status: 'idle' as const,
      }],
    },
  ],
}

describe('native Room member mentions', () => {
  it('offers only active members in the current Session open Rooms and keeps duplicate names distinct', () => {
    const candidates = roomMentionCandidates(mentionSnapshot, 'leader-1')

    expect(candidates).toHaveLength(5)
    expect(candidates.map(candidate => candidate.name)).toEqual([
      'Alex · Release Room · member…1111',
      'Alex · Release Room · member…2222',
      'Mira',
      'Alex · Design Room',
      'Lin',
    ])
    expect(candidates.map(candidate => candidate.description)).toEqual([
      'Release Room · idle · member…1111',
      'Release Room · working · member…2222',
      'Release Room · idle · member…3333',
      'Design Room · interrupted · member…4444',
      'Design Room · working · member…5555',
    ])
    expect(candidates.map(candidate => candidate.memberId)).toEqual([
      'member-alex-111111',
      'member-alex-222222',
      'member-mira-333333',
      'member-alex-444444',
      'member-lin-555555',
    ])
    expect(new Set(candidates.map(candidate => `${candidate.roomId}/${candidate.memberId}`)).size).toBe(5)
  })

  it('uses the native source for leading-only search and identity-bound selection', async () => {
    const loader = vi.fn(async () => mentionSnapshot)
    const send = vi.fn(async () => undefined)
    const source = createRoomMentionSource(loader, send)
    const controller = new AbortController()
    const session = { sessionId: 'leader-1' } as never

    await expect(source.candidates(session, {
      query: 'alex',
      position: 'inline',
      signal: controller.signal,
    })).resolves.toEqual([])
    const byRoom = await source.candidates(session, {
      query: 'release',
      position: 'leading',
      signal: controller.signal,
    })
    const byId = await source.candidates(session, {
      query: '222222',
      position: 'leading',
      signal: controller.signal,
    })

    expect(loader).toHaveBeenNthCalledWith(1, 'leader-1', controller.signal)
    expect(byRoom).toHaveLength(3)
    expect(byId).toHaveLength(1)
    expect(byId[0]).toMatchObject({ memberId: 'member-alex-222222' })

    const picked = source.onPick({
      candidate: byId[0]!,
      session,
      position: 'leading',
      via: 'menu',
      span: { start: 7, end: 10, draftRev: 4 },
    })
    if (!picked || picked === 'handled' || !('claim' in picked)) throw new Error('Room member pick did not create a command claim')
    expect(picked.claim.token).toBe('@Alex ')
    await expect(picked.claim.submit('  Review the release  ', {} as never)).resolves.toEqual({
      kind: 'success',
      text: 'Sent to Alex.',
    })
    expect(send).toHaveBeenCalledExactlyOnceWith(
      'leader-1',
      'room-alpha/one',
      'member-alex-222222',
      'Review the release',
    )
    await expect(picked.claim.submit('   ', {} as never)).resolves.toEqual({
      kind: 'error',
      text: 'Write a message for Alex.',
    })
    expect(send).toHaveBeenCalledOnce()
    send.mockRejectedValueOnce(new Error('Room is busy'))
    await expect(picked.claim.submit('Try again', {} as never)).resolves.toEqual({
      kind: 'error',
      text: 'Room is busy',
    })
    expect(send).toHaveBeenCalledTimes(2)

    expect(source.onPick({
      candidate: { ...byId[0]! },
      session,
      position: 'leading',
      via: 'menu',
      span: { start: 7, end: 10, draftRev: 4 },
    })).toBeUndefined()
    expect(source.onPick({
      candidate: byId[0]!,
      session,
      position: 'inline',
      via: 'menu',
      span: { start: 7, end: 10, draftRev: 4 },
    })).toBeUndefined()

  })
})

describe('native DSH Web entry', () => {
  it('depends only on additive slots and the native Session runtime', () => {
    expect(inject).toEqual(['slots', 'sessions', 'inputTriggers'])
  })

  it('registers one Room member source with the native @ input pipeline', () => {
    const { context, registerSource } = clientHarness()

    apply(context as never)

    expect(registerSource).toHaveBeenCalledOnce()
    expect(registerSource.mock.calls[0]?.[0]).toMatchObject({
      trigger: '@',
      name: ROOM_MENTION_SOURCE_NAME,
      order: 20,
    })
  })

  it('routes a picked member claim through the live Session /room command', async () => {
    const command = vi.fn(async (_line: string) => ({ ok: true, value: { matched: true } }))
    const { context, registerSource, sessions } = clientHarness()
    sessions.binding.mockReturnValue({ session: { command } })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mentionSnapshot,
    })))
    apply(context as never)
    const source = registerSource.mock.calls[0]?.[0] as ReturnType<typeof createRoomMentionSource>
    const session = { sessionId: 'leader-1' } as never
    const candidates = await source.candidates(session, {
      query: '222222',
      position: 'leading',
      signal: new AbortController().signal,
    })
    const picked = source.onPick({
      candidate: candidates[0]!,
      session,
      position: 'leading',
      via: 'menu',
      span: { start: 0, end: 7, draftRev: 1 },
    })
    if (!picked || picked === 'handled' || !('claim' in picked)) throw new Error('Room member pick did not create a command claim')

    const message = "--Ship Bob's C:\\release\nnow"
    await expect(picked.claim.submit(message, {} as never)).resolves.toEqual({
      kind: 'success',
      text: 'Sent to Alex.',
    })
    expect(sessions.binding).toHaveBeenCalledExactlyOnceWith('leader-1')
    expect(command).toHaveBeenCalledExactlyOnceWith(
      "/room send 'room-alpha/one' 'member-alex-222222' --message '--Ship Bob\\'s C:\\\\release\nnow'",
    )
    const commandLine = command.mock.calls[0]![0]
    expect(parseRoomCommand(commandLine.slice('/room'.length))).toEqual({
      action: 'send',
      roomId: 'room-alpha/one',
      memberId: 'member-alex-222222',
      message,
    })
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
        children: {
          [ROOM_INVITE_PROVIDER_SLOT]: { kind: 'list', scope: 'session' },
        },
      },
      {
        name: 'sidebar.footer.action',
        id: ROOM_FOOTER_ENTRY_ID,
        order: 20,
        children: {
          [ROOM_FOOTER_INVITE_PROVIDER_SLOT]: { kind: 'list', scope: 'session' },
        },
      },
    ])
    const childSlotNames = entries.flatMap(entry => Object.keys(entry.registration.children ?? {}))
    expect(childSlotNames).toEqual([
      ROOM_INVITE_PROVIDER_SLOT,
      ROOM_FOOTER_INVITE_PROVIDER_SLOT,
    ])
    expect(new Set(childSlotNames).size).toBe(childSlotNames.length)
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
    expect(client).toMatchObject({ inject: ['slots', 'sessions', 'inputTriggers'], apply: expect.any(Function) })
    expect(source).toContain('.Modal')
    expect(source).not.toMatch(/ROOM_DASHBOARD|ROOM_TEMPLATE_OPTIONS|room-template|One-Person Company/u)
  })

  it('contains no standalone dashboard link or bundled scenario registry in the client source', () => {
    const source = readFileSync(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/ROOM_DASHBOARD|ROOM_TEMPLATE_OPTIONS|room-template|One-Person Company|window\.open/u)
  })
})

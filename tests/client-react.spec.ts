// @vitest-environment jsdom

import { createElement } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const react = await vi.importActual<typeof import('react')>('react')

  function Button(props: Record<string, unknown>) {
    const {
      children,
      icon: _icon,
      variant: _variant,
      size: _size,
      ...buttonProps
    } = props
    return react.createElement(
      'button',
      { type: 'button', ...buttonProps },
      children as ReactNode,
    )
  }

  function Input(props: Record<string, unknown>) {
    return react.createElement('input', props)
  }

  function Modal(props: Record<string, unknown>) {
    if (!props['open']) return null
    return react.createElement('div', {
      role: 'dialog',
      'aria-label': props['title'],
      children: props['children'] as ReactNode,
    })
  }

  function RiskConfirmation(props: Record<string, unknown>) {
    if (!props['open']) return null
    return react.createElement('div', {
      role: 'dialog',
      'aria-label': props['title'],
      'data-risk-confirmation': true,
      children: [
        react.createElement('button', {
          key: 'cancel',
          type: 'button',
          onClick: props['onCancel'],
          children: props['cancelLabel'],
        }),
        react.createElement('button', {
          key: 'confirm',
          type: 'button',
          onClick: props['onConfirm'],
          children: props['confirmLabel'],
        }),
      ],
    })
  }

  function Tooltip(props: Record<string, unknown>) {
    return props['children'] as ReactNode
  }

  const Icon = () => null
  return {
    Button,
    IconCloseOutline16: Icon,
    IconLinkOutline16: Icon,
    IconPlusOutline16: Icon,
    IconRefreshOutline16: Icon,
    IconSendOutline16: Icon,
    IconUserOutline16: Icon,
    Input,
    Modal,
    RiskConfirmation,
    Tooltip,
  }
})

import { ROOM_VIEW_ENTRY_ID, apply } from '../src/client/index.js'

interface RegisteredEntry {
  registration: {
    id?: string
    name: string
  }
  component: ComponentType<Record<string, unknown>>
}

interface SnapshotActivity {
  id: string
  type: string
  at: string
  relayId?: string
  acceptedCount?: number
  failedCount?: number
  label: string
}

interface SnapshotMessage {
  id: string
  at: number
  role: 'leader' | 'member'
  authorMemberId: string
  authorName: string
  recipientMemberIds: string[]
  text: string
  status: 'accepted' | 'completed'
  sessionId?: string
  relayId?: string
  mode?: 'direct' | 'broadcast'
}

const roomSnapshot = {
  rooms: [
    {
      id: 'room-alpha',
      name: 'Alpha Room',
      topic: 'Alpha work',
      leaderSessionId: 'leader-1',
      status: 'open' as const,
      members: [
        {
          memberId: 'leader-alpha',
          kind: 'leader' as const,
          name: 'Leader',
          connection: { protocol: 'dsh.session/v1', sessionId: 'leader-1' },
          status: 'leader' as const,
        },
        {
          memberId: 'member-alice',
          kind: 'member' as const,
          name: 'Alice',
          connection: { protocol: 'dsh.session/v1', sessionId: 'child-alice' },
          status: 'idle' as const,
        },
      ],
      activity: [] as SnapshotActivity[],
      conversation: {
        messages: [] as SnapshotMessage[],
        unavailableMemberIds: [],
        hiddenMixedReplyCount: 0,
      },
    },
    {
      id: 'room-beta',
      name: 'Beta Room',
      topic: 'Beta work',
      leaderSessionId: 'leader-1',
      status: 'open' as const,
      members: [
        {
          memberId: 'leader-beta',
          kind: 'leader' as const,
          name: 'Leader',
          connection: { protocol: 'dsh.session/v1', sessionId: 'leader-1' },
          status: 'leader' as const,
        },
        {
          memberId: 'member-bob',
          kind: 'member' as const,
          name: 'Bob',
          connection: { protocol: 'dsh.session/v1', sessionId: 'child-bob' },
          status: 'idle' as const,
        },
      ],
      activity: [] as SnapshotActivity[],
      conversation: {
        messages: [] as SnapshotMessage[],
        unavailableMemberIds: [],
        hiddenMixedReplyCount: 0,
      },
    },
  ],
}

function harness() {
  const entries: RegisteredEntry[] = []
  const command = vi.fn(async () => ({ ok: true, value: { matched: true } }))
  const sessions = {
    binding: vi.fn(() => ({ session: { command } })),
    open: vi.fn(),
    openSubagent: vi.fn(),
    refreshSubagents: vi.fn(async () => undefined),
    setSubagentCatalogOpen: vi.fn(),
    subagentAddress: vi.fn(() => undefined),
  }
  const context = {
    effect: vi.fn((callback: () => unknown) => callback()),
    slots: {
      inject: vi.fn((_name: string, callback: () => unknown) => callback()),
      register: vi.fn((registration: RegisteredEntry['registration'], component: RegisteredEntry['component']) => {
        entries.push({ registration, component })
        return () => undefined
      }),
    },
    get: vi.fn((name: string) => {
      if (name === 'sessions') return sessions
      if (name === 'inputTriggers') return { registerSource: vi.fn(() => () => undefined) }
      throw new Error(`unexpected service: ${name}`)
    }),
  }
  apply(context as never)
  const entry = entries.find(candidate => candidate.registration.id === ROOM_VIEW_ENTRY_ID)
  if (!entry) throw new Error('Room conversation view was not registered')

  const sessionsState = {
    current: 'leader-1',
    subagentsByParent: {
      'leader-1': {
        entries: [{
          kind: 'child' as const,
          id: 'child-spare',
          label: 'Spare child',
          mode: 'continuable' as const,
          activity: 'inactive' as const,
          hasChildren: false,
        }],
        parentAvailable: true,
        state: 'ready' as const,
        error: null,
      },
    },
  }
  const props = {
    sessionId: 'leader-1',
    useSessions: (selector: (value: typeof sessionsState) => unknown) => selector(sessionsState),
    renderSlot: () => null,
  }
  return { command, entry, props, sessions }
}

function stubSnapshot(snapshot: typeof roomSnapshot = roomSnapshot): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => structuredClone(snapshot),
  }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('native Room conversation interactions', () => {
  it('clears the Room-scoped draft, direct target, Attach panel, and pending risk when switching Rooms', async () => {
    stubSnapshot()
    const user = userEvent.setup()
    const { command, entry, props, sessions } = harness()
    render(createElement(entry.component, props))

    await screen.findByRole('log', { name: 'Alpha Room conversation' })
    await user.click(screen.getByRole('button', { name: /^Alice$/u }))
    const directInput = screen.getByRole('textbox', { name: 'Message Alice' })
    await user.type(directInput, 'Alpha-only draft')
    await user.click(screen.getByRole('button', { name: /^Attach$/u }))
    expect(document.querySelector('[data-room-invite]')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Remove Alice' }))
    expect(screen.getByRole('dialog', { name: 'Remove Room member?' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /Beta Room/u }))
    const betaInput = screen.getByRole('textbox', { name: 'Message everyone in Room' })
    expect((betaInput as HTMLTextAreaElement).value).toBe('')
    expect(document.querySelector('[data-room-invite]')).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Remove Room member?' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Everyone' }).getAttribute('aria-pressed')).toBe('true')

    await user.click(screen.getByRole('button', { name: /Alpha Room/u }))
    expect(screen.getByRole('textbox', { name: 'Message everyone in Room' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Everyone' }).getAttribute('aria-pressed')).toBe('true')
    expect(command).not.toHaveBeenCalled()
    expect(sessions.refreshSubagents).toHaveBeenCalledExactlyOnceWith('leader-1')
    expect(sessions.setSubagentCatalogOpen).not.toHaveBeenCalled()
  })

  it('sends direct and broadcast messages through the current Session command path', async () => {
    stubSnapshot()
    const user = userEvent.setup()
    const { command, entry, props, sessions } = harness()
    render(createElement(entry.component, props))

    await screen.findByRole('log', { name: 'Alpha Room conversation' })
    await user.click(screen.getByRole('button', { name: /^Alice$/u }))
    const direct = screen.getByRole('textbox', { name: 'Message Alice' })
    fireEvent.change(direct, { target: { value: "Review Bob's C:\\release\nnow" } })
    await user.click(screen.getByRole('button', { name: 'Send to Alice' }))
    await waitFor(() => expect(command).toHaveBeenCalledTimes(1))
    expect(command).toHaveBeenNthCalledWith(
      1,
      "/room send 'room-alpha' 'member-alice' --message 'Review Bob\\'s C:\\\\release\nnow'",
    )
    expect((screen.getByRole('textbox', { name: 'Message Alice' }) as HTMLTextAreaElement).value).toBe('')

    await user.click(screen.getByRole('button', { name: /^Everyone$/u }))
    const broadcast = screen.getByRole('textbox', { name: 'Message everyone in Room' })
    await user.type(broadcast, 'Ship status')
    await user.click(screen.getByRole('button', { name: 'Broadcast to Room' }))
    await waitFor(() => expect(command).toHaveBeenCalledTimes(2))
    expect(command).toHaveBeenNthCalledWith(
      2,
      "/room broadcast 'room-alpha' --message 'Ship status'",
    )
    expect((screen.getByRole('textbox', { name: 'Message everyone in Room' }) as HTMLTextAreaElement).value).toBe('')
    expect(sessions.setSubagentCatalogOpen).not.toHaveBeenCalled()
  })

  it('keeps a partial-broadcast failure visible and labels only accepted recipients', async () => {
    const snapshot = structuredClone(roomSnapshot)
    snapshot.rooms[0]!.activity = [{
      id: 'partial-activity',
      type: 'message.broadcast',
      at: '2026-08-16T00:00:00.000Z',
      relayId: 'partial-relay',
      acceptedCount: 1,
      failedCount: 1,
      label: 'Broadcast accepted for 1; failed for 1',
    }]
    snapshot.rooms[0]!.conversation.messages = [{
      id: 'relay:partial-relay',
      at: Date.parse('2026-08-16T00:00:00.000Z'),
      role: 'leader',
      authorMemberId: 'leader-alpha',
      authorName: 'Leader',
      recipientMemberIds: ['member-alice'],
      text: 'Partial update',
      status: 'accepted',
      sessionId: 'leader-1',
      relayId: 'partial-relay',
      mode: 'broadcast',
    }]
    stubSnapshot(snapshot)
    const { entry, props } = harness()
    render(createElement(entry.component, props))

    await screen.findByText('Partial update')
    expect(screen.getByText(/Alice accepted · 1 failed/u)).toBeTruthy()
    expect(screen.getByText(/Broadcast accepted for 1; failed for 1/u)).toBeTruthy()
  })

  it('serializes fast duplicate Enter sends while the first command is in flight', async () => {
    stubSnapshot()
    let resolveCommand: ((value: { ok: true; value: { matched: true } }) => void) | undefined
    const pending = new Promise<{ ok: true; value: { matched: true } }>((resolve) => {
      resolveCommand = resolve
    })
    const { command, entry, props } = harness()
    command.mockImplementation(() => pending)
    render(createElement(entry.component, props))

    const input = await screen.findByRole('textbox', { name: 'Message everyone in Room' })
    fireEvent.change(input, { target: { value: 'One message only' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    expect(command).toHaveBeenCalledTimes(1)
    resolveCommand?.({ ok: true, value: { matched: true } })
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(''))
  })

  it('refreshes the subagent catalog only when Attach opens and never toggles the shared catalog-open flag', async () => {
    stubSnapshot()
    const user = userEvent.setup()
    const { entry, props, sessions } = harness()
    const rendered = render(createElement(entry.component, props))

    await screen.findByRole('log', { name: 'Alpha Room conversation' })
    expect(sessions.refreshSubagents).not.toHaveBeenCalled()
    const attachToggle = screen.getByRole('button', { name: /^Attach$/u })
    expect(attachToggle.getAttribute('aria-controls')).toBe('room-attach-room-alpha')
    await user.click(attachToggle)
    expect(sessions.refreshSubagents).toHaveBeenCalledExactlyOnceWith('leader-1')
    await user.click(attachToggle)
    expect(sessions.refreshSubagents).toHaveBeenCalledOnce()
    rendered.unmount()
    expect(sessions.setSubagentCatalogOpen).not.toHaveBeenCalled()
  })
})

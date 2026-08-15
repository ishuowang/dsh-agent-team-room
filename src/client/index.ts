import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import type { ClientContext, ISessions, SessionId, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  Button,
  IconCloseOutline16,
  IconLinkOutline16,
  IconPlusOutline16,
  IconRefreshOutline16,
  IconSendOutline16,
  IconUserOutline16,
  Input,
  Modal,
  RiskConfirmation,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

interface RoomMemberView {
  memberId: string
  kind: 'leader' | 'member'
  name: string
  connection: {
    protocol: string
    sessionId?: string
  }
  profile?: {
    apiVersion: string
    kind: string
    id: string
    version?: string
  }
  status: 'leader' | 'working' | 'idle' | 'interrupted' | 'error' | 'removed'
}

interface RoomView {
  id: string
  name: string
  topic?: string
  leaderSessionId: string
  status: 'open' | 'closed'
  members: RoomMemberView[]
}

export const ROOM_HEADER_ENTRY_ID = 'dsh-agent-team-room-header'
export const ROOM_FOOTER_ENTRY_ID = 'dsh-agent-team-room-footer'
export const ROOM_NATIVE_API_PREFIX = '/agent-team-room/api/session/'
export const ROOM_INVITE_PROVIDER_SLOT = 'agent-team-room.invite.provider'

/** Owner props exposed to optional member-source plugins inside the Room invite panel. */
export interface RoomInviteProviderOwnerProps {
  sessionId: string
  roomId: string
  roomName: string
  disabled: boolean
  onAttached: () => void
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Additive, provider-owned member pickers. Room never interprets role or policy data. */
    'agent-team-room.invite.provider': {
      kind: 'list'
      scope: 'session'
      owner: RoomInviteProviderOwnerProps
    }
  }
}

export type RoomsHeaderActionProps = PropsRuntime<'conversation.session.header.actions'>
export type RoomsFooterActionProps = PropsRuntime<'sidebar.footer.action'> & SidebarFooterActionOwnerProps
type RoomsHeaderHostProps = RoomsHeaderActionProps & PropsRenderSlots<typeof ROOM_INVITE_PROVIDER_SLOT>
type RoomsFooterHostProps = RoomsFooterActionProps & PropsRenderSlots<typeof ROOM_INVITE_PROVIDER_SLOT>

interface RoomsSnapshot {
  rooms: RoomView[]
}

interface LauncherProps {
  sessionId: SessionId | undefined
  sessions: ISessions
  sessionsState: SessionListState
  wide?: boolean
  location: 'header' | 'footer'
  renderInviteProviders: (owner: RoomInviteProviderOwnerProps) => ReactNode
}

type PendingRisk =
  | { kind: 'remove'; roomId: string; memberId: string; memberName: string }
  | { kind: 'close'; roomId: string; roomName: string }

const color = {
  panel: 'var(--dsw-alias-bg-layer-1, #fff)',
  subtle: 'var(--dsw-alias-bg-layer-2, #f7f7f8)',
  border: 'var(--dsw-alias-border-normal, rgba(0,0,0,.1))',
  text: 'var(--dsw-alias-label-primary, #171717)',
  muted: 'var(--dsw-alias-label-secondary, #6b6b6b)',
  accent: 'var(--dsw-alias-interactive-primary, #4d6bfe)',
  danger: 'var(--dsw-alias-label-error, #d84a4a)',
}

const layoutStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  minHeight: 430,
  maxHeight: 'min(70vh, 680px)',
  color: color.text,
}

const cardStyle: CSSProperties = {
  border: `1px solid ${color.border}`,
  borderRadius: 14,
  background: color.panel,
}

function commandQuote(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

export function roomSnapshotUrl(sessionId: string): string {
  return `${ROOM_NATIVE_API_PREFIX}${encodeURIComponent(sessionId)}`
}

export async function loadRoomSnapshot(sessionId: string, signal?: AbortSignal): Promise<RoomsSnapshot> {
  const response = await fetch(roomSnapshotUrl(sessionId), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  })
  const value = await response.json() as Partial<RoomsSnapshot> & { error?: string }
  if (!response.ok) throw new Error(value.error || `Room snapshot failed with ${response.status}`)
  if (!Array.isArray(value.rooms)) throw new Error('Room snapshot has no rooms array')
  return { rooms: value.rooms }
}

function statusColor(status: RoomMemberView['status']): string {
  if (status === 'working') return '#22a06b'
  if (status === 'error') return '#d84a4a'
  if (status === 'interrupted') return '#d99032'
  if (status === 'removed') return '#999'
  return '#7d8aa5'
}

function shortId(value: string): string {
  return value.length <= 16 ? value : `${value.slice(0, 8)}…${value.slice(-5)}`
}

function Empty({ children }: { children: ReactNode }): ReactElement {
  return createElement('div', {
    style: {
      display: 'grid',
      placeItems: 'center',
      minHeight: 170,
      padding: 22,
      border: `1px dashed ${color.border}`,
      borderRadius: 14,
      color: color.muted,
      textAlign: 'center',
      lineHeight: 1.55,
    },
    children,
  })
}

function RoomsLauncher({
  sessionId,
  sessions,
  sessionsState,
  wide,
  location,
  renderInviteProviders,
}: LauncherProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [rooms, setRooms] = useState<RoomView[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [creating, setCreating] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [roomTopic, setRoomTopic] = useState('')
  const [broadcastText, setBroadcastText] = useState('')
  const [directTarget, setDirectTarget] = useState<string>()
  const [directText, setDirectText] = useState('')
  const [pendingRisk, setPendingRisk] = useState<PendingRisk>()
  const [riskAcknowledged, setRiskAcknowledged] = useState(false)

  const selected = useMemo(
    () => rooms.find(room => room.id === selectedId) ?? rooms[0],
    [rooms, selectedId],
  )
  const ownsSelected = selected !== undefined && selected.leaderSessionId === sessionId && selected.status === 'open'
  const catalog = sessionId ? sessionsState.subagentsByParent[sessionId] : undefined
  const continuableChildren = (catalog?.entries ?? []).filter(entry => (
    entry.kind === 'child' && entry.mode === 'continuable'
  ))
  const attachedSessions = new Set(
    selected?.members.filter(member => member.status !== 'removed').flatMap(member => (
      member.connection.sessionId ? [member.connection.sessionId] : []
    )) ?? [],
  )

  const refresh = useCallback(async (signal?: AbortSignal): Promise<void> => {
    if (!sessionId) {
      setRooms([])
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      const snapshot = await loadRoomSnapshot(sessionId, signal)
      setRooms(snapshot.rooms)
      setSelectedId(current => (
        current && snapshot.rooms.some(room => room.id === current) ? current : snapshot.rooms[0]?.id
      ))
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    if (!open || !sessionId) return
    const controller = new AbortController()
    void refresh(controller.signal)
    sessions.setSubagentCatalogOpen(sessionId, true)
    void sessions.refreshSubagents(sessionId).catch(() => undefined)
    return () => {
      controller.abort()
      sessions.setSubagentCatalogOpen(sessionId, false)
    }
  }, [open, refresh, sessionId, sessions])

  const runCommand = useCallback(async (line: string): Promise<void> => {
    if (!sessionId) return
    const live = sessions.binding(sessionId)?.session
    if (!live) throw new Error('The current Session is not materialized yet')
    setBusy(true)
    setError(undefined)
    try {
      const result = await live.command(line)
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      if (!result.value.matched) throw new Error('The Host does not offer the /room command')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      throw cause
    } finally {
      setBusy(false)
    }
  }, [refresh, sessionId, sessions])

  const createRoom = async (): Promise<void> => {
    if (!roomName.trim()) return
    await runCommand(`/room create --name ${commandQuote(roomName)}${
      roomTopic.trim() ? ` --topic ${commandQuote(roomTopic)}` : ''
    }`)
    setCreating(false)
    setRoomName('')
    setRoomTopic('')
  }

  const attachSession = async (childId: string, label: string): Promise<void> => {
    if (!selected) return
    await runCommand(
      `/room attach ${commandQuote(selected.id)} --session ${commandQuote(childId)} --name ${commandQuote(label)}`,
    )
  }

  const cancelRisk = (): void => {
    setPendingRisk(undefined)
    setRiskAcknowledged(false)
  }

  const confirmRisk = async (): Promise<void> => {
    if (!pendingRisk) return
    if (pendingRisk.kind === 'remove') {
      await runCommand(`/room remove ${commandQuote(pendingRisk.roomId)} ${commandQuote(pendingRisk.memberId)}`)
    } else {
      await runCommand(`/room close ${commandQuote(pendingRisk.roomId)}`)
    }
    cancelRisk()
  }

  const openMemberSession = (room: RoomView, member: RoomMemberView): void => {
    const memberSessionId = member.connection.sessionId
    if (!memberSessionId) return
    if (memberSessionId === room.leaderSessionId) {
      sessions.open(memberSessionId as SessionId)
      return
    }
    const address = sessions.subagentAddress(memberSessionId as SessionId)
    if (address) sessions.openSubagent(address)
    else sessions.openSubagent({
      parentSessionId: room.leaderSessionId as SessionId,
      childSessionId: memberSessionId as SessionId,
      mode: 'continuable',
    })
  }

  const trigger = location === 'header'
    ? createElement(Button, {
        variant: 'toolbar',
        size: 'sm',
        icon: createElement(IconUserOutline16, { size: 16 }),
        'aria-label': 'Open Rooms',
        id: 'room-header-trigger',
        disabled: !sessionId,
        onClick: () => setOpen(true),
        children: rooms.length > 0 ? String(rooms.length) : 'Rooms',
      })
    : createElement(Tooltip, {
        label: 'Open Rooms',
        side: 'right',
        delayMs: 500,
        disabled: wide ?? false,
        children: createElement('button', {
          type: 'button',
          'aria-label': 'Open Rooms',
          id: 'room-footer-trigger',
          disabled: !sessionId,
          onMouseEnter: () => undefined,
          onClick: () => setOpen(true),
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: wide ? 'flex-start' : 'center',
            gap: 8,
            width: wide ? 'calc(100% + 8px)' : 36,
            height: wide ? 34 : 36,
            margin: wide ? '4px -4px 0' : '8px 0 0',
            padding: wide ? '6px 10px' : 0,
            border: 0,
            borderRadius: wide ? 12 : '50%',
            background: 'transparent',
            color: color.text,
            cursor: sessionId ? 'pointer' : 'not-allowed',
            font: 'inherit',
          },
          children: [
            createElement(IconUserOutline16, { key: 'icon', size: wide ? 16 : 18 }),
            wide ? createElement('span', { key: 'label', children: 'Rooms' }) : null,
          ],
        }),
      })

  const roomList = createElement('aside', {
    style: { ...cardStyle, flex: '1 1 145px', minWidth: 0, padding: 10, overflow: 'auto' },
    children: [
      createElement('div', {
        key: 'head',
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 10px' },
        children: [
          createElement('strong', { key: 'title', style: { fontSize: 13 }, children: 'Your Rooms' }),
          createElement(Button, {
            key: 'create',
            variant: 'toolbar',
            size: 'sm',
            icon: createElement(IconPlusOutline16, { size: 14 }),
            disabled: !sessionId || busy,
            onClick: () => setCreating(true),
            children: 'New',
          }),
        ],
      }),
      rooms.length === 0
        ? createElement(Empty, { key: 'empty', children: loading ? 'Loading Rooms…' : 'No Room yet. Create one, then attach an existing Session.' })
        : createElement('div', {
            key: 'rooms',
            'data-room-list': true,
            style: { display: 'grid', gap: 6 },
            children: rooms.map(room => createElement('button', {
              key: room.id,
              type: 'button',
              'aria-pressed': selected?.id === room.id,
              onClick: () => setSelectedId(room.id),
              style: {
                padding: '10px 11px',
                border: `1px solid ${selected?.id === room.id ? color.accent : 'transparent'}`,
                borderRadius: 11,
                background: selected?.id === room.id ? color.subtle : 'transparent',
                color: color.text,
                textAlign: 'left',
                cursor: 'pointer',
              },
              children: [
                createElement('span', { key: 'name', style: { display: 'block', fontWeight: 650 }, children: room.name }),
                createElement('span', {
                  key: 'meta',
                  style: { display: 'block', marginTop: 3, color: color.muted, fontSize: 12 },
                  children: `${room.members.filter(member => member.status !== 'removed').length} members · ${room.status}`,
                }),
              ],
            })),
          }),
    ],
  })

  const memberRows = selected?.members.filter(member => member.status !== 'removed').map(member => {
    const roleHub = member.profile?.apiVersion === 'rolehub.dev/v1alpha1' && member.profile.kind === 'AgentRole'
    return createElement('div', {
      key: member.memberId,
      'data-room-member': member.memberId,
      style: {
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 10,
        padding: '10px 0',
        borderBottom: `1px solid ${color.border}`,
      },
      children: [
        createElement('span', {
          key: 'dot',
          role: 'img',
          title: member.status,
          'aria-label': `${member.name} status: ${member.status}`,
          style: { width: 8, height: 8, borderRadius: '50%', background: statusColor(member.status) },
        }),
        createElement('div', {
          key: 'profile',
          style: { minWidth: 0 },
          children: [
            createElement('div', {
              key: 'name',
              style: { display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600 },
              children: [
                member.name,
                roleHub ? createElement('span', {
                  key: 'rolehub',
                  style: {
                    padding: '2px 6px',
                    borderRadius: 999,
                    background: '#fff1d8',
                    color: '#875500',
                    fontSize: 10,
                    fontWeight: 700,
                  },
                  children: 'RoleHub',
                }) : null,
              ],
            }),
            createElement('div', {
              key: 'meta',
              style: { marginTop: 2, color: color.muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' },
              children: roleHub
                ? `${member.profile?.id}@${member.profile?.version} · ${shortId(member.connection.sessionId || member.memberId)}`
                : `${member.connection.protocol} · ${shortId(member.connection.sessionId || member.memberId)}`,
            }),
          ],
        }),
        createElement('div', {
          key: 'actions',
          style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 5 },
          children: [
            member.connection.sessionId ? createElement(Button, {
              key: 'open',
              variant: 'toolbar',
              size: 'sm',
              icon: createElement(IconLinkOutline16, { size: 14 }),
              'aria-label': `Open ${member.name}`,
              title: 'Open Session',
              onClick: () => openMemberSession(selected, member),
            }) : null,
            ownsSelected && member.kind === 'member' ? createElement(Button, {
              key: 'message',
              variant: 'toolbar',
              size: 'sm',
              icon: createElement(IconSendOutline16, { size: 14 }),
              'aria-label': `Message ${member.name}`,
              title: 'Send message',
              onClick: () => setDirectTarget(member.memberId),
            }) : null,
            ownsSelected && member.kind === 'member' ? createElement(Button, {
              key: 'remove',
              variant: 'toolbar',
              size: 'sm',
              icon: createElement(IconCloseOutline16, { size: 14 }),
              'aria-label': `Remove ${member.name}`,
              title: 'Remove member',
              disabled: busy,
              onClick: () => {
                setRiskAcknowledged(false)
                setPendingRisk({
                  kind: 'remove',
                  roomId: selected.id,
                  memberId: member.memberId,
                  memberName: member.name,
                })
              },
            }) : null,
          ],
        }),
      ],
    })
  })

  const detail = selected ? createElement('section', {
    style: { ...cardStyle, flex: '2 1 300px', minWidth: 0, padding: 16, overflow: 'auto' },
    children: [
      createElement('header', {
        key: 'header',
        style: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
        children: [
          createElement('div', {
            key: 'copy',
            children: [
              createElement('h3', { key: 'name', style: { margin: 0, fontSize: 18 }, children: selected.name }),
              createElement('p', {
                key: 'topic',
                style: { margin: '5px 0 0', color: color.muted, fontSize: 13 },
                children: selected.topic || 'A neutral Room for connected members and Sessions.',
              }),
            ],
          }),
          createElement(Button, {
            key: 'refresh',
            variant: 'toolbar',
            size: 'sm',
            icon: createElement(IconRefreshOutline16, { size: 14 }),
            'aria-label': 'Refresh Room',
            title: 'Refresh Room',
            disabled: loading,
            onClick: () => void refresh(),
          }),
        ],
      }),
      createElement('div', {
        key: 'members-head',
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
        children: [
          createElement('strong', { key: 'label', style: { fontSize: 13 }, children: 'Members' }),
          ownsSelected ? createElement(Button, {
            key: 'attach',
            variant: 'outline',
            size: 'sm',
            icon: createElement(IconPlusOutline16, { size: 14 }),
            'aria-expanded': attaching,
            'aria-controls': `room-attach-${selected.id}`,
            onClick: () => setAttaching(value => !value),
            children: 'Attach Session',
          }) : null,
        ],
      }),
      attaching && ownsSelected ? createElement('div', {
        key: 'attach-panel',
        id: `room-attach-${selected.id}`,
        'data-room-invite': true,
        style: { marginTop: 10, padding: 12, borderRadius: 12, background: color.subtle },
        children: [
          createElement('div', {
            key: 'providers',
            'data-room-invite-providers': true,
            style: { display: 'grid', gap: 8, marginBottom: 10 },
            children: renderInviteProviders({
              sessionId: sessionId ?? selected.leaderSessionId,
              roomId: selected.id,
              roomName: selected.name,
              disabled: busy,
              onAttached: () => { void refresh() },
            }),
          }),
          createElement('div', {
            key: 'title',
            style: { fontWeight: 650, fontSize: 13 },
            children: 'Existing continuable child Sessions',
          }),
          createElement('div', {
            key: 'help',
            style: { margin: '4px 0 10px', color: color.muted, fontSize: 12, lineHeight: 1.45 },
            children: 'Room never injects a role. A RoleHub bridge prepares and verifies a role Session before attaching it here.',
          }),
          continuableChildren.filter(child => child.kind === 'child' && !attachedSessions.has(child.id)).length === 0
            ? createElement('div', { key: 'empty', style: { color: color.muted, fontSize: 12 }, children: 'No unattached child Session is available.' })
            : continuableChildren.filter(child => child.kind === 'child' && !attachedSessions.has(child.id)).map(child => (
                child.kind === 'child' ? createElement('div', {
                  key: child.id,
                  style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 0' },
                  children: [
                    createElement('span', { key: 'label', style: { fontSize: 12 }, children: `${child.label} · ${shortId(child.id)}` }),
                    createElement(Button, {
                      key: 'attach',
                      variant: 'primary',
                      size: 'sm',
                      disabled: busy,
                      onClick: () => void attachSession(child.id, child.label).catch(() => undefined),
                      children: 'Attach',
                    }),
                  ],
                }) : null
              )),
        ],
      }) : null,
      createElement('div', { key: 'members', style: { marginTop: 5 }, children: memberRows }),
      directTarget && ownsSelected ? createElement('div', {
        key: 'direct',
        style: { display: 'flex', gap: 8, marginTop: 14 },
        children: [
          createElement(Input, {
            key: 'input',
            value: directText,
            'aria-label': 'Direct message',
            placeholder: 'Message this member…',
            onChange: event => setDirectText(event.currentTarget.value),
            style: { flex: 1 },
          }),
          createElement(Button, {
            key: 'send',
            variant: 'primary',
            disabled: busy || !directText.trim(),
            onClick: () => void runCommand(
              `/room send ${commandQuote(selected.id)} ${commandQuote(directTarget)} --message ${commandQuote(directText)}`,
            ).then(() => {
              setDirectText('')
              setDirectTarget(undefined)
            }).catch(() => undefined),
            children: 'Send',
          }),
        ],
      }) : null,
      ownsSelected ? createElement('div', {
        key: 'broadcast',
        style: { display: 'flex', gap: 8, marginTop: 14 },
        children: [
          createElement(Input, {
            key: 'input',
            value: broadcastText,
            'aria-label': 'Broadcast message',
            placeholder: 'Broadcast to every member…',
            onChange: event => setBroadcastText(event.currentTarget.value),
            style: { flex: 1 },
          }),
          createElement(Button, {
            key: 'send',
            variant: 'primary',
            icon: createElement(IconSendOutline16, { size: 14 }),
            'aria-label': 'Broadcast message',
            title: 'Broadcast message',
            disabled: busy || !broadcastText.trim() || selected.members.filter(member => member.kind === 'member' && member.status !== 'removed').length === 0,
            onClick: () => void runCommand(
              `/room broadcast ${commandQuote(selected.id)} --message ${commandQuote(broadcastText)}`,
            ).then(() => setBroadcastText('')).catch(() => undefined),
          }),
        ],
      }) : null,
      selected.status === 'open' && selected.leaderSessionId !== sessionId ? createElement('div', {
        key: 'owner-note',
        style: { marginTop: 14, padding: 10, borderRadius: 10, background: color.subtle, color: color.muted, fontSize: 12 },
        children: 'Membership is visible here. Open the leader Session to manage this Room.',
      }) : null,
      ownsSelected ? createElement('div', {
        key: 'danger',
        style: { display: 'flex', justifyContent: 'flex-end', marginTop: 18 },
        children: createElement(Button, {
          variant: 'ghost',
          size: 'sm',
          disabled: busy,
          style: { color: color.danger },
          onClick: () => {
            setRiskAcknowledged(false)
            setPendingRisk({ kind: 'close', roomId: selected.id, roomName: selected.name })
          },
          children: 'Close Room',
        }),
      }) : null,
    ],
  }) : createElement(Empty, { children: 'Select a Room or create a new one.' })

  const createForm = creating ? createElement('div', {
    style: { display: 'grid', gap: 10, padding: 12, marginBottom: 12, borderRadius: 12, background: color.subtle },
    children: [
      createElement(Input, {
        key: 'name',
        value: roomName,
        'aria-label': 'Room name',
        placeholder: 'Room name',
        autoFocus: true,
        onChange: event => setRoomName(event.currentTarget.value),
      }),
      createElement(Input, {
        key: 'topic',
        value: roomTopic,
        'aria-label': 'Room topic',
        placeholder: 'Topic (optional)',
        onChange: event => setRoomTopic(event.currentTarget.value),
      }),
      createElement('div', {
        key: 'actions',
        style: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
        children: [
          createElement(Button, { key: 'cancel', variant: 'ghost', onClick: () => setCreating(false), children: 'Cancel' }),
          createElement(Button, {
            key: 'create',
            variant: 'primary',
            disabled: busy || !roomName.trim(),
            onClick: () => void createRoom().catch(() => undefined),
            children: 'Create Room',
          }),
        ],
      }),
    ],
  }) : null

  return createElement('span', {
    children: [
      trigger,
      createElement(Modal, {
        key: 'modal',
        open,
        onClose: () => setOpen(false),
        title: 'Rooms',
        description: 'Connect independent Sessions through provider-backed members. Roles and policies stay external.',
        children: createElement('div', {
          style: { width: '100%', maxWidth: '100%' },
          children: [
            error ? createElement('div', {
              key: 'error',
              role: 'alert',
              style: { marginBottom: 10, padding: '9px 11px', borderRadius: 10, background: '#fff0f0', color: color.danger, fontSize: 12 },
              children: error,
            }) : null,
            createForm,
            createElement('div', { key: 'layout', style: layoutStyle, children: [roomList, detail] }),
          ],
        }),
      }),
      createElement(RiskConfirmation, {
        key: 'risk-confirmation',
        open: pendingRisk !== undefined,
        title: pendingRisk?.kind === 'remove' ? 'Remove Room member?' : 'Close this Room?',
        description: pendingRisk?.kind === 'remove'
          ? `This detaches ${pendingRisk.memberName} and asks its provider to interrupt active work. The backing Session or transport is not deleted.`
          : `This closes ${pendingRisk?.roomName ?? 'the Room'} and asks member providers to interrupt active work. A closed Room cannot be reopened.`,
        acknowledgeLabel: pendingRisk?.kind === 'remove'
          ? 'I understand this member will be detached.'
          : 'I understand this Room will be closed.',
        cancelLabel: 'Cancel',
        confirmLabel: pendingRisk?.kind === 'remove' ? 'Remove member' : 'Close Room',
        acknowledged: riskAcknowledged,
        disabled: busy,
        onAcknowledgedChange: setRiskAcknowledged,
        onCancel: cancelRisk,
        onConfirm: () => void confirmRisk().catch(() => undefined),
      }),
    ],
  })
}

/** Required DSH services: additive slots and the native Session runtime. */
export const inject = ['slots', 'sessions']

/** Register Room controls without replacing any DSH root, sidebar, conversation, or details surface. */
export function apply(ctx: ClientContext): void {
  const sessions = ctx.get('sessions') as unknown as ISessions

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: ROOM_HEADER_ENTRY_ID,
    order: 20,
    children: {
      [ROOM_INVITE_PROVIDER_SLOT]: { kind: 'list', scope: 'session' },
    },
  }, (props: RoomsHeaderHostProps) => {
    const sessionsState = props.useSessions(value => value)
    return createElement(RoomsLauncher, {
      sessionId: props.sessionId,
      sessions,
      sessionsState,
      location: 'header',
      renderInviteProviders: owner => props.renderSlot(ROOM_INVITE_PROVIDER_SLOT, owner),
    })
  }))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: ROOM_FOOTER_ENTRY_ID,
    order: 20,
    children: {
      [ROOM_INVITE_PROVIDER_SLOT]: { kind: 'list', scope: 'session' },
    },
  }, (props: RoomsFooterHostProps) => {
    const sessionsState = props.useSessions(value => value)
    return createElement(RoomsLauncher, {
      sessionId: sessionsState.current,
      sessions,
      sessionsState,
      wide: props.wide,
      location: 'footer',
      renderInviteProviders: owner => props.renderSlot(ROOM_INVITE_PROVIDER_SLOT, owner),
    })
  }))
}

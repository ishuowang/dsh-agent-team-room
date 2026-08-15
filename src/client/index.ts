/** Native DSH Web entry for the standalone Agent Team Room dashboard. */

import { createElement, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type { CommandUiContract, SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { ClientSessionContext } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { IconUserOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

export const ROOM_DASHBOARD_PATH = '/agent-team-room/'
export const ROOM_FOOTER_ENTRY_ID = 'dsh-agent-team-room'

/** Client-safe presentation copy; ids are parity-tested against the host registry. */
export const ROOM_TEMPLATE_OPTIONS = Object.freeze([
  { id: 'opc', label: 'One-Person Company', detail: 'Chief of Staff, finance, legal, operations, R&D, growth, and customer success', agentCount: 7 },
  { id: 'deep-research', label: 'Deep Research', detail: 'Parallel evidence gathering, source criticism, and cited synthesis', agentCount: 6 },
  { id: 'software-delivery', label: 'Software Delivery', detail: 'Plan, explore, implement, test, review, and ship', agentCount: 6 },
  { id: 'incident-response', label: 'Incident Response', detail: 'Triage, mitigate, investigate, communicate, and verify recovery', agentCount: 5 },
  { id: 'customer-support', label: 'Customer Support', detail: 'Triage and hand off account, billing, technical, and policy cases', agentCount: 5 },
  { id: 'content-campaign', label: 'Content Campaign', detail: 'Research, strategy, channel copy, editing, and distribution', agentCount: 6 },
  { id: 'plan-execute-review', label: 'Plan · Execute · Review', detail: 'A reusable planner, parallel workers, critic, and synthesizer loop', agentCount: 5 },
] as const)

export type RoomsFooterActionProps =
  PropsRuntime<'sidebar.footer.action'> & SidebarFooterActionOwnerProps

function linkStyle(wide: boolean, highlighted: boolean): CSSProperties {
  return {
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: wide ? 'flex-start' : 'center',
    gap: wide ? 8 : 0,
    width: wide ? 'calc(100% + 8px)' : 36,
    height: wide ? 34 : 36,
    margin: wide ? '4px -4px 0' : '8px 0 0',
    padding: wide ? '6px 10px' : 0,
    boxSizing: 'border-box',
    borderRadius: wide ? 12 : '50%',
    background: highlighted ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    fontFamily: 'inherit',
    fontSize: 14,
    lineHeight: '22px',
    textDecoration: 'none',
    cursor: 'pointer',
    overflow: 'hidden',
    transition: 'background-color 120ms var(--ds-ease-in-out)',
  }
}

/** Small, additive footer link that leaves the active conversation mounted. */
export function RoomsFooterAction({ wide }: RoomsFooterActionProps): ReactElement {
  const [highlighted, setHighlighted] = useState(false)
  const label = 'Open Agent Team Room'

  return createElement(Tooltip, {
    label,
    side: 'right',
    delayMs: 500,
    disabled: wide,
    children: createElement('a', {
      href: ROOM_DASHBOARD_PATH,
      target: '_blank',
      rel: 'noopener',
      'aria-label': label,
      style: linkStyle(wide, highlighted),
      onMouseEnter: () => { setHighlighted(true) },
      onMouseLeave: () => { setHighlighted(false) },
      onFocus: () => { setHighlighted(true) },
      onBlur: () => { setHighlighted(false) },
      children: [
        createElement('span', {
          key: 'icon',
          'aria-hidden': true,
          style: { display: 'inline-flex', flex: 'none' },
          children: createElement(IconUserOutline16, { size: wide ? 16 : 18 }),
        }),
        wide
          ? createElement('span', {
              key: 'label',
              style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
              children: 'Rooms',
            })
          : null,
      ],
    }),
  })
}

function templateOptions(): SelectOption[] {
  return ROOM_TEMPLATE_OPTIONS.map(option => ({
    id: option.id,
    label: option.label,
    detail: option.detail,
    confirmation: {
      title: `Create ${option.label} room?`,
      description:
        `This template immediately starts ${option.agentCount} independent Agent Sessions and can consume model quota.`,
      acknowledgeLabel: 'I understand that multiple Agents will start',
      cancelLabel: 'Cancel',
      confirmLabel: 'Create room',
    },
  }))
}

/** Required native services: additive slots and the official command popup surface. */
export const inject = ['slots', 'commandUi', 'sessions']

/** Register only into the sidebar's additive footer-action seat. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: ROOM_FOOTER_ENTRY_ID,
    order: 20,
  }, RoomsFooterAction))

  const command = ctx.get('commandUi') as CommandUiContract
  // Host and Client builds both merge Cordis Context in this package; resolve
  // the browser sessions face explicitly so the two compile-time faces stay isolated.
  const sessions = ctx.get('sessions') as unknown as ISessions
  const sessionFor = (session: ClientSessionContext) => sessions.binding(session.sessionId)?.session
  ctx.effect(() => command.decorate({
    name: 'room-template',
    available: session => sessionFor(session) !== undefined,
    ui: {
      kind: 'popupSelect',
      options: () => Promise.resolve(templateOptions()),
      onSelect: async (option, session) => {
        const live = sessionFor(session)
        if (live === undefined) throw new Error('this session is not materialized yet')
        const result = await live.command(`/room-template create ${option.id}`)
        if (!result.ok) throw new Error(`room template command failed: ${result.error.code}: ${result.error.message}`)
        if (!result.value.matched) throw new Error('the host offers no /room-template command')
      },
    },
  }), 'agent-team-room: /room-template native picker')
}

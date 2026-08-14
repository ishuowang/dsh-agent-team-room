/** Native DSH Web entry for the standalone Agent Team Room dashboard. */

import { createElement, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { IconUserOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

export const ROOM_DASHBOARD_PATH = '/agent-team-room/'
export const ROOM_FOOTER_ENTRY_ID = 'dsh-agent-team-room'

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

/** Required client service: the typed slot registry. */
export const inject = ['slots']

/** Register only into the sidebar's additive footer-action seat. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: ROOM_FOOTER_ENTRY_ID,
    order: 20,
  }, RoomsFooterAction))
}

/** Native DSH Web entry for the standalone Agent Team Room dashboard. */
import type { ReactElement } from 'react';
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client';
export declare const ROOM_DASHBOARD_PATH = "/agent-team-room/";
export declare const ROOM_FOOTER_ENTRY_ID = "dsh-agent-team-room";
export type RoomsFooterActionProps = PropsRuntime<'sidebar.footer.action'> & SidebarFooterActionOwnerProps;
/** Small, additive footer link that leaves the active conversation mounted. */
export declare function RoomsFooterAction({ wide }: RoomsFooterActionProps): ReactElement;
/** Required client service: the typed slot registry. */
export declare const inject: string[];
/** Register only into the sidebar's additive footer-action seat. */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map
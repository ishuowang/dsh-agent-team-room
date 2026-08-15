/** Native DSH Web entry for the standalone Agent Team Room dashboard. */
import type { ReactElement } from 'react';
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client';
export declare const ROOM_DASHBOARD_PATH = "/agent-team-room/";
export declare const ROOM_FOOTER_ENTRY_ID = "dsh-agent-team-room";
/** Client-safe presentation copy; ids are parity-tested against the host registry. */
export declare const ROOM_TEMPLATE_OPTIONS: readonly [{
    readonly id: "opc";
    readonly label: "One-Person Company";
    readonly detail: "Chief of Staff, finance, legal, operations, R&D, growth, and customer success";
    readonly agentCount: 7;
}, {
    readonly id: "deep-research";
    readonly label: "Deep Research";
    readonly detail: "Parallel evidence gathering, source criticism, and cited synthesis";
    readonly agentCount: 6;
}, {
    readonly id: "software-delivery";
    readonly label: "Software Delivery";
    readonly detail: "Plan, explore, implement, test, review, and ship";
    readonly agentCount: 6;
}, {
    readonly id: "incident-response";
    readonly label: "Incident Response";
    readonly detail: "Triage, mitigate, investigate, communicate, and verify recovery";
    readonly agentCount: 5;
}, {
    readonly id: "customer-support";
    readonly label: "Customer Support";
    readonly detail: "Triage and hand off account, billing, technical, and policy cases";
    readonly agentCount: 5;
}, {
    readonly id: "content-campaign";
    readonly label: "Content Campaign";
    readonly detail: "Research, strategy, channel copy, editing, and distribution";
    readonly agentCount: 6;
}, {
    readonly id: "plan-execute-review";
    readonly label: "Plan · Execute · Review";
    readonly detail: "A reusable planner, parallel workers, critic, and synthesizer loop";
    readonly agentCount: 5;
}];
export type RoomsFooterActionProps = PropsRuntime<'sidebar.footer.action'> & SidebarFooterActionOwnerProps;
/** Small, additive footer link that leaves the active conversation mounted. */
export declare function RoomsFooterAction({ wide }: RoomsFooterActionProps): ReactElement;
/** Required native services: additive slots and the official command popup surface. */
export declare const inject: string[];
/** Register only into the sidebar's additive footer-action seat. */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map
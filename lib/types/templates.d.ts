import type { Room, RoomMember } from './types.js';
export declare const ROOM_TEMPLATE_VERSION: 1;
export type RoomTemplateCategory = 'business' | 'research' | 'engineering' | 'operations' | 'support' | 'marketing' | 'general';
export type RoomTemplateOrchestration = 'hierarchical' | 'manager-parallel' | 'delivery-graph' | 'incident-command' | 'handoff' | 'pipeline-fanout' | 'plan-execute-review';
export interface RoomTemplateRole {
    id: string;
    name: string;
    role: string;
    systemPrompt: string;
}
/** Declarative recipe expanded once into an ordinary Room and child Sessions. */
export interface RoomTemplate {
    id: string;
    version: typeof ROOM_TEMPLATE_VERSION;
    name: string;
    description: string;
    defaultObjective: string;
    category: RoomTemplateCategory;
    orchestration: RoomTemplateOrchestration;
    experimental?: boolean;
    approvalGates: string[];
    roles: RoomTemplateRole[];
}
export interface CreateRoomFromTemplateInput {
    templateId: string;
    name?: string;
    objective?: string;
    provider?: string;
    modelProvider?: string;
    model?: string;
}
export interface RoomTemplateCreationFailure {
    roleId: string;
    name: string;
    error: string;
}
export interface RoomTemplateCreationResult {
    template: RoomTemplate;
    room: Room;
    members: RoomMember[];
    failures: RoomTemplateCreationFailure[];
}
/** Return detached copies in stable presentation order. */
export declare function listRoomTemplates(): RoomTemplate[];
/** Resolve one detached template or fail without mutating Room state. */
export declare function getRoomTemplate(templateId: string): RoomTemplate;
//# sourceMappingURL=templates.d.ts.map
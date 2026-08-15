/** Serializable room contracts shared by the host service, tools, and dashboard. */
export const ROOM_SCHEMA_VERSION = 1;
export function isTerminalTask(status) {
    return status === 'completed' || status === 'failed' || status === 'cancelled';
}
export function roomSummary(room) {
    return {
        id: room.id,
        name: room.name,
        objective: room.objective,
        status: room.status,
        revision: room.revision,
        memberCount: room.members.filter(member => member.status !== 'removed').length,
        activeMemberCount: room.members.filter(member => member.status === 'starting' || member.status === 'working').length,
        openTaskCount: room.tasks.filter(task => !isTerminalTask(task.status)).length,
        ...(room.template ? { template: structuredClone(room.template) } : {}),
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
    };
}
//# sourceMappingURL=types.js.map
/** Serializable Room contracts shared by the host, adapters, tools, and native UI. */
export const ROOM_SCHEMA_VERSION = 2;
export const DSH_SESSION_MEMBER_PROVIDER = 'dsh-session';
export const DSH_SESSION_MEMBER_PROTOCOL = 'dsh.session/v1';
export const ROLEHUB_ROLE_API_VERSION = 'rolehub.dev/v1alpha1';
export function roomSummary(room) {
    return {
        id: room.id,
        name: room.name,
        ...(room.topic ? { topic: room.topic } : {}),
        leaderSessionId: room.leaderSessionId,
        status: room.status,
        revision: room.revision,
        memberCount: room.members.filter(member => member.status !== 'removed').length,
        activeMemberCount: room.members.filter(member => member.status === 'working').length,
        roleHubMemberCount: room.members.filter(member => (member.status !== 'removed'
            && member.profile?.apiVersion === ROLEHUB_ROLE_API_VERSION
            && member.profile.kind === 'AgentRole')).length,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
    };
}
//# sourceMappingURL=types.js.map
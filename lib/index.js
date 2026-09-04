import { randomUUID } from 'node:crypto';
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { SessionId } from '@deepseek-ai/dsh-session';
import { RoomStorage } from './storage.js';
import { DSH_SESSION_MEMBER_PROTOCOL, DSH_SESSION_MEMBER_PROVIDER, ROLEHUB_ROLE_API_VERSION, ROOM_SCHEMA_VERSION, roomSummary, } from './types.js';
export * from './types.js';
export * from './member-provider.js';
export { RoomStorage, defaultStorageFile } from './storage.js';
export const Config = z.object({
    storageFile: z.string().default(''),
    maxMembersPerRoom: z.natural().min(2).max(128).default(16),
    maxMessageChars: z.natural().min(256).max(1_000_000).default(20_000),
    maxEventsPerRoom: z.natural().min(100).max(100_000).default(10_000),
});
function now() {
    return new Date().toISOString();
}
function cleanText(value, field, maximum) {
    const text = value.trim();
    if (text.length === 0)
        throw new Error(`agent-team-room: ${field} cannot be empty`);
    if (text.length > maximum)
        throw new Error(`agent-team-room: ${field} exceeds ${maximum} characters`);
    return text;
}
function sessionMessageId(member, deliveryId) {
    return member.connection.providerId === DSH_SESSION_MEMBER_PROVIDER
        && member.connection.protocol === DSH_SESSION_MEMBER_PROTOCOL
        ? cleanText(deliveryId, 'DSH Session MessageId', 240)
        : undefined;
}
function cleanOptionalText(value, field, maximum) {
    if (value === undefined || value.trim().length === 0)
        return undefined;
    return cleanText(value, field, maximum);
}
function jsonRecord(value, field) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`agent-team-room: ${field} must be a JSON object`);
    }
    return value;
}
function dshSessionDescriptor(value) {
    const record = jsonRecord(value, 'dsh-session descriptor');
    const sessionId = record['sessionId'];
    if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
        throw new Error('agent-team-room: dsh-session descriptor requires sessionId');
    }
    return { sessionId: sessionId.trim() };
}
function validatedProfile(profile) {
    if (profile === undefined)
        return undefined;
    const apiVersion = cleanText(profile.apiVersion, 'member profile apiVersion', 120);
    const kind = cleanText(profile.kind, 'member profile kind', 120);
    const id = cleanText(profile.id, 'member profile id', 240);
    const version = cleanOptionalText(profile.version, 'member profile version', 120);
    const digest = cleanOptionalText(profile.digest, 'member profile digest', 160);
    if (apiVersion === ROLEHUB_ROLE_API_VERSION) {
        if (kind !== 'AgentRole' || version === undefined || digest === undefined) {
            throw new Error('agent-team-room: RoleHub profile requires kind AgentRole, version, and digest');
        }
        if (!/^sha256:[a-f0-9]{64}$/u.test(digest)) {
            throw new Error('agent-team-room: RoleHub digest must be sha256 followed by 64 lowercase hex characters');
        }
    }
    return { apiVersion, kind, id, ...(version ? { version } : {}), ...(digest ? { digest } : {}) };
}
/** Thin durable Room coordinator exposed as ctx.rooms. */
export default class RoomRuntime extends Service {
    config;
    static inject = ['subagents'];
    static Config = Config;
    storage;
    roomsById = new Map();
    providers = new Map();
    reservations = new Map();
    busyRooms = new Set();
    listeners = new Set();
    persistQueue = Promise.resolve();
    constructor(ctx, config) {
        super(ctx, 'rooms');
        this.config = config;
        this.storage = new RoomStorage(config.storageFile);
        this.providers.set(DSH_SESSION_MEMBER_PROVIDER, this.dshSessionProvider());
        ctx.on('subagent/start', (info) => this.onSubagentStart(info));
        ctx.on('subagent/end', (info) => this.onSubagentEnd(info));
    }
    async [Service.init]() {
        const loaded = await this.storage.load();
        for (const room of loaded)
            this.roomsById.set(room.id, room);
        const recovered = this.recoverInterruptedState();
        const trimmed = this.trimLoadedEvents();
        if (recovered || trimmed || this.storage.migrated)
            await this.persist();
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    /** Register one trusted Host-side member transport. Duplicate ids fail closed. */
    registerMemberProvider(provider) {
        const id = cleanText(provider.id, 'member provider id', 120);
        if (this.providers.has(id))
            throw new Error(`agent-team-room: member provider ${id} is already registered`);
        this.providers.set(id, provider);
        let active = true;
        return () => {
            if (!active)
                return;
            active = false;
            if (this.providers.get(id) === provider)
                this.providers.delete(id);
        };
    }
    listMemberProviders() {
        return [...this.providers.keys()].sort((left, right) => left.localeCompare(right, 'en'));
    }
    async createRoom(parent, input) {
        const createdAt = now();
        const leaderMemberId = randomUUID();
        const topic = cleanOptionalText(input.topic, 'topic', this.config.maxMessageChars);
        const room = {
            schemaVersion: ROOM_SCHEMA_VERSION,
            id: randomUUID(),
            name: cleanText(input.name, 'name', 120),
            ...(topic ? { topic } : {}),
            leaderSessionId: parent.id,
            status: 'open',
            revision: 0,
            createdAt,
            updatedAt: createdAt,
            members: [{
                    memberId: leaderMemberId,
                    kind: 'leader',
                    name: 'Leader',
                    connection: {
                        providerId: DSH_SESSION_MEMBER_PROVIDER,
                        protocol: DSH_SESSION_MEMBER_PROTOCOL,
                        address: { sessionId: parent.id },
                        sessionId: parent.id,
                    },
                    status: 'leader',
                    joinedAt: createdAt,
                    updatedAt: createdAt,
                }],
            events: [],
        };
        this.appendEvent(room, 'room.created', `Room created: ${room.name}`, { actorMemberId: leaderMemberId });
        this.roomsById.set(room.id, room);
        try {
            await this.changed(room);
        }
        catch (error) {
            this.roomsById.delete(room.id);
            throw error;
        }
        return this.copy(room);
    }
    listRooms(parent, includeClosed = false) {
        return [...this.roomsById.values()]
            .filter(room => room.leaderSessionId === parent.id && (includeClosed || room.status === 'open'))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map(roomSummary);
    }
    /** Read-only native UI projection for rooms in which one Session participates. */
    listRoomsForSession(sessionId, includeClosed = true) {
        return [...this.roomsById.values()]
            .filter(room => ((includeClosed || room.status === 'open')
            && room.members.some(member => member.status !== 'removed' && member.connection.sessionId === sessionId)))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map(room => this.copy(room));
    }
    getRoom(parent, roomId) {
        return this.copy(this.ownedRoom(parent, roomId));
    }
    roomHistory(parent, roomId, limit = 100) {
        const room = this.ownedRoom(parent, roomId);
        const count = Math.max(1, Math.min(Math.trunc(limit), 1000));
        return structuredClone(room.events.slice(-count));
    }
    /**
     * Prepare and commit one provider-backed member. Capacity is reserved before
     * the provider runs, so concurrent invitations cannot orphan extra Sessions.
     */
    async attachMember(parent, roomId, input, signal) {
        const providerId = cleanText(input.providerId, 'member provider id', 120);
        const provider = this.providers.get(providerId);
        if (!provider)
            throw new Error(`agent-team-room: member provider ${providerId} is unavailable`);
        const initialRoom = this.openOwnedRoom(parent, roomId);
        this.reserve(initialRoom);
        let attachment;
        try {
            signal.throwIfAborted();
            attachment = await provider.attach({
                parent,
                room: this.copy(initialRoom),
                descriptor: structuredClone(input.descriptor),
                ...(input.name?.trim() ? { requestedName: input.name.trim() } : {}),
                ...(input.profile ? { requestedProfile: structuredClone(input.profile) } : {}),
                signal,
            });
            signal.throwIfAborted();
            const room = this.openOwnedRoom(parent, roomId);
            const sessionId = attachment.connection.sessionId?.trim();
            if (sessionId && room.members.some(member => (member.status !== 'removed' && member.connection.sessionId === sessionId))) {
                throw new Error(`agent-team-room: Session ${sessionId} is already in room ${roomId}`);
            }
            const timestamp = now();
            const profile = validatedProfile(attachment.profile ?? input.profile);
            const beforeCommit = this.copy(room);
            const member = {
                memberId: randomUUID(),
                kind: 'member',
                name: cleanText(input.name || attachment.name, 'member name', 120),
                connection: {
                    providerId,
                    protocol: cleanText(attachment.connection.protocol, 'member protocol', 120),
                    address: structuredClone(attachment.connection.address),
                    ...(sessionId ? { sessionId } : {}),
                },
                ...(profile ? { profile } : {}),
                status: attachment.initialStatus ?? 'idle',
                joinedAt: timestamp,
                updatedAt: timestamp,
            };
            room.members.push(member);
            this.appendEvent(room, 'member.joined', `${member.name} joined`, {
                actorMemberId: this.leader(room).memberId,
                targetMemberId: member.memberId,
            });
            try {
                await this.changed(room);
            }
            catch (error) {
                this.roomsById.set(room.id, beforeCommit);
                throw error;
            }
            attachment = undefined;
            return structuredClone(member);
        }
        catch (error) {
            if (attachment?.rollback) {
                try {
                    await attachment.rollback();
                }
                catch (rollbackError) {
                    throw new AggregateError([error, rollbackError], 'agent-team-room: member attach and rollback both failed');
                }
            }
            throw error;
        }
        finally {
            this.releaseReservation(roomId);
        }
    }
    async attachSession(parent, roomId, input, signal) {
        return this.attachMember(parent, roomId, {
            providerId: DSH_SESSION_MEMBER_PROVIDER,
            descriptor: { sessionId: input.sessionId },
            ...(input.name ? { name: input.name } : {}),
            ...(input.profile ? { profile: input.profile } : {}),
        }, signal);
    }
    async sendMessage(parent, roomId, targetMemberId, message, signal) {
        const initialRoom = this.acquireRoomOperation(parent, roomId);
        try {
            const initialMember = this.activeMember(initialRoom, targetMemberId);
            const provider = this.requiredProvider(initialMember.connection.providerId);
            const text = cleanText(message, 'message', this.config.maxMessageChars);
            const relay = { id: randomUUID(), mode: 'direct' };
            const delivered = await provider.deliver({
                parent,
                room: this.copy(initialRoom),
                member: structuredClone(initialMember),
                message: text,
                relay,
                signal,
            });
            const deliveryId = delivered.deliveryId;
            const room = this.openOwnedRoom(parent, roomId);
            const member = this.activeMember(room, targetMemberId);
            const persistedMessageId = sessionMessageId(member, deliveryId);
            member.status = 'working';
            member.updatedAt = now();
            this.appendEvent(room, 'message.direct', `Message delivered to ${member.name}`, {
                actorMemberId: this.leader(room).memberId,
                targetMemberId: member.memberId,
                relay: {
                    ...relay,
                    deliveries: [{
                            memberId: member.memberId,
                            status: 'accepted',
                            ...(persistedMessageId ? { sessionMessageId: persistedMessageId } : {}),
                        }],
                },
            });
            await this.changed(room);
            return { deliveryId };
        }
        finally {
            this.releaseRoomOperation(roomId);
        }
    }
    async broadcast(parent, roomId, message, signal) {
        const initialRoom = this.acquireRoomOperation(parent, roomId);
        try {
            const text = cleanText(message, 'message', this.config.maxMessageChars);
            const members = initialRoom.members.filter(member => member.kind === 'member' && member.status !== 'removed');
            if (members.length === 0)
                throw new Error('agent-team-room: room has no active members');
            const relay = { id: randomUUID(), mode: 'broadcast' };
            const deliveries = await Promise.all(members.map(async (member) => {
                try {
                    const provider = this.requiredProvider(member.connection.providerId);
                    const delivered = await provider.deliver({
                        parent,
                        room: this.copy(initialRoom),
                        member: structuredClone(member),
                        message: text,
                        relay,
                        signal,
                    });
                    return {
                        memberId: member.memberId,
                        deliveryId: delivered.deliveryId,
                    };
                }
                catch (error) {
                    return { memberId: member.memberId, error: error instanceof Error ? error.message : String(error) };
                }
            }));
            const room = this.openOwnedRoom(parent, roomId);
            for (const delivery of deliveries) {
                const member = this.activeMember(room, delivery.memberId);
                member.status = 'error' in delivery ? 'error' : 'working';
                member.updatedAt = now();
            }
            this.appendEvent(room, 'message.broadcast', `Broadcast attempted for ${members.length} member(s)`, {
                actorMemberId: this.leader(room).memberId,
                relay: {
                    ...relay,
                    deliveries: deliveries.map((delivery) => {
                        if ('error' in delivery)
                            return { memberId: delivery.memberId, status: 'failed' };
                        const member = this.activeMember(room, delivery.memberId);
                        const persistedMessageId = sessionMessageId(member, delivery.deliveryId);
                        return {
                            memberId: delivery.memberId,
                            status: 'accepted',
                            ...(persistedMessageId ? { sessionMessageId: persistedMessageId } : {}),
                        };
                    }),
                },
            });
            await this.changed(room);
            return structuredClone(deliveries);
        }
        finally {
            this.releaseRoomOperation(roomId);
        }
    }
    async removeMember(parent, roomId, memberId, interruptRunning = true) {
        const room = this.acquireRoomOperation(parent, roomId);
        try {
            const member = this.activeMember(room, memberId);
            const provider = this.providers.get(member.connection.providerId);
            const providerRoom = this.copy(room);
            const providerMember = structuredClone(member);
            member.status = 'removed';
            member.updatedAt = now();
            this.appendEvent(room, 'member.left', `${member.name} detached`, {
                actorMemberId: this.leader(room).memberId,
                targetMemberId: member.memberId,
            });
            await this.changed(room);
            if (interruptRunning && provider?.interrupt) {
                try {
                    await provider.interrupt({ parent, room: providerRoom, member: providerMember });
                }
                catch {
                    // Detachment is authoritative. Provider errors are not persisted because
                    // they may contain transport URLs, credentials, or other private detail.
                }
            }
            return structuredClone(member);
        }
        finally {
            this.releaseRoomOperation(roomId);
        }
    }
    async closeRoom(parent, roomId, input) {
        const room = this.acquireRoomOperation(parent, roomId);
        try {
            const summary = cleanOptionalText(input.summary, 'summary', this.config.maxMessageChars);
            const shouldInterrupt = input.interruptRunning !== false;
            const providerRoom = this.copy(room);
            const interrupts = [];
            for (const member of room.members) {
                if (member.kind !== 'member' || member.status === 'removed')
                    continue;
                const provider = this.providers.get(member.connection.providerId);
                if (shouldInterrupt && provider?.interrupt) {
                    interrupts.push({
                        memberId: member.memberId,
                        interrupt: provider.interrupt.bind(provider),
                        member: structuredClone(member),
                    });
                    member.status = 'interrupted';
                }
                else if (member.status === 'working') {
                    member.status = 'idle';
                }
                member.updatedAt = now();
            }
            room.status = 'closed';
            room.closedAt = now();
            if (summary)
                room.summary = summary;
            this.appendEvent(room, 'room.closed', room.summary || 'Room closed', {
                actorMemberId: this.leader(room).memberId,
            });
            await this.changed(room);
            let providerStatusChanged = false;
            for (const target of interrupts) {
                try {
                    await target.interrupt({ parent, room: providerRoom, member: target.member });
                }
                catch {
                    const current = room.members.find(member => member.memberId === target.memberId);
                    if (current && current.status !== 'removed') {
                        current.status = 'error';
                        current.updatedAt = now();
                        providerStatusChanged = true;
                    }
                }
            }
            if (providerStatusChanged)
                await this.changed(room);
            return this.copy(room);
        }
        finally {
            this.releaseRoomOperation(roomId);
        }
    }
    dshSessionProvider() {
        return {
            id: DSH_SESSION_MEMBER_PROVIDER,
            attach: async ({ parent, descriptor, requestedName, requestedProfile, signal }) => {
                const { sessionId } = dshSessionDescriptor(descriptor);
                const children = await this.ctx.subagents.listChildren(SessionId(parent.id), signal);
                const child = children.find(candidate => candidate.kind === 'child' && candidate.id === sessionId);
                if (!child || child.kind !== 'child' || child.mode !== 'continuable') {
                    throw new Error(`agent-team-room: ${sessionId} is not a continuable direct child of this leader`);
                }
                const profile = validatedProfile(requestedProfile);
                return {
                    name: requestedName?.trim() || child.label,
                    connection: {
                        protocol: DSH_SESSION_MEMBER_PROTOCOL,
                        address: { sessionId },
                        sessionId,
                    },
                    ...(profile ? { profile } : {}),
                    initialStatus: child.activity === 'running' ? 'working' : 'idle',
                };
            },
            deliver: async ({ parent, room, member, message, relay, signal }) => {
                const { sessionId } = dshSessionDescriptor(member.connection.address);
                const deliveryId = await this.ctx.subagents.followup(parent, SessionId(sessionId), [{ type: 'text', text: message }], {
                    source: {
                        kind: 'agent-team-room',
                        form: 'relay',
                        senderSessionId: parent.id,
                        roomId: room.id,
                        memberId: member.memberId,
                        relayId: relay.id,
                        mode: relay.mode,
                    },
                    signal,
                });
                return { deliveryId };
            },
            interrupt: ({ parent, member }) => {
                const { sessionId } = dshSessionDescriptor(member.connection.address);
                this.ctx.subagents.interrupt(SessionId(sessionId), { kind: 'ancestor', agent: parent });
            },
        };
    }
    requiredProvider(providerId) {
        const provider = this.providers.get(providerId);
        if (!provider)
            throw new Error(`agent-team-room: member provider ${providerId} is unavailable`);
        return provider;
    }
    room(roomId) {
        const room = this.roomsById.get(roomId);
        if (!room)
            throw new Error(`agent-team-room: unknown room ${roomId}`);
        return room;
    }
    ownedRoom(parent, roomId) {
        const room = this.room(roomId);
        if (room.leaderSessionId !== parent.id)
            throw new Error(`agent-team-room: caller does not lead room ${roomId}`);
        return room;
    }
    openOwnedRoom(parent, roomId) {
        const room = this.ownedRoom(parent, roomId);
        if (room.status !== 'open')
            throw new Error(`agent-team-room: room ${roomId} is closed`);
        return room;
    }
    leader(room) {
        const member = room.members.find(candidate => candidate.kind === 'leader');
        if (!member)
            throw new Error(`agent-team-room: room ${room.id} has no leader member`);
        return member;
    }
    activeMember(room, memberId) {
        const member = room.members.find(candidate => candidate.memberId === memberId && candidate.kind === 'member');
        if (!member || member.status === 'removed') {
            throw new Error(`agent-team-room: member ${memberId} is not active in room ${room.id}`);
        }
        return member;
    }
    acquireRoomOperation(parent, roomId) {
        const room = this.openOwnedRoom(parent, roomId);
        if (this.busyRooms.has(roomId)) {
            throw new Error(`agent-team-room: room ${roomId} has another mutation in progress`);
        }
        this.busyRooms.add(roomId);
        return room;
    }
    releaseRoomOperation(roomId) {
        this.busyRooms.delete(roomId);
    }
    reserve(room) {
        const active = room.members.filter(member => member.status !== 'removed').length;
        const reserved = this.reservations.get(room.id) ?? 0;
        if (active + reserved >= this.config.maxMembersPerRoom) {
            throw new Error(`agent-team-room: room member limit ${this.config.maxMembersPerRoom} reached`);
        }
        this.reservations.set(room.id, reserved + 1);
    }
    releaseReservation(roomId) {
        const reserved = this.reservations.get(roomId) ?? 0;
        if (reserved <= 1)
            this.reservations.delete(roomId);
        else
            this.reservations.set(roomId, reserved - 1);
    }
    appendEvent(room, type, message, detail = {}) {
        const timestamp = now();
        room.events.push({ id: randomUUID(), type, at: timestamp, message, ...detail });
        const overflow = room.events.length - this.config.maxEventsPerRoom;
        if (overflow > 0)
            room.events.splice(0, overflow);
        room.revision += 1;
        room.updatedAt = timestamp;
    }
    copy(room) {
        return structuredClone(room);
    }
    async changed(room) {
        await this.persist();
        this.notify(room.id);
    }
    notify(roomId) {
        for (const listener of this.listeners) {
            try {
                listener(roomId);
            }
            catch {
                // Observers cannot roll back a Room mutation that is already durable.
            }
        }
    }
    persist() {
        const snapshot = structuredClone([...this.roomsById.values()]);
        this.persistQueue = this.persistQueue.catch(() => undefined).then(() => this.storage.save(snapshot));
        return this.persistQueue;
    }
    recoverInterruptedState() {
        let changed = false;
        for (const room of this.roomsById.values()) {
            if (room.status !== 'open')
                continue;
            let roomChanged = false;
            for (const member of room.members) {
                if (member.kind !== 'member' || member.status !== 'working')
                    continue;
                member.status = 'idle';
                member.updatedAt = now();
                roomChanged = true;
            }
            if (roomChanged) {
                this.appendEvent(room, 'system.recovered', 'Recovered member state after Harness restart');
                changed = true;
            }
        }
        return changed;
    }
    trimLoadedEvents() {
        let changed = false;
        for (const room of this.roomsById.values()) {
            const overflow = room.events.length - this.config.maxEventsPerRoom;
            if (overflow <= 0)
                continue;
            room.events.splice(0, overflow);
            changed = true;
        }
        return changed;
    }
    async onSubagentStart(info) {
        await this.updateDshMemberLifecycle(info.id, 'working', 'started a turn');
    }
    async onSubagentEnd(info) {
        const status = info.stopReason === 'completed' ? 'idle' : 'error';
        await this.updateDshMemberLifecycle(info.id, status, `finished a turn (${info.stopReason || 'unknown'})`);
    }
    async updateDshMemberLifecycle(sessionId, status, action) {
        const touched = [];
        for (const room of this.roomsById.values()) {
            if (room.status !== 'open')
                continue;
            const member = room.members.find(candidate => (candidate.kind === 'member'
                && candidate.status !== 'removed'
                && candidate.connection.providerId === DSH_SESSION_MEMBER_PROVIDER
                && candidate.connection.sessionId === sessionId));
            if (!member)
                continue;
            member.status = status;
            member.updatedAt = now();
            this.appendEvent(room, status === 'working' ? 'member.started' : 'member.settled', `${member.name} ${action}`, {
                targetMemberId: member.memberId,
            });
            touched.push(room);
        }
        if (touched.length === 0)
            return;
        await this.persist();
        for (const room of touched)
            this.notify(room.id);
    }
}
//# sourceMappingURL=index.js.map
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { DSH_SESSION_MEMBER_PROTOCOL, DSH_SESSION_MEMBER_PROVIDER, ROOM_SCHEMA_VERSION, } from './types.js';
export function defaultStorageFile() {
    const dshHome = process.env.DSH_HOME?.trim();
    const root = dshHome && dshHome.length > 0 ? resolve(dshHome) : join(homedir(), '.dsh');
    return join(root, 'agent-team-room', 'rooms.json');
}
function record(value, field) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`agent-team-room: ${field} is not an object`);
    }
    return value;
}
function string(value, field) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`agent-team-room: ${field} is not a non-empty string`);
    }
    return value;
}
function optionalString(value, field) {
    if (value === undefined)
        return undefined;
    return string(value, field);
}
function boundedOptionalString(value, field, maximum) {
    const result = optionalString(value, field);
    if (result !== undefined && result.length > maximum) {
        throw new Error(`agent-team-room: ${field} exceeds ${maximum} characters`);
    }
    return result;
}
function assertMember(value, roomIndex, memberIndex) {
    const member = record(value, `stored room ${roomIndex} member ${memberIndex}`);
    string(member['memberId'], `stored room ${roomIndex} member ${memberIndex} memberId`);
    if (member['kind'] !== 'leader' && member['kind'] !== 'member') {
        throw new Error(`agent-team-room: stored room ${roomIndex} member ${memberIndex} has an unsupported kind`);
    }
    string(member['name'], `stored room ${roomIndex} member ${memberIndex} name`);
    const connection = record(member['connection'], `stored room ${roomIndex} member ${memberIndex} connection`);
    string(connection['providerId'], `stored room ${roomIndex} member ${memberIndex} providerId`);
    string(connection['protocol'], `stored room ${roomIndex} member ${memberIndex} protocol`);
    if (connection['address'] === undefined) {
        throw new Error(`agent-team-room: stored room ${roomIndex} member ${memberIndex} has no address`);
    }
    optionalString(connection['sessionId'], `stored room ${roomIndex} member ${memberIndex} sessionId`);
    if (!['leader', 'working', 'idle', 'interrupted', 'error', 'removed'].includes(String(member['status']))) {
        throw new Error(`agent-team-room: stored room ${roomIndex} member ${memberIndex} has an unsupported status`);
    }
    if (member['profile'] !== undefined) {
        const profile = record(member['profile'], `stored room ${roomIndex} member ${memberIndex} profile`);
        string(profile['apiVersion'], `stored room ${roomIndex} member ${memberIndex} profile apiVersion`);
        string(profile['kind'], `stored room ${roomIndex} member ${memberIndex} profile kind`);
        string(profile['id'], `stored room ${roomIndex} member ${memberIndex} profile id`);
        const version = optionalString(profile['version'], `stored room ${roomIndex} member ${memberIndex} profile version`);
        const digest = optionalString(profile['digest'], `stored room ${roomIndex} member ${memberIndex} profile digest`);
        if (profile['apiVersion'] === 'rolehub.dev/v1alpha1') {
            if (profile['kind'] !== 'AgentRole' || version === undefined || digest === undefined
                || !/^sha256:[a-f0-9]{64}$/u.test(digest)) {
                throw new Error(`agent-team-room: stored room ${roomIndex} member ${memberIndex} has an invalid RoleHub profile`);
            }
        }
    }
}
function assertEvent(value, roomIndex, eventIndex) {
    const event = record(value, `stored room ${roomIndex} event ${eventIndex}`);
    string(event['id'], `stored room ${roomIndex} event ${eventIndex} id`);
    if (![
        'room.created',
        'room.closed',
        'member.joined',
        'member.left',
        'member.started',
        'member.settled',
        'message.direct',
        'message.broadcast',
        'system.recovered',
        'system.migrated',
    ].includes(String(event['type']))) {
        throw new Error(`agent-team-room: stored room ${roomIndex} event ${eventIndex} has an unsupported type`);
    }
    string(event['at'], `stored room ${roomIndex} event ${eventIndex} at`);
    string(event['message'], `stored room ${roomIndex} event ${eventIndex} message`);
    optionalString(event['actorMemberId'], `stored room ${roomIndex} event ${eventIndex} actorMemberId`);
    optionalString(event['targetMemberId'], `stored room ${roomIndex} event ${eventIndex} targetMemberId`);
    if (event['relay'] === undefined)
        return;
    if (event['type'] !== 'message.direct' && event['type'] !== 'message.broadcast') {
        throw new Error(`agent-team-room: stored room ${roomIndex} event ${eventIndex} has relay metadata on a non-message event`);
    }
    const relay = record(event['relay'], `stored room ${roomIndex} event ${eventIndex} relay`);
    string(relay['id'], `stored room ${roomIndex} event ${eventIndex} relay id`);
    if (relay['mode'] !== 'direct' && relay['mode'] !== 'broadcast') {
        throw new Error(`agent-team-room: stored room ${roomIndex} event ${eventIndex} relay has an unsupported mode`);
    }
    if ((event['type'] === 'message.direct') !== (relay['mode'] === 'direct')) {
        throw new Error(`agent-team-room: stored room ${roomIndex} event ${eventIndex} relay mode does not match its event type`);
    }
    if (!Array.isArray(relay['deliveries']) || relay['deliveries'].length === 0) {
        throw new Error(`agent-team-room: stored room ${roomIndex} event ${eventIndex} relay has no deliveries`);
    }
    if (relay['mode'] === 'direct' && relay['deliveries'].length !== 1) {
        throw new Error(`agent-team-room: stored room ${roomIndex} event ${eventIndex} direct relay has multiple deliveries`);
    }
    const memberIds = new Set();
    relay['deliveries'].forEach((candidate, deliveryIndex) => {
        const delivery = record(candidate, `stored room ${roomIndex} event ${eventIndex} relay delivery ${deliveryIndex}`);
        const memberId = string(delivery['memberId'], `stored room ${roomIndex} event ${eventIndex} relay delivery ${deliveryIndex} memberId`);
        if (memberIds.has(memberId)) {
            throw new Error(`agent-team-room: stored room ${roomIndex} event ${eventIndex} relay repeats member ${memberId}`);
        }
        memberIds.add(memberId);
        if (delivery['status'] !== 'accepted' && delivery['status'] !== 'failed') {
            throw new Error(`agent-team-room: stored room ${roomIndex} event ${eventIndex} relay delivery ${deliveryIndex} has an unsupported status`);
        }
        if ('deliveryId' in delivery) {
            throw new Error(`agent-team-room: stored room ${roomIndex} event ${eventIndex} relay delivery ${deliveryIndex} contains a provider deliveryId`);
        }
        const sessionMessageId = boundedOptionalString(delivery['sessionMessageId'], `stored room ${roomIndex} event ${eventIndex} relay delivery ${deliveryIndex} sessionMessageId`, 240);
        if (delivery['status'] === 'failed' && sessionMessageId !== undefined) {
            throw new Error(`agent-team-room: stored room ${roomIndex} event ${eventIndex} failed relay delivery ${deliveryIndex} contains a Session MessageId`);
        }
    });
}
function assertRoom(value, index) {
    const room = record(value, `stored room ${index}`);
    if (room['schemaVersion'] !== ROOM_SCHEMA_VERSION) {
        throw new Error(`agent-team-room: stored room ${index} has an unsupported schema`);
    }
    string(room['id'], `stored room ${index} id`);
    string(room['name'], `stored room ${index} name`);
    string(room['leaderSessionId'], `stored room ${index} leaderSessionId`);
    if (room['status'] !== 'open' && room['status'] !== 'closed') {
        throw new Error(`agent-team-room: stored room ${index} has an unsupported status`);
    }
    if (!Array.isArray(room['members']) || !Array.isArray(room['events'])) {
        throw new Error(`agent-team-room: stored room ${index} is missing collections`);
    }
    room['members'].forEach((member, memberIndex) => assertMember(member, index, memberIndex));
    room['events'].forEach((event, eventIndex) => assertEvent(event, index, eventIndex));
    if (!room['members'].some(member => record(member, 'stored member')['kind'] === 'leader')) {
        throw new Error(`agent-team-room: stored room ${index} has no leader`);
    }
    const membersById = new Map(room['members'].map((candidate) => {
        const member = record(candidate, `stored room ${index} member`);
        return [String(member['memberId']), member];
    }));
    room['events'].forEach((candidate, eventIndex) => {
        const event = record(candidate, `stored room ${index} event ${eventIndex}`);
        if (event['relay'] === undefined)
            return;
        const relay = record(event['relay'], `stored room ${index} event ${eventIndex} relay`);
        for (const [deliveryIndex, candidateDelivery] of relay['deliveries'].entries()) {
            const delivery = record(candidateDelivery, `stored room ${index} event ${eventIndex} relay delivery ${deliveryIndex}`);
            const member = membersById.get(String(delivery['memberId']));
            if (!member) {
                throw new Error(`agent-team-room: stored room ${index} event ${eventIndex} references an unknown member`);
            }
            if (delivery['status'] !== 'accepted')
                continue;
            const connection = record(member['connection'], `stored room ${index} member connection`);
            const builtInSession = connection['providerId'] === DSH_SESSION_MEMBER_PROVIDER
                && connection['protocol'] === DSH_SESSION_MEMBER_PROTOCOL;
            if (builtInSession && delivery['sessionMessageId'] === undefined) {
                throw new Error(`agent-team-room: stored room ${index} event ${eventIndex} accepted DSH delivery has no Session MessageId`);
            }
            if (!builtInSession && delivery['sessionMessageId'] !== undefined) {
                throw new Error(`agent-team-room: stored room ${index} event ${eventIndex} exposes a Session MessageId for an external provider`);
            }
        }
    });
}
function legacyEventType(value) {
    switch (value) {
        case 'room.created':
        case 'room.closed':
        case 'member.joined':
        case 'member.left':
        case 'member.started':
        case 'member.settled':
        case 'system.recovered':
            return value;
        case 'message.direct':
        case 'message.broadcast':
            return value;
        default:
            return 'system.migrated';
    }
}
function migrateV1Room(value, index) {
    const legacy = record(value, `stored room ${index}`);
    if (legacy['schemaVersion'] !== 1) {
        throw new Error(`agent-team-room: stored room ${index} has an unsupported schema`);
    }
    const id = string(legacy['id'], `stored room ${index} id`);
    const leaderSessionId = string(legacy['leaderAgentId'], `stored room ${index} leaderAgentId`);
    if (!Array.isArray(legacy['members']) || !Array.isArray(legacy['events'])) {
        throw new Error(`agent-team-room: stored room ${index} is missing collections`);
    }
    const memberIds = new Map();
    const members = legacy['members'].map((candidate, memberIndex) => {
        const member = record(candidate, `stored room ${index} member ${memberIndex}`);
        const sessionId = string(member['agentId'], `stored room ${index} member ${memberIndex} agentId`);
        const memberId = randomUUID();
        memberIds.set(sessionId, memberId);
        const kind = member['kind'] === 'leader' ? 'leader' : 'member';
        const legacyStatus = string(member['status'], `stored room ${index} member ${memberIndex} status`);
        const status = kind === 'leader'
            ? 'leader'
            : legacyStatus === 'starting' ? 'working'
                : legacyStatus === 'working' || legacyStatus === 'idle' || legacyStatus === 'interrupted'
                    || legacyStatus === 'error' || legacyStatus === 'removed'
                    ? legacyStatus
                    : 'idle';
        return {
            memberId,
            kind,
            name: string(member['name'], `stored room ${index} member ${memberIndex} name`),
            connection: {
                providerId: DSH_SESSION_MEMBER_PROVIDER,
                protocol: DSH_SESSION_MEMBER_PROTOCOL,
                address: { sessionId },
                sessionId,
            },
            status,
            joinedAt: string(member['joinedAt'], `stored room ${index} member ${memberIndex} joinedAt`),
            updatedAt: string(member['updatedAt'], `stored room ${index} member ${memberIndex} updatedAt`),
        };
    });
    const events = legacy['events'].map((candidate, eventIndex) => {
        const event = record(candidate, `stored room ${index} event ${eventIndex}`);
        const originalType = event['type'];
        const type = legacyEventType(originalType);
        const originalMessage = string(event['message'], `stored room ${index} event ${eventIndex} message`);
        const message = originalType === 'message.direct'
            ? 'Legacy direct-message delivery migrated without duplicated message content'
            : originalType === 'message.broadcast'
                ? 'Legacy broadcast delivery migrated without duplicated message content'
                : type === 'system.migrated'
                    ? `Legacy ${String(originalType)} record migrated: ${originalMessage.slice(0, 240)}`
                    : originalMessage;
        const actorSessionId = optionalString(event['actorAgentId'], `stored room ${index} event ${eventIndex} actorAgentId`);
        const targetSessionId = optionalString(event['targetAgentId'], `stored room ${index} event ${eventIndex} targetAgentId`);
        const actorMemberId = actorSessionId ? memberIds.get(actorSessionId) : undefined;
        const targetMemberId = targetSessionId ? memberIds.get(targetSessionId) : undefined;
        return {
            id: string(event['id'], `stored room ${index} event ${eventIndex} id`),
            type,
            at: string(event['at'], `stored room ${index} event ${eventIndex} at`),
            message,
            ...(actorMemberId ? { actorMemberId } : {}),
            ...(targetMemberId ? { targetMemberId } : {}),
        };
    });
    const tasks = Array.isArray(legacy['tasks']) ? legacy['tasks'] : [];
    if (tasks.length > 0) {
        events.push({
            id: randomUUID(),
            type: 'system.migrated',
            at: new Date().toISOString(),
            message: `Removed ${tasks.length} legacy task-board record(s) while upgrading Room to the membership-only schema`,
        });
    }
    const topic = optionalString(legacy['objective'], `stored room ${index} objective`);
    const closedAt = optionalString(legacy['closedAt'], `stored room ${index} closedAt`);
    const summary = optionalString(legacy['summary'], `stored room ${index} summary`);
    const room = {
        schemaVersion: ROOM_SCHEMA_VERSION,
        id,
        name: string(legacy['name'], `stored room ${index} name`),
        ...(topic ? { topic } : {}),
        leaderSessionId,
        status: legacy['status'] === 'closed' ? 'closed' : 'open',
        revision: typeof legacy['revision'] === 'number' ? legacy['revision'] + 1 : 1,
        createdAt: string(legacy['createdAt'], `stored room ${index} createdAt`),
        updatedAt: string(legacy['updatedAt'], `stored room ${index} updatedAt`),
        ...(closedAt ? { closedAt } : {}),
        ...(summary ? { summary } : {}),
        members,
        events,
    };
    assertRoom(room, index);
    return room;
}
function parseDocument(raw, file) {
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`agent-team-room: cannot parse storage file ${file}`, { cause: error });
    }
    const document = record(value, `storage file ${file}`);
    if (!Array.isArray(document['rooms'])) {
        throw new Error(`agent-team-room: storage file ${file} uses an unsupported schema`);
    }
    if (document['schemaVersion'] === 1) {
        return { rooms: document['rooms'].map(migrateV1Room), migrated: true };
    }
    if (document['schemaVersion'] !== ROOM_SCHEMA_VERSION) {
        throw new Error(`agent-team-room: storage file ${file} uses an unsupported schema`);
    }
    document['rooms'].forEach(assertRoom);
    return { rooms: structuredClone(document['rooms']), migrated: false };
}
/** Atomic JSON-file persistence with one-shot v1 → v2 migration. */
export class RoomStorage {
    file;
    migrated = false;
    constructor(file) {
        this.file = file && file.trim().length > 0 ? resolve(file) : defaultStorageFile();
    }
    async load() {
        try {
            const parsed = parseDocument(await readFile(this.file, 'utf8'), this.file);
            this.migrated = parsed.migrated;
            return structuredClone(parsed.rooms);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return [];
            throw error;
        }
    }
    async save(rooms) {
        const directory = dirname(this.file);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = join(directory, `.rooms.${process.pid}.${randomUUID()}.tmp`);
        const document = {
            schemaVersion: ROOM_SCHEMA_VERSION,
            rooms: structuredClone([...rooms]),
        };
        document.rooms.forEach(assertRoom);
        await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        await rename(temporary, this.file);
        this.migrated = false;
    }
}
//# sourceMappingURL=storage.js.map
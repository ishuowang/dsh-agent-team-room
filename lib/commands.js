export const name = 'agent-team-room-commands';
export const inject = ['commands', 'rooms'];
const USAGE = [
    '/room list [--include-closed true|false]',
    '/room show <room-id>',
    '/room create --name "..." [--topic "..."]',
    '/room attach <room-id> --session <session-id> [--name "..."]',
    '/room remove <room-id> <member-id> [--interrupt true|false]',
    '/room send <room-id> <member-id> --message "..."',
    '/room broadcast <room-id> --message "..."',
    '/room close <room-id> [--summary "..."] [--interrupt true|false]',
].join('\n');
/** Tokenize command input without invoking a shell or accepting expansion. */
export function tokenizeRoomCommand(rawInput) {
    const tokens = [];
    let token = '';
    let started = false;
    let quote;
    const finish = () => {
        if (!started)
            return;
        tokens.push(token);
        token = '';
        started = false;
    };
    for (let index = 0; index < rawInput.length; index += 1) {
        const character = rawInput[index];
        if (character === undefined)
            continue;
        if (quote === undefined && /\s/u.test(character)) {
            finish();
            continue;
        }
        if (character === '\\') {
            const escaped = rawInput[index + 1];
            if (escaped === undefined)
                throw new Error('room: dangling escape at end of input');
            token += escaped;
            started = true;
            index += 1;
            continue;
        }
        if (character === '"' || character === "'") {
            if (quote === undefined) {
                quote = character;
                started = true;
                continue;
            }
            if (quote === character) {
                quote = undefined;
                continue;
            }
        }
        token += character;
        started = true;
    }
    if (quote !== undefined)
        throw new Error(`room: unterminated ${quote} quote`);
    finish();
    return tokens;
}
function nonEmpty(value, field) {
    if (value === undefined || value.trim().length === 0)
        throw new Error(`room: ${field} is required\n${USAGE}`);
    return value;
}
function boolean(value, field, fallback) {
    if (value === undefined)
        return fallback;
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    throw new Error(`room: ${field} must be true or false\n${USAGE}`);
}
function flags(tokens, start, allowed) {
    const result = new Map();
    for (let index = start; index < tokens.length; index += 2) {
        const flag = tokens[index];
        const value = tokens[index + 1];
        if (flag === undefined || !flag.startsWith('--')) {
            throw new Error(`room: unexpected positional argument "${flag ?? ''}"\n${USAGE}`);
        }
        if (!allowed.includes(flag))
            throw new Error(`room: unknown flag "${flag}"\n${USAGE}`);
        if (result.has(flag))
            throw new Error(`room: duplicate flag "${flag}"`);
        if (value === undefined || value.startsWith('--'))
            throw new Error(`room: flag "${flag}" requires a value`);
        result.set(flag, nonEmpty(value, `${flag} value`));
    }
    return result;
}
export function parseRoomCommand(rawInput) {
    const tokens = tokenizeRoomCommand(rawInput);
    const action = tokens[0] ?? 'list';
    if (action === 'list') {
        const values = flags(tokens, 1, ['--include-closed']);
        return { action, includeClosed: boolean(values.get('--include-closed'), '--include-closed', false) };
    }
    if (action === 'show') {
        if (tokens.length !== 2)
            throw new Error(`room: show requires exactly one room id\n${USAGE}`);
        return { action, roomId: nonEmpty(tokens[1], 'room id') };
    }
    if (action === 'create') {
        const values = flags(tokens, 1, ['--name', '--topic']);
        const topic = values.get('--topic');
        return {
            action,
            name: nonEmpty(values.get('--name'), '--name'),
            ...(topic ? { topic } : {}),
        };
    }
    if (action === 'attach') {
        const roomId = nonEmpty(tokens[1], 'room id');
        const values = flags(tokens, 2, ['--session', '--name']);
        const name = values.get('--name');
        return {
            action,
            roomId,
            sessionId: nonEmpty(values.get('--session'), '--session'),
            ...(name ? { name } : {}),
        };
    }
    if (action === 'remove') {
        const roomId = nonEmpty(tokens[1], 'room id');
        const memberId = nonEmpty(tokens[2], 'member id');
        const values = flags(tokens, 3, ['--interrupt']);
        return { action, roomId, memberId, interrupt: boolean(values.get('--interrupt'), '--interrupt', true) };
    }
    if (action === 'send') {
        const roomId = nonEmpty(tokens[1], 'room id');
        const memberId = nonEmpty(tokens[2], 'member id');
        const values = flags(tokens, 3, ['--message']);
        return { action, roomId, memberId, message: nonEmpty(values.get('--message'), '--message') };
    }
    if (action === 'broadcast') {
        const roomId = nonEmpty(tokens[1], 'room id');
        const values = flags(tokens, 2, ['--message']);
        return { action, roomId, message: nonEmpty(values.get('--message'), '--message') };
    }
    if (action === 'close') {
        const roomId = nonEmpty(tokens[1], 'room id');
        const values = flags(tokens, 2, ['--summary', '--interrupt']);
        const summary = values.get('--summary');
        return {
            action,
            roomId,
            ...(summary ? { summary } : {}),
            interrupt: boolean(values.get('--interrupt'), '--interrupt', true),
        };
    }
    throw new Error(`room: unknown action "${action}"\n${USAGE}`);
}
function renderError(error) {
    return error instanceof Error ? error.message : String(error);
}
function jsonResult(value) {
    return { kind: 'success', text: JSON.stringify(value, null, 2) };
}
/** Register the generic Host-native Room command used by the native UI. */
export function apply(ctx) {
    ctx.commands.register({
        name: 'room',
        description: 'Create and manage rooms of attached DSH Sessions; roles come from independent member providers.',
        input: { hint: '[list | show | create | attach | remove | send | broadcast | close]' },
        async handler(invocation) {
            try {
                const parsed = parseRoomCommand(invocation.rawInput);
                invocation.signal.throwIfAborted();
                switch (parsed.action) {
                    case 'list':
                        return jsonResult({ rooms: ctx.rooms.listRooms(invocation.agent, parsed.includeClosed) });
                    case 'show':
                        return jsonResult({ room: ctx.rooms.getRoom(invocation.agent, parsed.roomId) });
                    case 'create':
                        return jsonResult({
                            room: await ctx.rooms.createRoom(invocation.agent, {
                                name: parsed.name,
                                ...(parsed.topic ? { topic: parsed.topic } : {}),
                            }),
                        });
                    case 'attach':
                        return jsonResult({
                            member: await ctx.rooms.attachSession(invocation.agent, parsed.roomId, {
                                sessionId: parsed.sessionId,
                                ...(parsed.name ? { name: parsed.name } : {}),
                            }, invocation.signal),
                        });
                    case 'remove':
                        return jsonResult({
                            member: await ctx.rooms.removeMember(invocation.agent, parsed.roomId, parsed.memberId, parsed.interrupt),
                        });
                    case 'send':
                        return jsonResult(await ctx.rooms.sendMessage(invocation.agent, parsed.roomId, parsed.memberId, parsed.message, invocation.signal));
                    case 'broadcast':
                        return jsonResult({
                            deliveries: await ctx.rooms.broadcast(invocation.agent, parsed.roomId, parsed.message, invocation.signal),
                        });
                    case 'close':
                        return jsonResult({
                            room: await ctx.rooms.closeRoom(invocation.agent, parsed.roomId, {
                                ...(parsed.summary ? { summary: parsed.summary } : {}),
                                interruptRunning: parsed.interrupt,
                            }),
                        });
                }
            }
            catch (error) {
                return { kind: 'error', text: renderError(error) };
            }
        },
    });
}
//# sourceMappingURL=commands.js.map
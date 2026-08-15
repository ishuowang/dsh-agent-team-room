export const name = 'agent-team-room-commands';
export const inject = ['commands', 'rooms'];
const CREATE_FLAGS = {
    '--name': 'name',
    '--objective': 'objective',
    '--provider': 'provider',
    '--model-provider': 'modelProvider',
    '--model': 'model',
};
const USAGE = [
    '/room-template [list]',
    '/room-template show <id>',
    '/room-template create <id> [--name "..."] [--objective "..."]',
    '  [--provider <id>] [--model-provider <id>] [--model <id>]',
].join('\n');
/** Tokenize command input without invoking a shell or accepting implicit expansion. */
function tokenize(rawInput) {
    const tokens = [];
    let token = '';
    let tokenStarted = false;
    let quote;
    const finish = () => {
        if (!tokenStarted)
            return;
        tokens.push(token);
        token = '';
        tokenStarted = false;
    };
    for (let index = 0; index < rawInput.length; index += 1) {
        const character = rawInput[index];
        /* v8 ignore next -- an indexed character inside the loop is always present */
        if (character === undefined)
            continue;
        if (quote === undefined && /\s/u.test(character)) {
            finish();
            continue;
        }
        if (character === '\\') {
            const escaped = rawInput[index + 1];
            if (escaped === undefined)
                throw new Error('room-template: dangling escape at end of input');
            tokenStarted = true;
            token += escaped;
            index += 1;
            continue;
        }
        if (character === '"' || character === "'") {
            if (quote === undefined) {
                quote = character;
                tokenStarted = true;
                continue;
            }
            if (quote === character) {
                quote = undefined;
                continue;
            }
        }
        tokenStarted = true;
        token += character;
    }
    if (quote !== undefined)
        throw new Error(`room-template: unterminated ${quote} quote`);
    finish();
    return tokens;
}
function requireNonEmpty(value, field) {
    if (value.trim().length === 0)
        throw new Error(`room-template: ${field} cannot be empty`);
    return value;
}
/** Parse the exact input following `/room-template`. Throws a user-facing syntax error. */
export function parseRoomTemplateCommand(rawInput) {
    const tokens = tokenize(rawInput);
    const action = tokens[0];
    if (action === undefined || action === 'list') {
        if (tokens.length > 1)
            throw new Error(`room-template: list accepts no arguments\n${USAGE}`);
        return { action: 'list' };
    }
    if (action === 'show') {
        const templateId = tokens[1];
        if (templateId === undefined)
            throw new Error(`room-template: show requires a template id\n${USAGE}`);
        if (tokens.length > 2)
            throw new Error(`room-template: show accepts exactly one template id\n${USAGE}`);
        return { action: 'show', templateId: requireNonEmpty(templateId, 'template id') };
    }
    if (action !== 'create') {
        throw new Error(`room-template: unknown action "${action}"; expected list, show, or create\n${USAGE}`);
    }
    const templateId = tokens[1];
    if (templateId === undefined || templateId.startsWith('--')) {
        throw new Error(`room-template: create requires a template id before any flags\n${USAGE}`);
    }
    const values = {};
    const seen = new Set();
    for (let index = 2; index < tokens.length; index += 2) {
        const flag = tokens[index];
        if (flag === undefined)
            break;
        if (!Object.hasOwn(CREATE_FLAGS, flag)) {
            if (flag.startsWith('--'))
                throw new Error(`room-template: unknown flag "${flag}"\n${USAGE}`);
            throw new Error(`room-template: unexpected positional argument "${flag}"\n${USAGE}`);
        }
        const typedFlag = flag;
        if (seen.has(typedFlag))
            throw new Error(`room-template: duplicate flag "${typedFlag}"`);
        const value = tokens[index + 1];
        if (value === undefined || value.startsWith('--')) {
            throw new Error(`room-template: flag "${typedFlag}" requires a value`);
        }
        seen.add(typedFlag);
        values[CREATE_FLAGS[typedFlag]] = requireNonEmpty(value, `${typedFlag} value`);
    }
    return {
        action: 'create',
        templateId: requireNonEmpty(templateId, 'template id'),
        ...values,
    };
}
function roleCount(template) {
    return template.roles.length;
}
function renderTemplateList(templates) {
    if (templates.length === 0)
        return 'No built-in Room templates are available.';
    return [
        'Built-in Agent Team Room templates:',
        ...templates.map(template => (`- ${template.id} — ${template.name} (${roleCount(template)} Agents)\n  ${template.description}`)),
        '',
        'Inspect one with /room-template show <id>, or create it with /room-template create <id>.',
    ].join('\n');
}
function renderTemplate(template) {
    return [
        `${template.name} (${template.id}, v${template.version})`,
        template.description,
        '',
        `Default objective: ${template.defaultObjective}`,
        `Agents (${roleCount(template)}):`,
        ...template.roles.map(role => `- ${role.name} — ${role.role}`),
        '',
        `Create with /room-template create ${template.id}`,
    ].join('\n');
}
function renderCreated(result) {
    const summary = [
        `Room "${result.room.name}" created from ${result.template.id}.`,
        `Room id: ${result.room.id}`,
        `Agents started: ${result.members.length}/${result.template.roles.length}`,
    ];
    if (result.failures.length === 0)
        return { kind: 'success', text: summary.join('\n') };
    summary.push(`Room status: ${result.room.status}. The partial room remains available for inspection.`, 'Provisioning failures:', ...result.failures.map(failure => `- ${failure.name} (${failure.roleId}): ${failure.error}`));
    return { kind: 'error', text: summary.join('\n') };
}
function renderError(error) {
    if (error instanceof Error)
        return error.message;
    try {
        return String(error);
    }
    catch {
        return 'room-template: an unknown error occurred';
    }
}
/** Register the Host-native Room template command. */
export function apply(ctx) {
    ctx.commands.register({
        name: 'room-template',
        description: 'List, inspect, or create a built-in Agent Team Room scenario.',
        input: {
            hint: '[list | show <id> | create <id> [--name "..."] [--objective "..."]]',
        },
        async handler(invocation) {
            try {
                const parsed = parseRoomTemplateCommand(invocation.rawInput);
                invocation.signal.throwIfAborted();
                if (parsed.action === 'list') {
                    return { kind: 'success', text: renderTemplateList(ctx.rooms.listRoomTemplates()) };
                }
                if (parsed.action === 'show') {
                    return { kind: 'success', text: renderTemplate(ctx.rooms.getRoomTemplate(parsed.templateId)) };
                }
                return renderCreated(await ctx.rooms.createRoomFromTemplate(invocation.agent, {
                    templateId: parsed.templateId,
                    ...(parsed.name !== undefined ? { name: parsed.name } : {}),
                    ...(parsed.objective !== undefined ? { objective: parsed.objective } : {}),
                    ...(parsed.provider !== undefined ? { provider: parsed.provider } : {}),
                    ...(parsed.modelProvider !== undefined ? { modelProvider: parsed.modelProvider } : {}),
                    ...(parsed.model !== undefined ? { model: parsed.model } : {}),
                }, invocation.signal));
            }
            catch (error) {
                return { kind: 'error', text: renderError(error) };
            }
        },
    });
}
//# sourceMappingURL=commands.js.map
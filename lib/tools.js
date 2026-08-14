import { defineTool } from '@deepseek-ai/dsh-tools';
export const name = 'agent-team-room-tools';
export const inject = ['tools', 'rooms'];
function callingAgent(exec) {
    if (!exec.agent)
        throw new Error('Agent Team Room tools require a live calling Agent');
    return exec.agent;
}
function renderJson(value) {
    return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
}
function jsonValue(value) {
    return value;
}
const jsonOutput = {
    schema: { type: 'json' },
    render: (_args, value) => renderJson(value),
};
/** Register the coordinator-facing Room tool suite. */
export function apply(ctx) {
    ctx.tools.register(defineTool({
        name: 'room_create',
        description: 'Create a persistent Agent Team Room owned by this Agent. A room coordinates independent child Sessions; '
            + 'members share room messages and task events, never one combined conversation context.',
        parameters: {
            name: { type: 'string', required: true, description: 'Short room name.' },
            objective: { type: 'string', required: true, description: 'Shared outcome the team should produce.' },
        },
        output: jsonOutput,
        async execute(args, exec) {
            return jsonValue(await ctx.rooms.createRoom(callingAgent(exec), { name: args.name, objective: args.objective }));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'room_list',
        description: 'List rooms led by this Agent, with member and open-task counts.',
        parameters: {
            include_closed: { type: 'boolean', description: 'Include closed rooms. Defaults to false.' },
        },
        output: jsonOutput,
        execute(args, exec) {
            return Promise.resolve(jsonValue({ rooms: ctx.rooms.listRooms(callingAgent(exec), args.include_closed ?? false) }));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'room_get',
        description: 'Read one owned room, including its member roster, tasks, and shared event timeline.',
        parameters: {
            room_id: { type: 'string', required: true, description: 'Room id returned by room_create or room_list.' },
        },
        output: jsonOutput,
        execute(args, exec) {
            return Promise.resolve(jsonValue({ room: ctx.rooms.getRoom(callingAgent(exec), args.room_id) }));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'room_history',
        description: 'Read the newest shared events from an owned room without loading any member Agent transcript.',
        parameters: {
            room_id: { type: 'string', required: true, description: 'Room id.' },
            limit: { type: 'number', description: 'Newest events to return (1-1000, default 100).' },
        },
        output: jsonOutput,
        execute(args, exec) {
            return Promise.resolve(jsonValue({
                events: ctx.rooms.roomHistory(callingAgent(exec), args.room_id, args.limit ?? 100),
            }));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'room_add_agent',
        description: 'Add an independent continuable Agent Session to an owned room. Omit agent_id to create a new child, or '
            + 'provide the id of an existing continuable direct child. Different roles/models may coexist in one room.',
        parameters: {
            room_id: { type: 'string', required: true, description: 'Open room id.' },
            name: { type: 'string', required: true, description: 'Display name unique enough for this team.' },
            role: { type: 'string', required: true, description: 'Responsibility or specialty in the room.' },
            agent_id: { type: 'string', description: 'Existing continuable direct-child Session id to attach.' },
            provider: { type: 'string', description: 'DSH subagent provider override (default comes from plugin config).' },
            model_provider: { type: 'string', description: 'LLM provider for a newly created child.' },
            model: { type: 'string', description: 'LLM model for a newly created child.' },
            system_prompt: { type: 'string', description: 'Optional per-child persona/system prompt.' },
        },
        output: jsonOutput,
        async execute(args, exec) {
            const member = await ctx.rooms.addAgent(callingAgent(exec), args.room_id, {
                name: args.name,
                role: args.role,
                ...(args.agent_id ? { agentId: args.agent_id } : {}),
                ...(args.provider ? { provider: args.provider } : {}),
                ...(args.model_provider ? { modelProvider: args.model_provider } : {}),
                ...(args.model ? { model: args.model } : {}),
                ...(args.system_prompt ? { systemPrompt: args.system_prompt } : {}),
            }, exec.signal);
            return jsonValue({ member });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'room_remove_agent',
        description: 'Remove an Agent from an owned room and optionally interrupt its current turn. The independent DSH Session '
            + 'is not deleted and remains available through ordinary subagent history.',
        parameters: {
            room_id: { type: 'string', required: true, description: 'Open room id.' },
            agent_id: { type: 'string', required: true, description: 'Room member Agent Session id.' },
            interrupt_running: { type: 'boolean', description: 'Interrupt the current turn (default true).' },
        },
        output: jsonOutput,
        async execute(args, exec) {
            const member = await ctx.rooms.removeAgent(callingAgent(exec), args.room_id, args.agent_id, args.interrupt_running ?? true);
            return jsonValue({ member });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'room_send',
        description: 'Send a direct follow-up to one Agent in an owned room. It joins that Agent’s independent FIFO inbox and '
            + 'does not redirect a turn already in progress.',
        parameters: {
            room_id: { type: 'string', required: true, description: 'Open room id.' },
            to_agent_id: { type: 'string', required: true, description: 'Target member Agent Session id.' },
            message: { type: 'string', required: true, description: 'Message to enqueue.' },
        },
        output: jsonOutput,
        async execute(args, exec) {
            return jsonValue(await ctx.rooms.sendMessage(callingAgent(exec), args.room_id, args.to_agent_id, args.message, exec.signal));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'room_broadcast',
        description: 'Broadcast one follow-up to every active Agent member in an owned room. Returns per-Agent delivery results '
            + 'so partial failure is explicit.',
        parameters: {
            room_id: { type: 'string', required: true, description: 'Open room id.' },
            message: { type: 'string', required: true, description: 'Message to enqueue for every member.' },
        },
        output: jsonOutput,
        async execute(args, exec) {
            return jsonValue({
                deliveries: await ctx.rooms.broadcast(callingAgent(exec), args.room_id, args.message, exec.signal),
            });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'room_assign',
        description: 'Create a tracked room task and deliver it to one member Agent. A member can own only one non-terminal room '
            + 'task at a time; the assignee reports completion explicitly with room_task_complete.',
        parameters: {
            room_id: { type: 'string', required: true, description: 'Open room id.' },
            assignee_agent_id: { type: 'string', required: true, description: 'Assignee Agent Session id.' },
            title: { type: 'string', required: true, description: 'Concise task title.' },
            instructions: { type: 'string', required: true, description: 'Complete standalone task instructions.' },
        },
        output: jsonOutput,
        async execute(args, exec) {
            const task = await ctx.rooms.assignTask(callingAgent(exec), args.room_id, {
                assigneeAgentId: args.assignee_agent_id,
                title: args.title,
                instructions: args.instructions,
            }, exec.signal);
            return jsonValue({ task });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'room_task_get',
        description: 'Read the current status and result of one tracked room task.',
        parameters: {
            room_id: { type: 'string', required: true, description: 'Room id.' },
            task_id: { type: 'string', required: true, description: 'Task id returned by room_assign.' },
        },
        output: jsonOutput,
        execute(args, exec) {
            return Promise.resolve(jsonValue({ task: ctx.rooms.getTask(callingAgent(exec), args.room_id, args.task_id) }));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'room_task_complete',
        description: 'Report the terminal result of a tracked room task. Only the assigned Agent may report it. This explicit '
            + 'room/task correlation prevents unrelated Agent turns or queued messages from completing the wrong task.',
        parameters: {
            room_id: { type: 'string', required: true, description: 'Room id included in the assignment.' },
            task_id: { type: 'string', required: true, description: 'Task id included in the assignment.' },
            status: {
                type: 'string',
                required: true,
                enum: ['completed', 'failed'],
                description: 'Whether the assigned work completed or failed.',
            },
            report: { type: 'string', required: true, description: 'Concise result, or the reason the task failed.' },
        },
        output: jsonOutput,
        async execute(args, exec) {
            return jsonValue({
                task: await ctx.rooms.completeTask(callingAgent(exec), args.room_id, args.task_id, {
                    status: args.status,
                    report: args.report,
                }),
            });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'room_wait',
        description: 'Wait until selected room tasks reach a terminal state or the timeout expires. Without task_ids, waits for '
            + 'the tasks that are non-terminal when this call begins. This does not poll or merge Agent transcripts.',
        parameters: {
            room_id: { type: 'string', required: true, description: 'Room id.' },
            task_ids: { type: 'array', items: { type: 'string' }, description: 'Optional task ids to await.' },
            timeout_ms: { type: 'number', description: 'Wait timeout in milliseconds (0-300000, default 60000).' },
        },
        output: jsonOutput,
        timeoutMs: 305_000,
        async execute(args, exec) {
            return jsonValue(await ctx.rooms.waitForTasks(callingAgent(exec), args.room_id, args.task_ids, args.timeout_ms ?? 60_000, exec.signal));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'room_close',
        description: 'Close an owned room, cancel its non-terminal tracked tasks, and by default interrupt current member turns. '
            + 'Closing keeps the durable room timeline and every independent Agent Session.',
        parameters: {
            room_id: { type: 'string', required: true, description: 'Open room id.' },
            summary: { type: 'string', description: 'Optional final room summary.' },
            interrupt_running_agents: { type: 'boolean', description: 'Interrupt current member turns (default true).' },
        },
        output: jsonOutput,
        async execute(args, exec) {
            return jsonValue({
                room: await ctx.rooms.closeRoom(callingAgent(exec), args.room_id, {
                    ...(args.summary ? { summary: args.summary } : {}),
                    interruptRunning: args.interrupt_running_agents ?? true,
                }),
            });
        },
    }));
}
//# sourceMappingURL=tools.js.map
(() => {
  "use strict";

  const POLL_INTERVAL_MS = 12_000;
  const params = new URLSearchParams(window.location.search);
  const demoMode = params.get("demo") === "1";

  const elements = {
    roomList: document.querySelector("#room-list"),
    roomFilter: document.querySelector("#room-filter"),
    filterEmpty: document.querySelector("#filter-empty"),
    roomView: document.querySelector("#room-view"),
    viewState: document.querySelector("#view-state"),
    stateKicker: document.querySelector("#state-kicker"),
    stateTitle: document.querySelector("#state-title"),
    stateCopy: document.querySelector("#state-copy"),
    retryButton: document.querySelector("#retry-button"),
    refreshButton: document.querySelector("#refresh-button"),
    connectionSignal: document.querySelector("#connection-signal"),
    connectionLabel: document.querySelector("#connection-label"),
    lastSync: document.querySelector("#last-sync"),
    demoBadge: document.querySelector("#demo-badge"),
    announcer: document.querySelector("#announcer"),
    breadcrumbRoom: document.querySelector("#breadcrumb-room"),
    roomStatus: document.querySelector("#room-status"),
    roomUpdated: document.querySelector("#room-updated"),
    roomTitle: document.querySelector("#room-title"),
    roomObjective: document.querySelector("#room-objective"),
    statAgents: document.querySelector("#stat-agents"),
    statAgentsNote: document.querySelector("#stat-agents-note"),
    statTasks: document.querySelector("#stat-tasks"),
    statTasksNote: document.querySelector("#stat-tasks-note"),
    statEvents: document.querySelector("#stat-events"),
    agentCount: document.querySelector("#agent-count"),
    memberGrid: document.querySelector("#member-grid"),
    taskCount: document.querySelector("#task-count"),
    kanban: document.querySelector("#kanban"),
    timeline: document.querySelector("#timeline"),
  };

  const state = {
    rooms: [],
    selectedRoomId: null,
    room: null,
    pollTimer: null,
    requestController: null,
    requestVersion: 0,
    isRefreshing: false,
    hasLoaded: false,
  };

  const demoRooms = [
    {
      id: "launch-control",
      name: "Launch Control",
      objective: "Ship the Agent Team Room plugin with a stable DSH adapter and a submission-ready package.",
      status: "active",
      memberCount: 5,
      activeTasks: 4,
      updatedAt: new Date(Date.now() - 22_000).toISOString(),
    },
    {
      id: "runtime-lab",
      name: "Runtime Lab",
      objective: "Stress-test room persistence and concurrent agent message delivery.",
      status: "active",
      memberCount: 3,
      activeTasks: 2,
      updatedAt: new Date(Date.now() - 185_000).toISOString(),
    },
    {
      id: "docs-squad",
      name: "Docs & Discovery",
      objective: "Create an agent-readable guide and marketplace launch materials.",
      status: "paused",
      memberCount: 2,
      activeTasks: 1,
      updatedAt: new Date(Date.now() - 1_050_000).toISOString(),
    },
  ];

  const demoRoomDetails = {
    "launch-control": {
      ...demoRooms[0],
      createdAt: new Date(Date.now() - 7_200_000).toISOString(),
      members: [
        { id: "orchestrator", name: "Orchestrator", role: "Mission lead", model: "deepseek-v3.2", status: "online", currentTask: "Coordinating the release gate and integration sequence" },
        { id: "architect", name: "Architect", role: "Systems design", model: "deepseek-r1", status: "online", currentTask: "Hardening the room event contract and adapter boundary" },
        { id: "builder", name: "Builder", role: "Plugin engineer", model: "deepseek-v3.2", status: "online", currentTask: "Packaging CLI commands and persistent room storage" },
        { id: "sentinel", name: "Sentinel", role: "Quality & safety", model: "deepseek-r1", status: "waiting", currentTask: "Reviewing concurrency, redaction, and failure recovery" },
        { id: "scribe", name: "Scribe", role: "Developer experience", model: "deepseek-v3.2", status: "online", currentTask: "Preparing install recipes and marketplace metadata" },
      ],
      tasks: [
        { id: "DSH-18", title: "Define the public room event envelope", status: "backlog", assignee: "Architect", priority: "high" },
        { id: "DSH-24", title: "Add room export and redaction rules", status: "backlog", assignee: "Sentinel", priority: "medium" },
        { id: "DSH-31", title: "Implement join, leave, send, and inspect commands", status: "in_progress", assignee: "Builder", priority: "critical" },
        { id: "DSH-32", title: "Wire persistent event replay into the DSH adapter", status: "in_progress", assignee: "Architect", priority: "high" },
        { id: "DSH-35", title: "Validate clean install against a fresh DSH profile", status: "review", assignee: "Sentinel", priority: "high" },
        { id: "DSH-36", title: "Polish marketplace copy and agent quickstart", status: "review", assignee: "Scribe", priority: "medium" },
        { id: "DSH-07", title: "Prototype append-only room storage", status: "done", assignee: "Builder", priority: "high" },
        { id: "DSH-12", title: "Document the adapter isolation contract", status: "done", assignee: "Architect", priority: "medium" },
      ],
      events: [
        { id: "evt-01", type: "task_completed", agent: "Builder", message: "Append-only event replay passed the 10,000-message fixture.", timestamp: new Date(Date.now() - 74_000).toISOString() },
        { id: "evt-02", type: "message", agent: "Orchestrator", message: "Release gate moved forward; CLI integration is now the critical path.", timestamp: new Date(Date.now() - 280_000).toISOString() },
        { id: "evt-03", type: "agent_joined", agent: "Sentinel", message: "Joined the room and claimed the clean-profile validation task.", timestamp: new Date(Date.now() - 610_000).toISOString() },
        { id: "evt-04", type: "warning", agent: "Architect", message: "Flagged a stale-reader edge case for review before the adapter contract freezes.", timestamp: new Date(Date.now() - 1_080_000).toISOString() },
        { id: "evt-05", type: "task_completed", agent: "Scribe", message: "Agent-first installation walkthrough is ready for technical review.", timestamp: new Date(Date.now() - 1_740_000).toISOString() },
      ],
    },
    "runtime-lab": {
      ...demoRooms[1],
      members: [
        { id: "flux", name: "Flux", role: "Load testing", model: "deepseek-v3.2", status: "online", currentTask: "Running 20-agent fan-out scenarios" },
        { id: "ledger", name: "Ledger", role: "Persistence", model: "deepseek-r1", status: "online", currentTask: "Verifying replay order after forced restarts" },
        { id: "probe", name: "Probe", role: "Observability", model: "deepseek-v3.2", status: "idle", currentTask: "Watching delivery latency and queue depth" },
      ],
      tasks: [
        { id: "LAB-04", title: "Run concurrent fan-out soak test", status: "in_progress", assignee: "Flux", priority: "high" },
        { id: "LAB-06", title: "Compare snapshot recovery against full replay", status: "review", assignee: "Ledger", priority: "medium" },
        { id: "LAB-01", title: "Create deterministic load fixture", status: "done", assignee: "Probe", priority: "medium" },
      ],
      events: [
        { id: "lab-01", type: "message", agent: "Probe", message: "P95 delivery latency remains below the current lab threshold.", timestamp: new Date(Date.now() - 148_000).toISOString() },
        { id: "lab-02", type: "task_completed", agent: "Flux", message: "Ten-agent baseline completed without dropped events.", timestamp: new Date(Date.now() - 920_000).toISOString() },
      ],
    },
    "docs-squad": {
      ...demoRooms[2],
      members: [
        { id: "atlas", name: "Atlas", role: "Information architecture", model: "deepseek-r1", status: "idle", currentTask: "Waiting for the final command surface" },
        { id: "signal", name: "Signal", role: "Launch writing", model: "deepseek-v3.2", status: "offline", currentTask: "Marketplace submission copy is staged" },
      ],
      tasks: [
        { id: "DOC-09", title: "Capture final command examples", status: "backlog", assignee: "Atlas", priority: "medium" },
        { id: "DOC-04", title: "Draft marketplace summary", status: "done", assignee: "Signal", priority: "low" },
      ],
      events: [
        { id: "doc-01", type: "room_paused", agent: "Orchestrator", message: "Room paused until the CLI surface is finalized.", timestamp: new Date(Date.now() - 1_050_000).toISOString() },
      ],
    },
  };

  const columns = [
    { id: "backlog", label: "Queued" },
    { id: "in_progress", label: "In progress" },
    { id: "review", label: "Review" },
    { id: "done", label: "Complete" },
  ];

  function text(value, fallback = "—") {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  function slug(value) {
    return text(value, "unknown").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function initials(value) {
    const parts = text(value, "?").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  }

  function plural(count, word) {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
  }

  function normalizeRooms(payload) {
    const rooms = Array.isArray(payload) ? payload : payload?.rooms;
    if (!Array.isArray(rooms)) throw new Error("Room registry returned an invalid payload.");
    return rooms.filter((room) => room && room.id !== undefined && room.id !== null).map((room) => ({
      id: String(room.id),
      name: text(room.name ?? room.title, `Room ${room.id}`),
      objective: text(room.objective ?? room.description, "No objective reported"),
      status: slug(room.status ?? "active"),
      memberCount: Number(room.memberCount ?? room.members?.length ?? 0),
      activeTasks: Number(room.activeTasks ?? room.openTaskCount ?? room.taskCount ?? 0),
      updatedAt: room.updatedAt ?? room.updated_at ?? null,
    }));
  }

  function normalizeRoom(payload) {
    const source = payload?.room ?? payload;
    if (!source || source.id === undefined || source.id === null) {
      throw new Error("Room detail returned an invalid payload.");
    }
    return {
      ...source,
      id: String(source.id),
      name: text(source.name ?? source.title, `Room ${source.id}`),
      objective: text(source.objective ?? source.description, "No objective reported"),
      status: slug(source.status ?? "active"),
      updatedAt: source.updatedAt ?? source.updated_at ?? null,
      members: Array.isArray(source.members) ? source.members : [],
      tasks: Array.isArray(source.tasks) ? source.tasks : [],
      events: Array.isArray(source.events) ? source.events : [],
    };
  }

  async function fetchJson(url, signal) {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}.`);
    return response.json();
  }

  async function loadRegistry(signal) {
    if (demoMode) {
      return normalizeRooms({ rooms: demoRooms });
    }
    const payload = await fetchJson("./api/rooms", signal);
    return normalizeRooms(payload);
  }

  async function loadRoom(roomId, signal) {
    if (demoMode) {
      const room = demoRoomDetails[roomId];
      if (!room) throw new Error("Demo room could not be found.");
      return normalizeRoom({ room });
    }
    const encodedRoomId = encodeURIComponent(roomId);
    const payload = await fetchJson(`./api/rooms/${encodedRoomId}`, signal);
    return normalizeRoom(payload);
  }

  function setConnection(status, label) {
    elements.connectionSignal.className = "signal";
    if (status === "online") elements.connectionSignal.classList.add("is-online");
    if (status === "error") elements.connectionSignal.classList.add("is-error");
    elements.connectionLabel.textContent = label;
  }

  function setRefreshState(isRefreshing) {
    state.isRefreshing = isRefreshing;
    elements.refreshButton.disabled = isRefreshing;
    elements.refreshButton.classList.toggle("is-spinning", isRefreshing);
  }

  function showState(kind, kicker, title, copy, canRetry = false) {
    elements.roomView.hidden = true;
    elements.viewState.hidden = false;
    elements.viewState.className = `view-state is-${kind}`;
    elements.stateKicker.textContent = kicker;
    elements.stateTitle.textContent = title;
    elements.stateCopy.textContent = copy;
    elements.retryButton.hidden = !canRetry;
  }

  function showRoom() {
    elements.viewState.hidden = true;
    elements.roomView.hidden = false;
  }

  function formatRelativeTime(value) {
    if (!value) return "unknown";
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return text(value);
    const seconds = Math.round((timestamp - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const units = [
      ["year", 31_536_000],
      ["month", 2_592_000],
      ["day", 86_400],
      ["hour", 3_600],
      ["minute", 60],
    ];
    for (const [unit, size] of units) {
      if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
    }
    return formatter.format(seconds, "second");
  }

  function formatEventTime(value) {
    if (!value) return "TIME —";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    const sameDay = date.toDateString() === new Date().toDateString();
    const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
    if (sameDay) return time;
    return `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)} · ${time}`;
  }

  function makeElement(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  }

  function renderRoomList() {
    const query = elements.roomFilter.value.trim().toLowerCase();
    const filteredRooms = state.rooms.filter((room) => {
      const searchable = `${room.name} ${room.objective} ${room.status}`.toLowerCase();
      return searchable.includes(query);
    });

    elements.roomList.replaceChildren();
    elements.roomList.setAttribute("aria-busy", "false");
    elements.filterEmpty.hidden = filteredRooms.length !== 0 || query.length === 0;

    for (const room of filteredRooms) {
      const button = makeElement("button", "room-button");
      button.type = "button";
      button.dataset.roomId = room.id;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(room.id === state.selectedRoomId));
      button.tabIndex = room.id === state.selectedRoomId || (!state.selectedRoomId && room === filteredRooms[0]) ? 0 : -1;

      const glyph = makeElement("span", "room-glyph", initials(room.name));
      glyph.setAttribute("aria-hidden", "true");
      const copy = makeElement("span", "room-copy");
      copy.append(makeElement("strong", "", room.name));
      copy.append(makeElement("span", "", room.objective));
      const members = makeElement("span", "room-members", String(room.memberCount));
      members.setAttribute("aria-label", plural(room.memberCount, "agent"));
      button.append(glyph, copy, members);
      elements.roomList.append(button);
    }
  }

  function renderMembers(members, tasks) {
    elements.memberGrid.replaceChildren();
    elements.agentCount.textContent = plural(members.length, "agent");
    if (members.length === 0) {
      elements.memberGrid.append(makeElement("div", "empty-card", "No agents have joined this room yet."));
      return;
    }

    members.forEach((member, index) => {
      const name = text(member.name ?? member.id, "Unnamed agent");
      const status = slug(member.status ?? "online");
      const card = makeElement("article", "member-card");
      card.dataset.index = String(index + 1).padStart(2, "0");

      const top = makeElement("div", "member-top");
      const avatar = makeElement("span", "agent-avatar", initials(name));
      avatar.dataset.status = status;
      avatar.setAttribute("aria-label", `${name} is ${status.replaceAll("_", " ")}`);
      const identity = makeElement("div", "agent-identity");
      identity.append(makeElement("strong", "", name));
      identity.append(makeElement("span", "", text(member.role, "Agent")));
      top.append(avatar, identity);

      card.append(top);
      const activeTask = tasks.find((task) => {
        const taskStatus = normalizeTaskStatus(task.status);
        return task.assigneeAgentId === (member.agentId ?? member.id) && taskStatus === "in_progress";
      });
      card.append(makeElement("span", "agent-model", text(member.model ?? member.provider, "model not reported")));
      card.append(makeElement("p", "agent-task", text(member.currentTask ?? member.current_task ?? activeTask?.title, ["working", "starting", "online"].includes(status) ? "Awaiting task assignment" : "No active task")));
      elements.memberGrid.append(card);
    });
  }

  function normalizeTaskStatus(value) {
    const status = slug(value ?? "backlog");
    const aliases = {
      todo: "backlog",
      queued: "backlog",
      pending: "backlog",
      active: "in_progress",
      working: "in_progress",
      running: "in_progress",
      inprogress: "in_progress",
      blocked: "review",
      testing: "review",
      failed: "review",
      cancelled: "review",
      completed: "done",
      complete: "done",
      closed: "done",
    };
    return aliases[status] ?? status;
  }

  function renderTaskCard(task, members) {
    const card = makeElement("article", "task-card");
    const priority = slug(task.priority ?? "normal");
    const priorityLabel = makeElement("span", "task-priority", priority.replaceAll("_", " "));
    priorityLabel.dataset.priority = priority;
    card.append(priorityLabel);
    card.append(makeElement("h4", "", text(task.title ?? task.name, "Untitled task")));

    const footer = makeElement("div", "task-footer");
    const assignedMember = members.find((member) => {
      return (member.agentId ?? member.id) === task.assigneeAgentId;
    });
    const assigneeName = text(task.assignee?.name ?? task.assignee ?? task.owner ?? assignedMember?.name ?? task.assigneeAgentId, "Unassigned");
    const assignee = makeElement("span", "task-assignee");
    assignee.append(makeElement("i", "", initials(assigneeName)));
    assignee.append(document.createTextNode(assigneeName));
    footer.append(assignee);
    footer.append(makeElement("span", "", text(task.id, "TASK")));
    card.append(footer);
    return card;
  }

  function renderKanban(tasks, members) {
    elements.kanban.replaceChildren();
    elements.taskCount.textContent = plural(tasks.length, "task");

    for (const column of columns) {
      const matchingTasks = tasks.filter((task) => normalizeTaskStatus(task.status) === column.id);
      const section = makeElement("section", "kanban-column");
      section.dataset.column = column.id;
      section.setAttribute("aria-label", `${column.label}: ${plural(matchingTasks.length, "task")}`);

      const header = makeElement("div", "kanban-header");
      header.append(makeElement("i", ""));
      header.append(document.createTextNode(column.label));
      header.append(makeElement("span", "", String(matchingTasks.length)));
      section.append(header);

      const stack = makeElement("div", "task-stack");
      if (matchingTasks.length === 0) stack.append(makeElement("div", "column-empty", "No tasks in this lane"));
      matchingTasks.forEach((task) => stack.append(renderTaskCard(task, members)));
      section.append(stack);
      elements.kanban.append(section);
    }
  }

  function eventCode(type) {
    const codes = {
      task_completed: "OK",
      task_failed: "!",
      task_cancelled: "×",
      completed: "OK",
      warning: "!",
      blocked: "!",
      agent_joined: "+A",
      agent_left: "−A",
      member_joined: "+A",
      member_started: "▶",
      member_settled: "✓",
      member_left: "−A",
      room_paused: "II",
      room_closed: "■",
      room_created: "+R",
      message_direct: "DM",
      message_broadcast: "MSG",
      task_assigned: "+T",
      system_recovered: "↻",
      message: "MSG",
    };
    return codes[type] ?? "EVT";
  }

  function renderTimeline(events, members) {
    elements.timeline.replaceChildren();
    if (events.length === 0) {
      const empty = makeElement("li", "empty-card", "No shared events have been recorded yet.");
      elements.timeline.append(empty);
      return;
    }

    const sorted = [...events].sort((a, b) => {
      return new Date(b.timestamp ?? b.at ?? b.createdAt ?? 0) - new Date(a.timestamp ?? a.at ?? a.createdAt ?? 0);
    });

    sorted.forEach((event) => {
      const type = slug(event.type ?? "event");
      const actorId = event.actorAgentId ?? event.actor_agent_id;
      const actorMember = members.find((member) => (member.agentId ?? member.id) === actorId);
      const agent = text(event.agent?.name ?? event.agent ?? event.actor ?? actorMember?.name ?? actorId, "Room system");
      const item = makeElement("li", "event");
      item.dataset.type = type;
      item.append(makeElement("time", "event-time", formatEventTime(event.timestamp ?? event.at ?? event.createdAt ?? event.created_at)));
      item.append(makeElement("span", "event-node", eventCode(type)));
      const copy = makeElement("div", "event-copy");
      copy.append(makeElement("strong", "", agent));
      copy.append(makeElement("p", "", text(event.message ?? event.description, "Event recorded")));
      item.append(copy);
      item.append(makeElement("span", "event-type", type.replaceAll("_", " ")));
      elements.timeline.append(item);
    });
  }

  function renderRoom() {
    const room = state.room;
    if (!room) return;

    const allMembers = room.members;
    const members = allMembers.filter((member) => slug(member.status) !== "removed");
    const tasks = room.tasks;
    const events = room.events;
    const online = members.filter((member) => ["leader", "starting", "working", "online"].includes(slug(member.status ?? "online"))).length;
    const inProgress = tasks.filter((task) => normalizeTaskStatus(task.status) === "in_progress").length;
    const openTasks = tasks.filter((task) => normalizeTaskStatus(task.status) !== "done").length;
    const statusLabel = room.status.replaceAll("_", " ");

    elements.breadcrumbRoom.textContent = room.name;
    elements.roomTitle.textContent = room.name;
    elements.roomObjective.textContent = room.objective;
    elements.roomUpdated.textContent = `Updated ${formatRelativeTime(room.updatedAt)}`;
    elements.roomStatus.dataset.status = room.status;
    elements.roomStatus.replaceChildren(makeElement("i", ""), document.createTextNode(statusLabel));
    elements.statAgents.textContent = String(members.length);
    elements.statAgentsNote.textContent = `${online} online`;
    elements.statTasks.textContent = String(openTasks);
    elements.statTasksNote.textContent = `${inProgress} in progress`;
    elements.statEvents.textContent = String(events.length);

    renderMembers(members, tasks);
    renderKanban(tasks, members);
    renderTimeline(events, allMembers);
    showRoom();
  }

  function selectFallbackRoom() {
    if (state.rooms.length === 0) return null;
    const fromQuery = params.get("room");
    if (fromQuery && state.rooms.some((room) => room.id === fromQuery)) return fromQuery;
    if (state.selectedRoomId && state.rooms.some((room) => room.id === state.selectedRoomId)) return state.selectedRoomId;
    return state.rooms[0].id;
  }

  async function refresh({ initial = false, announce = false, selectedOnly = false, supersede = false } = {}) {
    if (state.isRefreshing && !supersede) return;
    state.requestController?.abort();
    const controller = new AbortController();
    const requestVersion = state.requestVersion + 1;
    state.requestVersion = requestVersion;
    state.requestController = controller;
    setRefreshState(true);
    if (initial) showState("loading", "Establishing uplink", "Loading team rooms", "Reading the shared room registry and active mission state.");

    try {
      if (!selectedOnly) {
        const rooms = await loadRegistry(controller.signal);
        if (requestVersion !== state.requestVersion) return;
        state.rooms = rooms;
        if (announce) elements.announcer.textContent = `Updated ${plural(state.rooms.length, "room")}.`;
      }
      state.selectedRoomId = selectFallbackRoom();
      renderRoomList();

      if (!state.selectedRoomId) {
        state.room = null;
        showState("empty", "Registry online", "No rooms on the board", "Create or join a DSH Agent Team Room, then refresh this dashboard.");
      } else {
        const room = await loadRoom(state.selectedRoomId, controller.signal);
        if (requestVersion !== state.requestVersion) return;
        state.room = room;
        renderRoom();
      }

      state.hasLoaded = true;
      setConnection("online", demoMode ? "Demo online" : "Uplink online");
      elements.lastSync.textContent = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.error("Dashboard refresh failed:", error);
      setConnection("error", "Uplink error");
      if (!state.room || initial) {
        showState("error", "Connection interrupted", "Room telemetry unavailable", `${text(error?.message, "The dashboard could not reach the DSH room API")} Check the service and try again.`, true);
      }
      elements.announcer.textContent = "Room refresh failed. Existing telemetry remains visible.";
    } finally {
      if (requestVersion === state.requestVersion) {
        setRefreshState(false);
        schedulePoll();
      }
    }
  }

  async function selectRoom(roomId, { focusContent = false } = {}) {
    if (!roomId || roomId === state.selectedRoomId && state.room) return;
    state.selectedRoomId = roomId;
    state.room = null;
    renderRoomList();
    showState("loading", "Switching channel", "Loading room telemetry", "Syncing the latest crew, task, and event state.");
    await refresh({ selectedOnly: true, supersede: true });
    elements.announcer.textContent = `Selected ${state.room?.name ?? "room"}.`;
    if (focusContent) document.querySelector("#room-content")?.focus({ preventScroll: true });
  }

  function schedulePoll() {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = window.setTimeout(() => refresh(), POLL_INTERVAL_MS);
  }

  function visibleRoomButtons() {
    return [...elements.roomList.querySelectorAll(".room-button")];
  }

  elements.roomList.addEventListener("click", (event) => {
    const button = event.target.closest(".room-button");
    if (button) selectRoom(button.dataset.roomId);
  });

  elements.roomList.addEventListener("keydown", (event) => {
    const buttons = visibleRoomButtons();
    const currentIndex = buttons.indexOf(event.target.closest(".room-button"));
    if (currentIndex === -1) return;
    let targetIndex = null;
    if (["ArrowDown", "ArrowRight"].includes(event.key)) targetIndex = (currentIndex + 1) % buttons.length;
    if (["ArrowUp", "ArrowLeft"].includes(event.key)) targetIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    if (event.key === "Home") targetIndex = 0;
    if (event.key === "End") targetIndex = buttons.length - 1;
    if (targetIndex === null) return;
    event.preventDefault();
    buttons.forEach((button, index) => { button.tabIndex = index === targetIndex ? 0 : -1; });
    buttons[targetIndex].focus();
  });

  elements.roomFilter.addEventListener("input", renderRoomList);
  elements.roomFilter.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      const firstButton = visibleRoomButtons()[0];
      if (firstButton) {
        event.preventDefault();
        firstButton.tabIndex = 0;
        firstButton.focus();
      }
    }
    if (event.key === "Escape") {
      elements.roomFilter.value = "";
      renderRoomList();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
      event.preventDefault();
      elements.roomFilter.focus();
    }
  });

  elements.refreshButton.addEventListener("click", () => refresh({ announce: true }));
  elements.retryButton.addEventListener("click", () => refresh({ initial: true, announce: true }));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.clearTimeout(state.pollTimer);
    } else {
      refresh();
    }
  });

  elements.demoBadge.hidden = !demoMode;
  refresh({ initial: true });
})();

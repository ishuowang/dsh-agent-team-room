window.__ModuleLoader__.load({ id: 'dsh-agent-team-room', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  ROOM_FOOTER_ENTRY_ID: () => ROOM_FOOTER_ENTRY_ID,
  ROOM_FOOTER_INVITE_PROVIDER_SLOT: () => ROOM_FOOTER_INVITE_PROVIDER_SLOT,
  ROOM_HEADER_ENTRY_ID: () => ROOM_HEADER_ENTRY_ID,
  ROOM_INVITE_PROVIDER_SLOT: () => ROOM_INVITE_PROVIDER_SLOT,
  ROOM_MENTION_SOURCE_NAME: () => ROOM_MENTION_SOURCE_NAME,
  ROOM_NATIVE_API_PREFIX: () => ROOM_NATIVE_API_PREFIX,
  ROOM_VIEW_ENTRY_ID: () => ROOM_VIEW_ENTRY_ID,
  ROOM_VIEW_INVITE_PROVIDER_SLOT: () => ROOM_VIEW_INVITE_PROVIDER_SLOT,
  apply: () => apply,
  createRoomMentionSource: () => createRoomMentionSource,
  inject: () => inject,
  loadRoomSnapshot: () => loadRoomSnapshot,
  roomMentionCandidates: () => roomMentionCandidates,
  roomSnapshotUrl: () => roomSnapshotUrl
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var ROOM_HEADER_ENTRY_ID = "dsh-agent-team-room-header";
var ROOM_FOOTER_ENTRY_ID = "dsh-agent-team-room-footer";
var ROOM_VIEW_ENTRY_ID = "agent-team-room";
var ROOM_NATIVE_API_PREFIX = "/agent-team-room/api/session/";
var ROOM_INVITE_PROVIDER_SLOT = "agent-team-room.invite.provider";
var ROOM_FOOTER_INVITE_PROVIDER_SLOT = "agent-team-room.invite.provider.footer";
var ROOM_VIEW_INVITE_PROVIDER_SLOT = "agent-team-room.invite.provider.view";
var ROOM_MENTION_SOURCE_NAME = "Room members";
function mentionShortId(value) {
  return value.length <= 10 ? value : `${value.slice(0, 6)}\u2026${value.slice(-4)}`;
}
function roomMentionCandidates(snapshot, sessionId) {
  const targets = snapshot.rooms.flatMap((room) => {
    if (room.status !== "open" || room.leaderSessionId !== sessionId) return [];
    return room.members.flatMap((member) => {
      if (member.kind !== "member" || member.status === "removed" || member.connection.sessionId === sessionId) return [];
      return [{
        roomId: room.id,
        roomName: room.name,
        memberId: member.memberId,
        memberName: member.name,
        status: member.status
      }];
    });
  });
  const nameCounts = /* @__PURE__ */ new Map();
  const roomNameCounts = /* @__PURE__ */ new Map();
  for (const target of targets) {
    nameCounts.set(target.memberName, (nameCounts.get(target.memberName) ?? 0) + 1);
    const key = `${target.memberName}\0${target.roomName}`;
    roomNameCounts.set(key, (roomNameCounts.get(key) ?? 0) + 1);
  }
  return targets.map((target) => {
    const shortMemberId = mentionShortId(target.memberId);
    const duplicateName = (nameCounts.get(target.memberName) ?? 0) > 1;
    const duplicateInRoomName = (roomNameCounts.get(`${target.memberName}\0${target.roomName}`) ?? 0) > 1;
    const name = !duplicateName ? target.memberName : duplicateInRoomName ? `${target.memberName} \xB7 ${target.roomName} \xB7 ${shortMemberId}` : `${target.memberName} \xB7 ${target.roomName}`;
    const detail = `${target.roomName} \xB7 ${target.status} \xB7 ${shortMemberId}`;
    return {
      name,
      description: detail,
      hint: detail,
      roomId: target.roomId,
      roomName: target.roomName,
      memberId: target.memberId,
      memberName: target.memberName
    };
  });
}
function matchesMention(candidate, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [candidate.memberName, candidate.memberId, candidate.roomName].some((value) => value.toLocaleLowerCase().includes(needle));
}
function createRoomMentionSource(loader = loadRoomSnapshot, send = async () => {
  throw new Error("Room mention delivery is unavailable");
}) {
  const targets = /* @__PURE__ */ new WeakMap();
  const refresh = async (session, signal) => {
    const sessionId = String(session.sessionId);
    const snapshot = await loader(sessionId, signal);
    const candidates = roomMentionCandidates(snapshot, sessionId);
    for (const candidate of candidates) {
      targets.set(candidate, {
        sessionId,
        roomId: candidate.roomId,
        memberId: candidate.memberId,
        memberName: candidate.memberName
      });
    }
    return candidates;
  };
  return {
    trigger: "@",
    name: ROOM_MENTION_SOURCE_NAME,
    order: 20,
    async candidates(session, { query, position, signal }) {
      if (position !== "leading") return [];
      return (await refresh(session, signal)).filter((candidate) => matchesMention(candidate, query));
    },
    onPick({ candidate, position }) {
      const target = targets.get(candidate);
      if (!target || position !== "leading") return void 0;
      return {
        claim: {
          token: `@${target.memberName} `,
          hint: "message for this Room member",
          async submit(args) {
            const message = args.trim();
            if (!message) return { kind: "error", text: `Write a message for ${target.memberName}.` };
            try {
              await send(target.sessionId, target.roomId, target.memberId, message);
              return { kind: "success", text: `Sent to ${target.memberName}.` };
            } catch (error) {
              return {
                kind: "error",
                text: error instanceof Error ? error.message : String(error)
              };
            }
          }
        }
      };
    }
  };
}
var color = {
  panel: "var(--dsw-alias-bg-layer-1, #fff)",
  subtle: "var(--dsw-alias-bg-layer-2, #f7f7f8)",
  border: "var(--dsw-alias-border-normal, rgba(0,0,0,.1))",
  text: "var(--dsw-alias-label-primary, #171717)",
  muted: "var(--dsw-alias-label-secondary, #6b6b6b)",
  accent: "var(--dsw-alias-interactive-primary, #4d6bfe)",
  danger: "var(--dsw-alias-label-error, #d84a4a)"
};
var layoutStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  minHeight: 430,
  maxHeight: "min(70vh, 680px)",
  color: color.text
};
var cardStyle = {
  border: `1px solid ${color.border}`,
  borderRadius: 14,
  background: color.panel
};
function commandQuote(value) {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}
function roomSnapshotUrl(sessionId, roomId) {
  const base = `${ROOM_NATIVE_API_PREFIX}${encodeURIComponent(sessionId)}`;
  return roomId ? `${base}?roomId=${encodeURIComponent(roomId)}` : base;
}
async function loadRoomSnapshot(sessionId, signal, roomId) {
  const response = await fetch(roomSnapshotUrl(sessionId, roomId), {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json", "x-agent-team-room-client": "1" },
    ...signal ? { signal } : {}
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `Room snapshot failed with ${response.status}`);
  if (!Array.isArray(value.rooms)) throw new Error("Room snapshot has no rooms array");
  return { rooms: value.rooms };
}
function statusColor(status) {
  if (status === "working") return "#22a06b";
  if (status === "error") return "#d84a4a";
  if (status === "interrupted") return "#d99032";
  if (status === "removed") return "#999";
  return "#7d8aa5";
}
function shortId(value) {
  return value.length <= 16 ? value : `${value.slice(0, 8)}\u2026${value.slice(-5)}`;
}
function timelineTime(value) {
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}
function formatTimelineClock(value) {
  const time = timelineTime(value);
  return new Intl.DateTimeFormat(void 0, { hour: "2-digit", minute: "2-digit" }).format(time);
}
function Empty({ children }) {
  return (0, import_react.createElement)("div", {
    style: {
      display: "grid",
      placeItems: "center",
      minHeight: 170,
      padding: 22,
      border: `1px dashed ${color.border}`,
      borderRadius: 14,
      color: color.muted,
      textAlign: "center",
      lineHeight: 1.55
    },
    children
  });
}
function RoomsLauncher({
  sessionId,
  sessions,
  sessionsState,
  wide,
  location,
  renderInviteProviders
}) {
  const embedded = location === "view";
  const [open, setOpen] = (0, import_react.useState)(false);
  const [rooms, setRooms] = (0, import_react.useState)([]);
  const [selectedId, setSelectedId] = (0, import_react.useState)();
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)();
  const [creating, setCreating] = (0, import_react.useState)(false);
  const [attaching, setAttaching] = (0, import_react.useState)(false);
  const [roomName, setRoomName] = (0, import_react.useState)("");
  const [roomTopic, setRoomTopic] = (0, import_react.useState)("");
  const [messageText, setMessageText] = (0, import_react.useState)("");
  const [directTarget, setDirectTarget] = (0, import_react.useState)();
  const [pendingRisk, setPendingRisk] = (0, import_react.useState)();
  const [riskAcknowledged, setRiskAcknowledged] = (0, import_react.useState)(false);
  const commandInFlight = (0, import_react.useRef)(false);
  const selected = (0, import_react.useMemo)(
    () => rooms.find((room) => room.id === selectedId) ?? rooms[0],
    [rooms, selectedId]
  );
  const openRoomCount = rooms.filter((room) => room.status === "open").length;
  const connectedMemberCount = rooms.reduce((total, room) => total + room.members.filter((member) => member.kind === "member" && member.status !== "removed").length, 0);
  const ownsSelected = selected !== void 0 && selected.leaderSessionId === sessionId && selected.status === "open";
  const directMember = selected && directTarget?.roomId === selected.id ? selected.members.find((member) => member.memberId === directTarget.memberId && member.status !== "removed") : void 0;
  const catalog = sessionId ? sessionsState.subagentsByParent[sessionId] : void 0;
  const continuableChildren = (catalog?.entries ?? []).filter((entry) => entry.kind === "child" && entry.mode === "continuable");
  const attachedSessions = new Set(
    selected?.members.filter((member) => member.status !== "removed").flatMap((member) => member.connection.sessionId ? [member.connection.sessionId] : []) ?? []
  );
  const refresh = (0, import_react.useCallback)(async (signal, quiet = false) => {
    if (!sessionId) {
      setRooms([]);
      return;
    }
    if (!quiet) {
      setLoading(true);
      setError(void 0);
    }
    try {
      const snapshot = await loadRoomSnapshot(sessionId, signal, selectedId);
      setRooms(snapshot.rooms);
      setSelectedId((current) => current && snapshot.rooms.some((room) => room.id === current) ? current : snapshot.rooms[0]?.id);
    } catch (cause) {
      if (!signal?.aborted && !quiet) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!signal?.aborted && !quiet) setLoading(false);
    }
  }, [selectedId, sessionId]);
  (0, import_react.useEffect)(() => {
    if (!open && !embedded || !sessionId) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    let stopped = false;
    let timer;
    let pollController;
    const schedulePoll = () => {
      if (!embedded || stopped) return;
      timer = window.setTimeout(() => {
        pollController = new AbortController();
        void refresh(pollController.signal, true).finally(schedulePoll);
      }, 3e3);
    };
    schedulePoll();
    return () => {
      stopped = true;
      controller.abort();
      pollController?.abort();
      if (timer !== void 0) window.clearTimeout(timer);
    };
  }, [embedded, open, refresh, sessionId]);
  (0, import_react.useEffect)(() => {
    setMessageText("");
    setDirectTarget(void 0);
    setAttaching(false);
    setPendingRisk(void 0);
    setRiskAcknowledged(false);
  }, [selected?.id, sessionId]);
  const runCommand = (0, import_react.useCallback)(async (line) => {
    if (!sessionId) return;
    if (commandInFlight.current) throw new Error("Another Room operation is already in progress");
    const live = sessions.binding(sessionId)?.session;
    if (!live) throw new Error("The current Session is not materialized yet");
    commandInFlight.current = true;
    setBusy(true);
    setError(void 0);
    try {
      const result = await live.command(line);
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      if (!result.value.matched) throw new Error("The Host does not offer the /room command");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      commandInFlight.current = false;
      setBusy(false);
    }
  }, [refresh, sessionId, sessions]);
  const createRoom = async () => {
    if (!roomName.trim()) return;
    await runCommand(`/room create --name ${commandQuote(roomName)}${roomTopic.trim() ? ` --topic ${commandQuote(roomTopic)}` : ""}`);
    setCreating(false);
    setRoomName("");
    setRoomTopic("");
  };
  const attachSession = async (childId, label) => {
    if (!selected) return;
    await runCommand(
      `/room attach ${commandQuote(selected.id)} --session ${commandQuote(childId)} --name ${commandQuote(label)}`
    );
  };
  const toggleAttaching = () => {
    setAttaching((current) => {
      const next = !current;
      if (next && sessionId) void sessions.refreshSubagents(sessionId).catch(() => void 0);
      return next;
    });
  };
  const sendComposerMessage = async () => {
    if (commandInFlight.current || !selected || !ownsSelected || !messageText.trim()) return;
    if (directTarget && !directMember) throw new Error("The selected Room member is no longer available");
    const line = directMember ? `/room send ${commandQuote(selected.id)} ${commandQuote(directMember.memberId)} --message ${commandQuote(messageText)}` : `/room broadcast ${commandQuote(selected.id)} --message ${commandQuote(messageText)}`;
    await runCommand(line);
    setMessageText("");
  };
  const cancelRisk = () => {
    setPendingRisk(void 0);
    setRiskAcknowledged(false);
  };
  const confirmRisk = async () => {
    if (!pendingRisk) return;
    if (pendingRisk.kind === "remove") {
      await runCommand(`/room remove ${commandQuote(pendingRisk.roomId)} ${commandQuote(pendingRisk.memberId)}`);
    } else {
      await runCommand(`/room close ${commandQuote(pendingRisk.roomId)}`);
    }
    cancelRisk();
  };
  const openMemberSession = (room, member) => {
    const memberSessionId = member.connection.sessionId;
    if (!memberSessionId) return;
    if (memberSessionId === room.leaderSessionId) {
      sessions.open(memberSessionId);
      return;
    }
    const address = sessions.subagentAddress(memberSessionId);
    if (address) sessions.openSubagent(address);
    else sessions.openSubagent({
      parentSessionId: room.leaderSessionId,
      childSessionId: memberSessionId,
      mode: "continuable"
    });
  };
  const trigger = location === "view" ? null : location === "header" ? (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
    variant: "toolbar",
    size: "sm",
    icon: (0, import_react.createElement)(import_dsh_client_ui_primitives.IconUserOutline16, { size: 16 }),
    "aria-label": "Open Rooms",
    id: "room-header-trigger",
    disabled: !sessionId,
    onClick: () => setOpen(true),
    children: rooms.length > 0 ? String(rooms.length) : "Rooms"
  }) : (0, import_react.createElement)(import_dsh_client_ui_primitives.Tooltip, {
    label: "Open Rooms",
    side: "right",
    delayMs: 500,
    disabled: wide ?? false,
    children: (0, import_react.createElement)("button", {
      type: "button",
      "aria-label": "Open Rooms",
      id: "room-footer-trigger",
      disabled: !sessionId,
      onMouseEnter: () => void 0,
      onClick: () => setOpen(true),
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: wide ? "flex-start" : "center",
        gap: 8,
        width: wide ? "calc(100% + 8px)" : 36,
        height: wide ? 34 : 36,
        margin: wide ? "4px -4px 0" : "8px 0 0",
        padding: wide ? "6px 10px" : 0,
        border: 0,
        borderRadius: wide ? 12 : "50%",
        background: "transparent",
        color: color.text,
        cursor: sessionId ? "pointer" : "not-allowed",
        font: "inherit"
      },
      children: [
        (0, import_react.createElement)(import_dsh_client_ui_primitives.IconUserOutline16, { key: "icon", size: wide ? 16 : 18 }),
        wide ? (0, import_react.createElement)("span", { key: "label", children: "Rooms" }) : null
      ]
    })
  });
  const roomList = (0, import_react.createElement)("aside", {
    key: "room-list",
    style: {
      ...cardStyle,
      flex: embedded ? "0 1 230px" : "1 1 145px",
      minWidth: embedded ? 190 : 0,
      padding: 10,
      overflow: "auto"
    },
    children: [
      (0, import_react.createElement)("div", {
        key: "head",
        style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 10px" },
        children: [
          (0, import_react.createElement)("strong", { key: "title", style: { fontSize: 13 }, children: "Your Rooms" }),
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
            key: "create",
            variant: "toolbar",
            size: "sm",
            icon: (0, import_react.createElement)(import_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
            disabled: !sessionId || busy,
            onClick: () => setCreating(true),
            children: "New"
          })
        ]
      }),
      rooms.length === 0 ? (0, import_react.createElement)(Empty, { key: "empty", children: loading ? "Loading Rooms\u2026" : "No Room yet. Create one, then attach an existing Session." }) : (0, import_react.createElement)("div", {
        key: "rooms",
        "data-room-list": true,
        style: { display: "grid", gap: 6 },
        children: rooms.map((room) => (0, import_react.createElement)("button", {
          key: room.id,
          type: "button",
          "aria-pressed": selected?.id === room.id,
          onClick: () => setSelectedId(room.id),
          style: {
            padding: "10px 11px",
            border: `1px solid ${selected?.id === room.id ? color.accent : "transparent"}`,
            borderRadius: 11,
            background: selected?.id === room.id ? color.subtle : "transparent",
            color: color.text,
            textAlign: "left",
            cursor: "pointer"
          },
          children: [
            (0, import_react.createElement)("span", { key: "name", style: { display: "block", fontWeight: 650 }, children: room.name }),
            (0, import_react.createElement)("span", {
              key: "meta",
              style: { display: "block", marginTop: 3, color: color.muted, fontSize: 12 },
              children: `${room.members.filter((member) => member.status !== "removed").length} members \xB7 ${room.status}`
            })
          ]
        }))
      })
    ]
  });
  const memberRows = selected?.members.filter((member) => member.status !== "removed").map((member) => {
    const roleHub = member.profile?.apiVersion === "rolehub.dev/v1alpha1" && member.profile.kind === "AgentRole";
    return (0, import_react.createElement)("div", {
      key: member.memberId,
      "data-room-member": member.memberId,
      style: {
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        alignItems: "center",
        gap: 10,
        padding: "10px 0",
        borderBottom: `1px solid ${color.border}`
      },
      children: [
        (0, import_react.createElement)("span", {
          key: "dot",
          role: "img",
          title: member.status,
          "aria-label": `${member.name} status: ${member.status}`,
          style: { width: 8, height: 8, borderRadius: "50%", background: statusColor(member.status) }
        }),
        (0, import_react.createElement)("div", {
          key: "profile",
          style: { minWidth: 0 },
          children: [
            (0, import_react.createElement)("div", {
              key: "name",
              style: { display: "flex", alignItems: "center", gap: 7, fontWeight: 600 },
              children: [
                member.name,
                roleHub ? (0, import_react.createElement)("span", {
                  key: "rolehub",
                  style: {
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: "#fff1d8",
                    color: "#875500",
                    fontSize: 10,
                    fontWeight: 700
                  },
                  children: "RoleHub"
                }) : null
              ]
            }),
            (0, import_react.createElement)("div", {
              key: "meta",
              style: { marginTop: 2, color: color.muted, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" },
              children: roleHub ? `${member.profile?.id}@${member.profile?.version} \xB7 ${shortId(member.connection.sessionId || member.memberId)}` : `${member.connection.protocol} \xB7 ${shortId(member.connection.sessionId || member.memberId)}`
            })
          ]
        }),
        (0, import_react.createElement)("div", {
          key: "actions",
          style: { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 5 },
          children: [
            member.connection.sessionId ? (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
              key: "open",
              variant: "toolbar",
              size: "sm",
              icon: (0, import_react.createElement)(import_dsh_client_ui_primitives.IconLinkOutline16, { size: 14 }),
              "aria-label": `Open ${member.name}`,
              title: "Open Session",
              onClick: () => openMemberSession(selected, member)
            }) : null,
            ownsSelected && member.kind === "member" ? (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
              key: "message",
              variant: "toolbar",
              size: "sm",
              icon: (0, import_react.createElement)(import_dsh_client_ui_primitives.IconSendOutline16, { size: 14 }),
              "aria-label": `Message ${member.name}`,
              title: "Send message",
              onClick: () => setDirectTarget({ roomId: selected.id, memberId: member.memberId })
            }) : null,
            ownsSelected && member.kind === "member" ? (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
              key: "remove",
              variant: "toolbar",
              size: "sm",
              icon: (0, import_react.createElement)(import_dsh_client_ui_primitives.IconCloseOutline16, { size: 14 }),
              "aria-label": `Remove ${member.name}`,
              title: "Remove member",
              disabled: busy,
              onClick: () => {
                setRiskAcknowledged(false);
                setPendingRisk({
                  kind: "remove",
                  roomId: selected.id,
                  memberId: member.memberId,
                  memberName: member.name
                });
              }
            }) : null
          ]
        })
      ]
    });
  });
  const attachPanel = attaching && ownsSelected && selected ? (0, import_react.createElement)("div", {
    key: "attach-panel",
    id: `room-attach-${selected.id}`,
    "data-room-invite": true,
    style: { marginTop: 10, padding: 12, borderRadius: 12, background: color.subtle },
    children: [
      (0, import_react.createElement)("div", {
        key: "providers",
        "data-room-invite-providers": true,
        style: { display: "grid", gap: 8, marginBottom: 10 },
        children: renderInviteProviders({
          sessionId: sessionId ?? selected.leaderSessionId,
          roomId: selected.id,
          roomName: selected.name,
          disabled: busy,
          onAttached: () => {
            void refresh();
          }
        })
      }),
      (0, import_react.createElement)("div", {
        key: "title",
        style: { fontWeight: 650, fontSize: 13 },
        children: "Existing continuable child Sessions"
      }),
      (0, import_react.createElement)("div", {
        key: "help",
        style: { margin: "4px 0 10px", color: color.muted, fontSize: 12, lineHeight: 1.45 },
        children: "Room never injects a role. A RoleHub bridge prepares and verifies a role Session before attaching it here."
      }),
      continuableChildren.filter((child) => child.kind === "child" && !attachedSessions.has(child.id)).length === 0 ? (0, import_react.createElement)("div", { key: "empty", style: { color: color.muted, fontSize: 12 }, children: "No unattached child Session is available." }) : continuableChildren.filter((child) => child.kind === "child" && !attachedSessions.has(child.id)).map((child) => child.kind === "child" ? (0, import_react.createElement)("div", {
        key: child.id,
        style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 0" },
        children: [
          (0, import_react.createElement)("span", { key: "label", style: { fontSize: 12 }, children: `${child.label} \xB7 ${shortId(child.id)}` }),
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
            key: "attach",
            variant: "primary",
            size: "sm",
            disabled: busy,
            onClick: () => void attachSession(child.id, child.label).catch(() => void 0),
            children: "Attach"
          })
        ]
      }) : null)
    ]
  }) : null;
  const detail = selected ? (0, import_react.createElement)("section", {
    key: "room-detail",
    style: {
      ...cardStyle,
      flex: embedded ? "1 1 440px" : "2 1 300px",
      minWidth: 0,
      padding: embedded ? 20 : 16,
      overflow: "auto"
    },
    children: [
      (0, import_react.createElement)("header", {
        key: "header",
        style: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
        children: [
          (0, import_react.createElement)("div", {
            key: "copy",
            children: [
              (0, import_react.createElement)("h3", { key: "name", style: { margin: 0, fontSize: 18 }, children: selected.name }),
              (0, import_react.createElement)("p", {
                key: "topic",
                style: { margin: "5px 0 0", color: color.muted, fontSize: 13 },
                children: selected.topic || "A neutral Room for connected members and Sessions."
              })
            ]
          }),
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
            key: "refresh",
            variant: "toolbar",
            size: "sm",
            icon: (0, import_react.createElement)(import_dsh_client_ui_primitives.IconRefreshOutline16, { size: 14 }),
            "aria-label": "Refresh Room",
            title: "Refresh Room",
            disabled: loading,
            onClick: () => void refresh()
          })
        ]
      }),
      (0, import_react.createElement)("div", {
        key: "members-head",
        style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 },
        children: [
          (0, import_react.createElement)("strong", { key: "label", style: { fontSize: 13 }, children: "Members" }),
          ownsSelected ? (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
            key: "attach",
            variant: "outline",
            size: "sm",
            icon: (0, import_react.createElement)(import_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
            "aria-expanded": attaching,
            "aria-controls": `room-attach-${selected.id}`,
            onClick: toggleAttaching,
            children: "Attach Session"
          }) : null
        ]
      }),
      attachPanel,
      (0, import_react.createElement)("div", { key: "members", style: { marginTop: 5 }, children: memberRows }),
      directMember && ownsSelected ? (0, import_react.createElement)("div", {
        key: "direct",
        style: { display: "flex", gap: 8, marginTop: 14 },
        children: [
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Input, {
            key: "input",
            value: messageText,
            "aria-label": "Direct message",
            placeholder: `Message ${directMember.name}\u2026`,
            onChange: (event) => setMessageText(event.currentTarget.value),
            style: { flex: 1 }
          }),
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
            key: "send",
            variant: "primary",
            disabled: busy || !messageText.trim(),
            onClick: () => void sendComposerMessage().catch(() => void 0),
            children: "Send"
          }),
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
            key: "cancel",
            variant: "ghost",
            onClick: () => {
              setDirectTarget(void 0);
              setMessageText("");
            },
            children: "Cancel"
          })
        ]
      }) : null,
      ownsSelected && !directMember ? (0, import_react.createElement)("div", {
        key: "broadcast",
        style: { display: "flex", gap: 8, marginTop: 14 },
        children: [
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Input, {
            key: "input",
            value: messageText,
            "aria-label": "Broadcast message",
            placeholder: "Broadcast to every member\u2026",
            onChange: (event) => setMessageText(event.currentTarget.value),
            style: { flex: 1 }
          }),
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
            key: "send",
            variant: "primary",
            icon: (0, import_react.createElement)(import_dsh_client_ui_primitives.IconSendOutline16, { size: 14 }),
            "aria-label": "Broadcast message",
            title: "Broadcast message",
            disabled: busy || !messageText.trim() || selected.members.filter((member) => member.kind === "member" && member.status !== "removed").length === 0,
            onClick: () => void sendComposerMessage().catch(() => void 0)
          })
        ]
      }) : null,
      selected.status === "open" && selected.leaderSessionId !== sessionId ? (0, import_react.createElement)("div", {
        key: "owner-note",
        style: { marginTop: 14, padding: 10, borderRadius: 10, background: color.subtle, color: color.muted, fontSize: 12 },
        children: "Membership is visible here. Open the leader Session to manage this Room."
      }) : null,
      ownsSelected ? (0, import_react.createElement)("div", {
        key: "danger",
        style: { display: "flex", justifyContent: "flex-end", marginTop: 18 },
        children: (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
          variant: "ghost",
          size: "sm",
          disabled: busy,
          style: { color: color.danger },
          onClick: () => {
            setRiskAcknowledged(false);
            setPendingRisk({ kind: "close", roomId: selected.id, roomName: selected.name });
          },
          children: "Close Room"
        })
      }) : null
    ]
  }) : (0, import_react.createElement)(Empty, { key: "room-detail-empty", children: "Select a Room or create a new one." });
  const roomTimeline = selected ? [
    ...(selected.activity ?? []).filter((activity) => !activity.relayId || (activity.failedCount ?? 0) > 0 || !(selected.conversation?.messages.some((message) => message.relayId === activity.relayId) ?? false)).map((activity) => ({
      kind: "activity",
      id: `activity:${activity.id}`,
      at: timelineTime(activity.at),
      activity
    })),
    ...(selected.conversation?.messages ?? []).map((message) => ({
      kind: "message",
      id: `message:${message.id}`,
      at: message.at,
      message
    }))
  ].sort((left, right) => left.at - right.at || left.id.localeCompare(right.id, "en")) : [];
  const hasLegacyDeliveries = selected?.activity?.some((activity) => (activity.type === "message.direct" || activity.type === "message.broadcast") && activity.relayId === void 0) ?? false;
  const timelineRows = selected ? roomTimeline.map((item) => {
    if (item.kind === "activity") {
      return (0, import_react.createElement)("div", {
        key: item.id,
        "data-room-activity": item.activity.type,
        role: "status",
        style: {
          alignSelf: "center",
          maxWidth: "92%",
          padding: "4px 9px",
          borderRadius: 999,
          background: color.subtle,
          color: color.muted,
          fontSize: 11,
          textAlign: "center"
        },
        children: `${item.activity.label} \xB7 ${formatTimelineClock(item.at)}`
      });
    }
    const message = item.message;
    const recipients = message.recipientMemberIds.flatMap((memberId) => {
      const member2 = selected.members.find((candidate) => candidate.memberId === memberId);
      return member2 ? [member2.name] : [];
    });
    const fromLeader = message.role === "leader";
    const member = selected.members.find((candidate) => candidate.memberId === message.authorMemberId);
    const relayActivity = message.relayId ? selected.activity?.find((activity) => activity.relayId === message.relayId) : void 0;
    const broadcastRecipient = message.mode === "broadcast" ? (relayActivity?.failedCount ?? 0) > 0 ? `${recipients.join(", ") || `${relayActivity?.acceptedCount ?? 0} member(s)`} accepted \xB7 ${relayActivity?.failedCount} failed` : "Everyone" : recipients.join(", ") || "Member";
    const deliveryLabel = fromLeader ? `${message.authorName} \u2192 ${broadcastRecipient}` : message.authorName;
    return (0, import_react.createElement)("article", {
      key: item.id,
      "data-room-message": message.id,
      "data-room-message-role": message.role,
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: fromLeader ? "flex-end" : "flex-start",
        gap: 4
      },
      children: [
        (0, import_react.createElement)("div", {
          key: "meta",
          style: { display: "flex", alignItems: "center", gap: 7, color: color.muted, fontSize: 11 },
          children: [
            (0, import_react.createElement)("span", { key: "name", children: deliveryLabel }),
            (0, import_react.createElement)("time", {
              key: "time",
              dateTime: new Date(message.at).toISOString(),
              children: formatTimelineClock(message.at)
            }),
            !fromLeader && member?.connection.sessionId ? (0, import_react.createElement)("button", {
              key: "open",
              type: "button",
              onClick: () => openMemberSession(selected, member),
              style: {
                padding: 0,
                border: 0,
                background: "transparent",
                color: color.accent,
                cursor: "pointer",
                font: "inherit"
              },
              children: "Open Session"
            }) : null
          ]
        }),
        (0, import_react.createElement)("div", {
          key: "bubble",
          style: {
            maxWidth: "min(78%, 720px)",
            padding: "10px 13px",
            border: `1px solid ${fromLeader ? "transparent" : color.border}`,
            borderRadius: fromLeader ? "14px 4px 14px 14px" : "4px 14px 14px",
            background: fromLeader ? color.accent : color.panel,
            color: fromLeader ? "#fff" : color.text,
            boxShadow: fromLeader ? "0 5px 16px rgba(77, 107, 254, .18)" : "none",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            lineHeight: 1.55,
            fontSize: 14
          },
          children: message.text
        })
      ]
    });
  }) : [];
  const activeMembers = selected?.members.filter((member) => member.kind === "member" && member.status !== "removed") ?? [];
  const invalidDirectTarget = directTarget !== void 0 && selected?.id === directTarget.roomId && directMember === void 0;
  const canSendMessage = ownsSelected && !busy && messageText.trim().length > 0 && !invalidDirectTarget && (directMember !== void 0 || activeMembers.length > 0);
  const conversationDetail = selected ? (0, import_react.createElement)("section", {
    key: "room-conversation",
    "data-room-chat": selected.id,
    style: {
      ...cardStyle,
      display: "flex",
      flexWrap: "wrap",
      flex: "1 1 620px",
      minWidth: 0,
      minHeight: 560,
      overflow: "hidden"
    },
    children: [
      (0, import_react.createElement)("div", {
        key: "conversation",
        style: { display: "flex", flex: "3 1 430px", minWidth: 0, flexDirection: "column" },
        children: [
          (0, import_react.createElement)("header", {
            key: "header",
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              padding: "16px 18px 14px",
              borderBottom: `1px solid ${color.border}`
            },
            children: [
              (0, import_react.createElement)("div", {
                key: "copy",
                style: { minWidth: 0 },
                children: [
                  (0, import_react.createElement)("h3", { key: "name", style: { margin: 0, fontSize: 18 }, children: selected.name }),
                  (0, import_react.createElement)("p", {
                    key: "topic",
                    style: { margin: "4px 0 0", color: color.muted, fontSize: 12, lineHeight: 1.45 },
                    children: selected.topic || "Connected Sessions share Room-addressed messages while keeping independent context."
                  })
                ]
              }),
              (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
                key: "refresh",
                variant: "toolbar",
                size: "sm",
                icon: (0, import_react.createElement)(import_dsh_client_ui_primitives.IconRefreshOutline16, { size: 14 }),
                "aria-label": "Refresh Room conversation",
                title: "Refresh conversation",
                disabled: loading,
                onClick: () => void refresh()
              })
            ]
          }),
          (0, import_react.createElement)("div", {
            key: "timeline",
            "data-room-message-list": true,
            role: "log",
            "aria-label": `${selected.name} conversation`,
            "aria-live": "polite",
            style: {
              display: "flex",
              flex: "1 1 auto",
              minHeight: "clamp(220px, 34vh, 360px)",
              maxHeight: "min(44vh, 520px)",
              flexDirection: "column",
              gap: 13,
              padding: "18px clamp(14px, 2vw, 24px)",
              overflow: "auto",
              background: "var(--dsw-alias-bg-base, #fafafa)"
            },
            children: [
              (selected.conversation?.messages.length ?? 0) === 0 ? (0, import_react.createElement)(Empty, {
                key: "empty",
                children: hasLegacyDeliveries ? "This Room contains legacy delivery metadata, but those message bodies predate safe relay correlation. Open the backing Sessions to inspect them." : "No Room messages yet. Choose Everyone or one member below and start the conversation."
              }) : null,
              ...timelineRows,
              ...activeMembers.filter((member) => member.status === "working").map((member) => (0, import_react.createElement)("div", {
                key: `working:${member.memberId}`,
                "data-room-member-working": member.memberId,
                style: { alignSelf: "flex-start", color: color.muted, fontSize: 12 },
                children: `${member.name} is working\u2026`
              })),
              (selected.conversation?.hiddenMixedReplyCount ?? 0) > 0 ? (0, import_react.createElement)("div", {
                key: "mixed-warning",
                role: "note",
                style: { alignSelf: "center", color: color.muted, fontSize: 11, textAlign: "center" },
                children: `${selected.conversation?.hiddenMixedReplyCount} mixed-Room repl${selected.conversation?.hiddenMixedReplyCount === 1 ? "y remains" : "ies remain"} in the backing Session to prevent cross-Room leakage.`
              }) : null,
              (selected.conversation?.unavailableMemberIds.length ?? 0) > 0 ? (0, import_react.createElement)("div", {
                key: "unavailable-warning",
                role: "note",
                style: { alignSelf: "center", color: color.muted, fontSize: 11, textAlign: "center" },
                children: `${selected.conversation?.unavailableMemberIds.length} member transcript${selected.conversation?.unavailableMemberIds.length === 1 ? " is" : "s are"} unavailable; delivery controls still work.`
              }) : null
            ]
          }),
          ownsSelected ? (0, import_react.createElement)("div", {
            key: "composer",
            "data-room-composer": true,
            style: { padding: "12px 14px 14px", borderTop: `1px solid ${color.border}`, background: color.panel },
            children: [
              (0, import_react.createElement)("div", {
                key: "recipients",
                "aria-label": "Room message recipient",
                style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 9 },
                children: [
                  (0, import_react.createElement)("span", { key: "label", style: { color: color.muted, fontSize: 11 }, children: "To" }),
                  (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
                    key: "everyone",
                    variant: directMember ? "ghost" : "outline",
                    size: "sm",
                    "aria-pressed": directMember === void 0 && !invalidDirectTarget,
                    onClick: () => setDirectTarget(void 0),
                    children: "Everyone"
                  }),
                  ...activeMembers.map((member) => (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
                    key: member.memberId,
                    variant: directMember?.memberId === member.memberId ? "outline" : "ghost",
                    size: "sm",
                    "aria-pressed": directMember?.memberId === member.memberId,
                    onClick: () => setDirectTarget({ roomId: selected.id, memberId: member.memberId }),
                    children: member.name
                  }))
                ]
              }),
              invalidDirectTarget ? (0, import_react.createElement)("div", {
                key: "invalid-target",
                role: "alert",
                style: { marginBottom: 7, color: color.danger, fontSize: 11 },
                children: "That member is no longer available. Choose another recipient."
              }) : null,
              (0, import_react.createElement)("div", {
                key: "input-row",
                style: { display: "flex", alignItems: "flex-end", gap: 8 },
                children: [
                  (0, import_react.createElement)("textarea", {
                    key: "input",
                    value: messageText,
                    rows: 2,
                    "aria-label": directMember ? `Message ${directMember.name}` : "Message everyone in Room",
                    placeholder: directMember ? `Message ${directMember.name}\u2026` : "Message everyone in this Room\u2026",
                    onChange: (event) => setMessageText(event.currentTarget.value),
                    onKeyDown: (event) => {
                      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                      event.preventDefault();
                      if (canSendMessage) void sendComposerMessage().catch(() => void 0);
                    },
                    style: {
                      flex: 1,
                      minHeight: 44,
                      maxHeight: 150,
                      resize: "vertical",
                      padding: "10px 12px",
                      border: `1px solid ${color.border}`,
                      borderRadius: 12,
                      background: color.subtle,
                      color: color.text,
                      font: "inherit",
                      lineHeight: 1.45,
                      outline: "none"
                    }
                  }),
                  (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
                    key: "send",
                    variant: "primary",
                    icon: (0, import_react.createElement)(import_dsh_client_ui_primitives.IconSendOutline16, { size: 15 }),
                    "aria-label": directMember ? `Send to ${directMember.name}` : "Broadcast to Room",
                    title: "Send message",
                    disabled: busy || !canSendMessage,
                    onClick: () => void sendComposerMessage().catch(() => void 0)
                  })
                ]
              }),
              (0, import_react.createElement)("div", {
                key: "hint",
                style: { marginTop: 6, color: color.muted, fontSize: 10 },
                children: "Enter to send \xB7 Shift+Enter for a new line"
              })
            ]
          }) : (0, import_react.createElement)("div", {
            key: "owner-note",
            style: { padding: 12, borderTop: `1px solid ${color.border}`, color: color.muted, fontSize: 12 },
            children: "Open the leader Session to send messages or change Room membership."
          })
        ]
      }),
      (0, import_react.createElement)("aside", {
        key: "members",
        "data-room-members-panel": true,
        style: {
          flex: "1 1 240px",
          minWidth: 220,
          maxWidth: 340,
          padding: 14,
          borderLeft: `1px solid ${color.border}`,
          overflow: "auto",
          background: color.panel
        },
        children: [
          (0, import_react.createElement)("div", {
            key: "head",
            style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
            children: [
              (0, import_react.createElement)("strong", { key: "title", style: { fontSize: 13 }, children: `Members \xB7 ${activeMembers.length + 1}` }),
              ownsSelected ? (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
                key: "attach",
                variant: "outline",
                size: "sm",
                icon: (0, import_react.createElement)(import_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }),
                "aria-expanded": attaching,
                "aria-controls": `room-attach-${selected.id}`,
                onClick: toggleAttaching,
                children: "Attach"
              }) : null
            ]
          }),
          attachPanel,
          (0, import_react.createElement)("div", { key: "rows", style: { marginTop: 8 }, children: memberRows }),
          ownsSelected ? (0, import_react.createElement)("div", {
            key: "danger",
            style: { display: "flex", justifyContent: "flex-end", marginTop: 14 },
            children: (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
              variant: "ghost",
              size: "sm",
              disabled: busy,
              style: { color: color.danger },
              onClick: () => {
                setRiskAcknowledged(false);
                setPendingRisk({ kind: "close", roomId: selected.id, roomName: selected.name });
              },
              children: "Close Room"
            })
          }) : null
        ]
      })
    ]
  }) : (0, import_react.createElement)(Empty, { key: "room-conversation-empty", children: "Select a Room or create a new one." });
  const createForm = creating ? (0, import_react.createElement)("div", {
    key: "create-room",
    style: { display: "grid", gap: 10, padding: 12, marginBottom: 12, borderRadius: 12, background: color.subtle },
    children: [
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Input, {
        key: "name",
        value: roomName,
        "aria-label": "Room name",
        placeholder: "Room name",
        autoFocus: true,
        onChange: (event) => setRoomName(event.currentTarget.value)
      }),
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Input, {
        key: "topic",
        value: roomTopic,
        "aria-label": "Room topic",
        placeholder: "Topic (optional)",
        onChange: (event) => setRoomTopic(event.currentTarget.value)
      }),
      (0, import_react.createElement)("div", {
        key: "actions",
        style: { display: "flex", justifyContent: "flex-end", gap: 8 },
        children: [
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, { key: "cancel", variant: "ghost", onClick: () => setCreating(false), children: "Cancel" }),
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
            key: "create",
            variant: "primary",
            disabled: busy || !roomName.trim(),
            onClick: () => void createRoom().catch(() => void 0),
            children: "Create Room"
          })
        ]
      })
    ]
  }) : null;
  const errorAlert = error ? (0, import_react.createElement)("div", {
    key: "error",
    role: "alert",
    style: {
      marginBottom: 10,
      padding: "9px 11px",
      borderRadius: 10,
      background: "#fff0f0",
      color: color.danger,
      fontSize: 12
    },
    children: error
  }) : null;
  const workspace = (0, import_react.createElement)("div", {
    key: "layout",
    "data-room-workspace": true,
    style: embedded ? { ...layoutStyle, minHeight: 0, maxHeight: "none", flex: "0 0 auto", alignItems: "stretch" } : layoutStyle,
    children: [roomList, embedded ? conversationDetail : detail]
  });
  const riskConfirmation = (0, import_react.createElement)(import_dsh_client_ui_primitives.RiskConfirmation, {
    key: "risk-confirmation",
    open: pendingRisk !== void 0,
    title: pendingRisk?.kind === "remove" ? "Remove Room member?" : "Close this Room?",
    description: pendingRisk?.kind === "remove" ? `This detaches ${pendingRisk.memberName} and asks its provider to interrupt active work. The backing Session or transport is not deleted.` : `This closes ${pendingRisk?.roomName ?? "the Room"} and asks member providers to interrupt active work. A closed Room cannot be reopened.`,
    acknowledgeLabel: pendingRisk?.kind === "remove" ? "I understand this member will be detached." : "I understand this Room will be closed.",
    cancelLabel: "Cancel",
    confirmLabel: pendingRisk?.kind === "remove" ? "Remove member" : "Close Room",
    acknowledged: riskAcknowledged,
    disabled: busy,
    onAcknowledgedChange: setRiskAcknowledged,
    onCancel: cancelRisk,
    onConfirm: () => void confirmRisk().catch(() => void 0)
  });
  if (embedded) {
    return (0, import_react.createElement)("section", {
      "data-room-conversation-view": true,
      "aria-label": "Room conversation",
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "auto",
        padding: "18px clamp(14px, 3vw, 30px) clamp(120px, 16vh, 170px)",
        boxSizing: "border-box",
        color: color.text
      },
      children: [
        (0, import_react.createElement)("header", {
          key: "view-header",
          style: {
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12
          },
          children: [
            (0, import_react.createElement)("div", {
              key: "copy",
              children: [
                (0, import_react.createElement)("div", {
                  key: "eyebrow",
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    color: color.accent,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: ".04em",
                    textTransform: "uppercase"
                  },
                  children: [
                    (0, import_react.createElement)(import_dsh_client_ui_primitives.IconUserOutline16, { key: "icon", size: 16 }),
                    (0, import_react.createElement)("span", { key: "label", children: "Agent Team Room" })
                  ]
                }),
                (0, import_react.createElement)("h2", {
                  key: "title",
                  style: { margin: "7px 0 0", fontSize: 24, lineHeight: 1.2 },
                  children: "One Room, many independent Sessions"
                }),
                (0, import_react.createElement)("p", {
                  key: "description",
                  style: { maxWidth: 650, margin: "7px 0 0", color: color.muted, fontSize: 13, lineHeight: 1.55 },
                  children: "Read Room-addressed messages and member replies in one timeline, choose who to message, and open any backing Session without leaving DSH."
                })
              ]
            }),
            (0, import_react.createElement)("div", {
              key: "stats",
              "data-room-view-stats": true,
              style: { display: "flex", flexWrap: "wrap", gap: 7 },
              children: [
                (0, import_react.createElement)("span", {
                  key: "rooms",
                  style: { ...cardStyle, padding: "7px 10px", color: color.muted, fontSize: 12 },
                  children: `${openRoomCount} open Room${openRoomCount === 1 ? "" : "s"}`
                }),
                (0, import_react.createElement)("span", {
                  key: "members",
                  style: { ...cardStyle, padding: "7px 10px", color: color.muted, fontSize: 12 },
                  children: `${connectedMemberCount} connected member${connectedMemberCount === 1 ? "" : "s"}`
                })
              ]
            })
          ]
        }),
        errorAlert,
        createForm,
        workspace,
        riskConfirmation
      ]
    });
  }
  return (0, import_react.createElement)("span", {
    children: [
      trigger,
      (0, import_react.createElement)(import_dsh_client_ui_primitives.Modal, {
        key: "modal",
        open,
        onClose: () => setOpen(false),
        title: "Rooms",
        description: "Connect independent Sessions through provider-backed members. Roles and policies stay external.",
        children: (0, import_react.createElement)("div", {
          style: { width: "100%", maxWidth: "100%" },
          children: [
            errorAlert,
            createForm,
            workspace
          ]
        })
      }),
      riskConfirmation
    ]
  });
}
var inject = ["slots", "sessions", "inputTriggers"];
function apply(ctx) {
  const sessions = ctx.get("sessions");
  const inputTriggers = ctx.get("inputTriggers");
  if (!inputTriggers) throw new Error("agent-team-room: native inputTriggers service is unavailable");
  ctx.effect(
    () => inputTriggers.registerSource(createRoomMentionSource(loadRoomSnapshot, async (sessionId, roomId, memberId, message) => {
      const live = sessions.binding(sessionId)?.session;
      if (!live) throw new Error("The current Session is not materialized yet");
      const result = await live.command(
        `/room send ${commandQuote(roomId)} ${commandQuote(memberId)} --message ${commandQuote(message)}`
      );
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      if (!result.value.matched) throw new Error("The Host does not offer the /room command");
    })),
    "agent-team-room: @ member source"
  );
  ctx.slots.inject("conversation.view", () => ctx.slots.register({
    name: "conversation.view",
    id: ROOM_VIEW_ENTRY_ID,
    order: 5,
    label: "Room",
    children: {
      [ROOM_VIEW_INVITE_PROVIDER_SLOT]: { kind: "list", scope: "session" }
    }
  }, (props) => {
    const sessionsState = props.useSessions((value) => value);
    return (0, import_react.createElement)(RoomsLauncher, {
      sessionId: props.sessionId,
      sessions,
      sessionsState,
      location: "view",
      renderInviteProviders: (owner) => props.renderSlot(ROOM_VIEW_INVITE_PROVIDER_SLOT, owner)
    });
  }));
  ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
    name: "conversation.session.header.actions",
    id: ROOM_HEADER_ENTRY_ID,
    order: 20,
    children: {
      [ROOM_INVITE_PROVIDER_SLOT]: { kind: "list", scope: "session" }
    }
  }, (props) => {
    const sessionsState = props.useSessions((value) => value);
    return (0, import_react.createElement)(RoomsLauncher, {
      sessionId: props.sessionId,
      sessions,
      sessionsState,
      location: "header",
      renderInviteProviders: (owner) => props.renderSlot(ROOM_INVITE_PROVIDER_SLOT, owner)
    });
  }));
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: ROOM_FOOTER_ENTRY_ID,
    order: 20,
    children: {
      [ROOM_FOOTER_INVITE_PROVIDER_SLOT]: { kind: "list", scope: "session" }
    }
  }, (props) => {
    const sessionsState = props.useSessions((value) => value);
    return (0, import_react.createElement)(RoomsLauncher, {
      sessionId: sessionsState.current,
      sessions,
      sessionsState,
      wide: props.wide,
      location: "footer",
      renderInviteProviders: (owner) => props.renderSlot(ROOM_FOOTER_INVITE_PROVIDER_SLOT, owner)
    });
  }));
}
return module.exports; } });
//# sourceMappingURL=client.js.map

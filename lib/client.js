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
var ROOM_NATIVE_API_PREFIX = "/agent-team-room/api/session/";
var ROOM_INVITE_PROVIDER_SLOT = "agent-team-room.invite.provider";
var ROOM_FOOTER_INVITE_PROVIDER_SLOT = "agent-team-room.invite.provider.footer";
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
function roomSnapshotUrl(sessionId) {
  return `${ROOM_NATIVE_API_PREFIX}${encodeURIComponent(sessionId)}`;
}
async function loadRoomSnapshot(sessionId, signal) {
  const response = await fetch(roomSnapshotUrl(sessionId), {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
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
  const [broadcastText, setBroadcastText] = (0, import_react.useState)("");
  const [directTarget, setDirectTarget] = (0, import_react.useState)();
  const [directText, setDirectText] = (0, import_react.useState)("");
  const [pendingRisk, setPendingRisk] = (0, import_react.useState)();
  const [riskAcknowledged, setRiskAcknowledged] = (0, import_react.useState)(false);
  const selected = (0, import_react.useMemo)(
    () => rooms.find((room) => room.id === selectedId) ?? rooms[0],
    [rooms, selectedId]
  );
  const ownsSelected = selected !== void 0 && selected.leaderSessionId === sessionId && selected.status === "open";
  const catalog = sessionId ? sessionsState.subagentsByParent[sessionId] : void 0;
  const continuableChildren = (catalog?.entries ?? []).filter((entry) => entry.kind === "child" && entry.mode === "continuable");
  const attachedSessions = new Set(
    selected?.members.filter((member) => member.status !== "removed").flatMap((member) => member.connection.sessionId ? [member.connection.sessionId] : []) ?? []
  );
  const refresh = (0, import_react.useCallback)(async (signal) => {
    if (!sessionId) {
      setRooms([]);
      return;
    }
    setLoading(true);
    setError(void 0);
    try {
      const snapshot = await loadRoomSnapshot(sessionId, signal);
      setRooms(snapshot.rooms);
      setSelectedId((current) => current && snapshot.rooms.some((room) => room.id === current) ? current : snapshot.rooms[0]?.id);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [sessionId]);
  (0, import_react.useEffect)(() => {
    if (!open || !sessionId) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    sessions.setSubagentCatalogOpen(sessionId, true);
    void sessions.refreshSubagents(sessionId).catch(() => void 0);
    return () => {
      controller.abort();
      sessions.setSubagentCatalogOpen(sessionId, false);
    };
  }, [open, refresh, sessionId, sessions]);
  const runCommand = (0, import_react.useCallback)(async (line) => {
    if (!sessionId) return;
    const live = sessions.binding(sessionId)?.session;
    if (!live) throw new Error("The current Session is not materialized yet");
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
  const trigger = location === "header" ? (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
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
    style: { ...cardStyle, flex: "1 1 145px", minWidth: 0, padding: 10, overflow: "auto" },
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
              onClick: () => setDirectTarget(member.memberId)
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
  const detail = selected ? (0, import_react.createElement)("section", {
    style: { ...cardStyle, flex: "2 1 300px", minWidth: 0, padding: 16, overflow: "auto" },
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
            onClick: () => setAttaching((value) => !value),
            children: "Attach Session"
          }) : null
        ]
      }),
      attaching && ownsSelected ? (0, import_react.createElement)("div", {
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
      }) : null,
      (0, import_react.createElement)("div", { key: "members", style: { marginTop: 5 }, children: memberRows }),
      directTarget && ownsSelected ? (0, import_react.createElement)("div", {
        key: "direct",
        style: { display: "flex", gap: 8, marginTop: 14 },
        children: [
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Input, {
            key: "input",
            value: directText,
            "aria-label": "Direct message",
            placeholder: "Message this member\u2026",
            onChange: (event) => setDirectText(event.currentTarget.value),
            style: { flex: 1 }
          }),
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
            key: "send",
            variant: "primary",
            disabled: busy || !directText.trim(),
            onClick: () => void runCommand(
              `/room send ${commandQuote(selected.id)} ${commandQuote(directTarget)} --message ${commandQuote(directText)}`
            ).then(() => {
              setDirectText("");
              setDirectTarget(void 0);
            }).catch(() => void 0),
            children: "Send"
          })
        ]
      }) : null,
      ownsSelected ? (0, import_react.createElement)("div", {
        key: "broadcast",
        style: { display: "flex", gap: 8, marginTop: 14 },
        children: [
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Input, {
            key: "input",
            value: broadcastText,
            "aria-label": "Broadcast message",
            placeholder: "Broadcast to every member\u2026",
            onChange: (event) => setBroadcastText(event.currentTarget.value),
            style: { flex: 1 }
          }),
          (0, import_react.createElement)(import_dsh_client_ui_primitives.Button, {
            key: "send",
            variant: "primary",
            icon: (0, import_react.createElement)(import_dsh_client_ui_primitives.IconSendOutline16, { size: 14 }),
            "aria-label": "Broadcast message",
            title: "Broadcast message",
            disabled: busy || !broadcastText.trim() || selected.members.filter((member) => member.kind === "member" && member.status !== "removed").length === 0,
            onClick: () => void runCommand(
              `/room broadcast ${commandQuote(selected.id)} --message ${commandQuote(broadcastText)}`
            ).then(() => setBroadcastText("")).catch(() => void 0)
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
  }) : (0, import_react.createElement)(Empty, { children: "Select a Room or create a new one." });
  const createForm = creating ? (0, import_react.createElement)("div", {
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
            error ? (0, import_react.createElement)("div", {
              key: "error",
              role: "alert",
              style: { marginBottom: 10, padding: "9px 11px", borderRadius: 10, background: "#fff0f0", color: color.danger, fontSize: 12 },
              children: error
            }) : null,
            createForm,
            (0, import_react.createElement)("div", { key: "layout", style: layoutStyle, children: [roomList, detail] })
          ]
        })
      }),
      (0, import_react.createElement)(import_dsh_client_ui_primitives.RiskConfirmation, {
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
      })
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

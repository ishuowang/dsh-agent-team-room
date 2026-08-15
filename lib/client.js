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
  ROOM_DASHBOARD_PATH: () => ROOM_DASHBOARD_PATH,
  ROOM_FOOTER_ENTRY_ID: () => ROOM_FOOTER_ENTRY_ID,
  ROOM_TEMPLATE_OPTIONS: () => ROOM_TEMPLATE_OPTIONS,
  RoomsFooterAction: () => RoomsFooterAction,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var ROOM_DASHBOARD_PATH = "/agent-team-room/";
var ROOM_FOOTER_ENTRY_ID = "dsh-agent-team-room";
var ROOM_TEMPLATE_OPTIONS = Object.freeze([
  { id: "opc", label: "One-Person Company", detail: "Chief of Staff, finance, legal, operations, R&D, growth, and customer success", agentCount: 7 },
  { id: "deep-research", label: "Deep Research", detail: "Parallel evidence gathering, source criticism, and cited synthesis", agentCount: 6 },
  { id: "software-delivery", label: "Software Delivery", detail: "Plan, explore, implement, test, review, and ship", agentCount: 6 },
  { id: "incident-response", label: "Incident Response", detail: "Triage, mitigate, investigate, communicate, and verify recovery", agentCount: 5 },
  { id: "customer-support", label: "Customer Support", detail: "Triage and hand off account, billing, technical, and policy cases", agentCount: 5 },
  { id: "content-campaign", label: "Content Campaign", detail: "Research, strategy, channel copy, editing, and distribution", agentCount: 6 },
  { id: "plan-execute-review", label: "Plan \xB7 Execute \xB7 Review", detail: "A reusable planner, parallel workers, critic, and synthesizer loop", agentCount: 5 }
]);
function linkStyle(wide, highlighted) {
  return {
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: wide ? "flex-start" : "center",
    gap: wide ? 8 : 0,
    width: wide ? "calc(100% + 8px)" : 36,
    height: wide ? 34 : 36,
    margin: wide ? "4px -4px 0" : "8px 0 0",
    padding: wide ? "6px 10px" : 0,
    boxSizing: "border-box",
    borderRadius: wide ? 12 : "50%",
    background: highlighted ? "var(--dsw-alias-interactive-bg-hover)" : "transparent",
    color: "var(--dsw-alias-label-primary)",
    fontFamily: "inherit",
    fontSize: 14,
    lineHeight: "22px",
    textDecoration: "none",
    cursor: "pointer",
    overflow: "hidden",
    transition: "background-color 120ms var(--ds-ease-in-out)"
  };
}
function RoomsFooterAction({ wide }) {
  const [highlighted, setHighlighted] = (0, import_react.useState)(false);
  const label = "Open Agent Team Room";
  return (0, import_react.createElement)(import_dsh_client_ui_primitives.Tooltip, {
    label,
    side: "right",
    delayMs: 500,
    disabled: wide,
    children: (0, import_react.createElement)("a", {
      href: ROOM_DASHBOARD_PATH,
      target: "_blank",
      rel: "noopener",
      "aria-label": label,
      style: linkStyle(wide, highlighted),
      onMouseEnter: () => {
        setHighlighted(true);
      },
      onMouseLeave: () => {
        setHighlighted(false);
      },
      onFocus: () => {
        setHighlighted(true);
      },
      onBlur: () => {
        setHighlighted(false);
      },
      children: [
        (0, import_react.createElement)("span", {
          key: "icon",
          "aria-hidden": true,
          style: { display: "inline-flex", flex: "none" },
          children: (0, import_react.createElement)(import_dsh_client_ui_primitives.IconUserOutline16, { size: wide ? 16 : 18 })
        }),
        wide ? (0, import_react.createElement)("span", {
          key: "label",
          style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
          children: "Rooms"
        }) : null
      ]
    })
  });
}
function templateOptions() {
  return ROOM_TEMPLATE_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    detail: option.detail,
    confirmation: {
      title: `Create ${option.label} room?`,
      description: `This template immediately starts ${option.agentCount} independent Agent Sessions and can consume model quota.`,
      acknowledgeLabel: "I understand that multiple Agents will start",
      cancelLabel: "Cancel",
      confirmLabel: "Create room"
    }
  }));
}
var inject = ["slots", "commandUi", "sessions"];
function apply(ctx) {
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: ROOM_FOOTER_ENTRY_ID,
    order: 20
  }, RoomsFooterAction));
  const command = ctx.get("commandUi");
  const sessions = ctx.get("sessions");
  const sessionFor = (session) => sessions.binding(session.sessionId)?.session;
  ctx.effect(() => command.decorate({
    name: "room-template",
    available: (session) => sessionFor(session) !== void 0,
    ui: {
      kind: "popupSelect",
      options: () => Promise.resolve(templateOptions()),
      onSelect: async (option, session) => {
        const live = sessionFor(session);
        if (live === void 0) throw new Error("this session is not materialized yet");
        const result = await live.command(`/room-template create ${option.id}`);
        if (!result.ok) throw new Error(`room template command failed: ${result.error.code}: ${result.error.message}`);
        if (!result.value.matched) throw new Error("the host offers no /room-template command");
      }
    }
  }), "agent-team-room: /room-template native picker");
}
return module.exports; } });
//# sourceMappingURL=client.js.map

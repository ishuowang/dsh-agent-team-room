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
  RoomsFooterAction: () => RoomsFooterAction,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var ROOM_DASHBOARD_PATH = "/agent-team-room/";
var ROOM_FOOTER_ENTRY_ID = "dsh-agent-team-room";
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
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: ROOM_FOOTER_ENTRY_ID,
    order: 20
  }, RoomsFooterAction));
}
return module.exports; } });
//# sourceMappingURL=client.js.map

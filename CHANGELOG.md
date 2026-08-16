# Changelog

All notable Agent Team Room changes are documented here. Releases follow Semantic Versioning.

## [Unreleased]

- Add an official `conversation.view` contribution that renders a complete native Room conversation workspace beside Chat without replacing the original conversation surface.
- Merge Room-addressed messages, metadata activity, broadcasts, and correlated member replies from independent DSH Session logs into one deterministic, text-only timeline with an Everyone/member recipient composer.
- Persist accepted/failed relay receipts and built-in DSH Session MessageIds for exact correlation while keeping prompt/reply bodies and external provider delivery ids out of `rooms.json`; broadcasts are deduplicated into one outgoing timeline row.
- Hide assistant replies from turns that mix the current Room with any other appended Session input; exclude replacement surface copies, reasoning/tool calls, and unrelated content; and report transcripts that cannot be read instead of guessing or leaking them.
- Project only the selected visible Room, bound message count and text size, expire read-through cache entries, and require same-origin Fetch Metadata plus a native-client marker. These headers are not authentication; remote deployments must still protect the DSH origin with authenticated TLS and user access control.
- Reuse the existing Room selection, creation, member management, navigation, and risk-confirmation flows in both the embedded view and native launchers.
- Add a third typed invite-provider seat for the Room view so independent integrations such as RoleHub can attach verified members there.

## [0.6.0] - 2026-08-15

- Add a native, leading `@` Room-member source to DSH's input-trigger pipeline. A picked candidate binds the exact Room/member identity and sends the remaining composer text through `/room send` without prompting the leader model.
- Restrict mention candidates to non-removed members of open Rooms led by the current Session, with deterministic disambiguation for duplicate labels and Host-side authorization repeated on submit.
- Preserve quoted command values that begin with `--`, so direct messages such as `--help` round-trip to the selected member instead of being mistaken for a missing flag value.
- Split the header and footer invite-provider child slots so DSH SlotCore sees one declaration per key, while retaining the original header key for v0.5 bridge compatibility.

## [0.5.0] - 2026-08-15

- Declare the additive `agent-team-room.invite.provider` native UI slot so independent bridges can offer verified member sources inside the existing Room attach panel without changing Room's role-neutral Host runtime.
- Let the public `attachSession` convenience API carry an optional provider-neutral, JSON-serializable profile reference through the existing provider and persistence path; calls without a profile remain compatible.

## [0.4.0] - 2026-08-15

### Changed

- Reduce Room to a provider-neutral membership, delivery, and lifecycle primitive with no bundled roles or orchestration policy.
- Replace Agent-specific member records with provider-owned connections and stable Room-local member ids.
- Add the trusted `RoomMemberProvider` SPI; keep a built-in provider for attaching continuable direct-child DSH Sessions.
- Replace `/room-template` with the generic Host-native `/room` command family.
- Move Room and member management into an additive DSH Web `Modal` opened from official header and sidebar-footer slots.
- Store only delivery metadata in Room history; message bodies remain in the destination transport.

### Removed

- Remove all seven built-in scenarios, template tools, prompts, and launch UI.
- Remove tracked task, assignment, completion, waiting, and task-retention APIs.
- Remove the standalone dashboard, its assets, and its mutation-independent presentation layer.

### Added

- Add a read-only, same-origin snapshot transport for the native DSH Web extension. All writes continue through leader-authorized commands.
- Minimize the native snapshot to a UI field whitelist; provider addresses, event history, summaries, and message data never cross that endpoint.
- Add native acknowledgement steps for member removal and Room closure, and serialize conflicting per-Room delivery/removal/closure mutations.
- Accept optional provider-neutral identity and strict RoleHub `AgentRole` provenance. Provenance is descriptive and grants no capability.
- Add one-time Room storage schema v1 → v2 migration. It preserves Room/Session membership, redacts legacy delivery bodies to metadata, and drops legacy task-board records without deleting Sessions.
- Rework bilingual documentation, security guidance, and real native-UI screenshots around the pure Room contract.

## [0.3.0] - 2026-08-15

- Add seven built-in Room scenarios: OPC, deep research, software delivery, incident response, customer support, content campaign, and plan-execute-review.
- Add `room_template_list`, `room_create_from_template`, and the host `/room-template` command.
- Decorate the bare command with DSH Web's native `popupSelect`, including a multi-Agent cost confirmation.
- Persist optional template provenance without changing the Room storage schema version.
- Rework the bilingual README around scenario concepts and accurately label the native entry and standalone board.

## [0.2.0] - 2026-08-14

- Add a native, additive `Rooms` entry to the DSH Web sidebar footer.
- Ship the browser half as a prebuilt ModuleLoader bundle in the same plugin package.
- Keep the standalone dashboard isolated from the conversation surface.

## [0.1.0] - 2026-08-14

- Add persistent rooms with explicit leader/member ownership.
- Add independent continuable Agent membership and existing-child attachment.
- Add direct messages, broadcasts, tracked tasks, waiting, removal, and close operations.
- Correlate task completion through an assignee-only `room_task_complete` report keyed by Room id and Task id.
- Add a read-only DSH Web room dashboard and JSON projection.
- Reject non-loopback dashboard clients by default and bound per-room task/event retention.
- Add bilingual documentation, strict TypeScript checks, tests, and packaging validation.

[0.6.0]: https://github.com/ishuowang/dsh-agent-team-room/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ishuowang/dsh-agent-team-room/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ishuowang/dsh-agent-team-room/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ishuowang/dsh-agent-team-room/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ishuowang/dsh-agent-team-room/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ishuowang/dsh-agent-team-room/releases/tag/v0.1.0

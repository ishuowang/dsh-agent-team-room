# Changelog

All notable Agent Team Room changes are documented here. Releases follow Semantic Versioning.

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

[0.4.0]: https://github.com/ishuowang/dsh-agent-team-room/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ishuowang/dsh-agent-team-room/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ishuowang/dsh-agent-team-room/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ishuowang/dsh-agent-team-room/releases/tag/v0.1.0

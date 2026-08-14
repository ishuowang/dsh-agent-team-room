# Changelog

## 0.2.0 - 2026-08-14

- Add a native, additive `Rooms` entry to the DSH Web sidebar footer.
- Ship the browser half as a prebuilt ModuleLoader bundle in the same plugin package.
- Keep the standalone dashboard isolated from the conversation surface.

## 0.1.0 - 2026-08-14

- Add persistent rooms with explicit leader/member ownership.
- Add independent continuable Agent membership and existing-child attachment.
- Add direct messages, broadcasts, tracked tasks, waiting, removal, and close operations.
- Correlate task completion through an assignee-only `room_task_complete` report.
- Add a read-only DSH Web room dashboard and JSON projection.
- Reject non-loopback dashboard clients by default and bound per-room task/event retention.
- Add bilingual documentation, strict TypeScript checks, tests, and packaging validation.

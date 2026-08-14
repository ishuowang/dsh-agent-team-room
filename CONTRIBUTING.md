# Contributing

Agent Team Room tracks the fast-moving DeepSeek Harness developer preview. Small, well-tested changes are preferred.

1. Create a `feature/<short-name>` branch.
2. Keep Harness-specific behavior behind `RoomRuntime`; keep serializable contracts in `src/types.ts`.
3. Add or update tests for lifecycle, authorization, persistence, and failure behavior.
4. Run `npm run check` and `npm pack --dry-run`.
5. Open a pull request describing user-visible behavior and the DSH version tested.

Do not commit room data, DSH profiles, API keys, Session logs, or generated credentials.

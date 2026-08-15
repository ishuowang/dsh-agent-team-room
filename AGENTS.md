# Repository workflow

- Create development branches with the `feature/` prefix and open a pull request for every feature.
- Keep the default branch releasable. Run `npm test`, `npm run typecheck`, `npm run build`, `npm pack --dry-run`, and `git diff --check` before publishing.
- Never commit credentials, DSH profiles, Room data, Session transcripts, private ids, or real user screenshots.
- Treat DeepSeek Harness as a developer-preview dependency and keep Harness-specific behavior behind adapters.
- Keep Room a generic membership and delivery primitive. Do not add built-in roles, scenarios, prompts, skills, task boards, or orchestration policy.
- Keep `RoomMemberProvider` implementations Host-side and trusted. Providers own attachment, transport, interruption, and rollback; Room owns membership, leader authorization, provenance, and bounded metadata.
- The built-in `dsh-session` provider must accept only continuable direct children of the Room leader.
- Treat RoleHub `AgentRole` identity as optional, non-authorizing provenance. Role loading, verification, effective policy, and Session creation belong in a separate bridge.
- Extend DSH Web only through official typed slots, native primitives, and Host commands. Never patch arbitrary DOM, inject global CSS, replace native root surfaces, or restore a standalone Room dashboard.
- Keep the native snapshot transport read-only. Every mutation must pass through an Agent-scoped Host command or tool and repeat leader ownership checks.
- Keep English and Chinese READMEs aligned. Product screenshots must come from the real bundled UI with synthetic data.
- Never automate star, watch, follow, telemetry, or unrelated outbound behavior. Documentation may show optional commands only behind explicit, current human consent.

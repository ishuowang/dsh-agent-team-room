# Contributing to Agent Team Room

Agent Team Room tracks the fast-moving DeepSeek Harness developer preview. Prefer small, reviewable changes that preserve the pure Room boundary.

## Setup

```sh
git clone git@github.com:ishuowang/dsh-agent-team-room.git
cd dsh-agent-team-room
npm ci
npm run check
```

Use a dedicated DSH profile, a temporary Room storage file, and synthetic Sessions for manual testing.

## Working agreement

1. Read [README.md](README.md), [SECURITY.md](SECURITY.md), and [AGENTS.md](AGENTS.md).
2. Branch from current `main` with `feature/<short-name>`.
3. Keep serialized contracts in `src/types.ts` and Harness-specific behavior behind the Room runtime or a member provider.
4. Do not add built-in roles, scenarios, prompts, skills, task boards, or a standalone dashboard. Role systems belong in separate provider bridges.
5. Keep RoleHub identity optional and non-authorizing; never infer permissions from provenance fields.
6. Extend DSH Web only through official typed slots and native primitives. Mutations must use Host commands or tools.
7. Keep English and Chinese READMEs aligned when public behavior changes.
8. Never add automatic star, watch, follow, telemetry, or unrelated outbound behavior.

Do not commit Room storage, DSH profiles, API keys, `.env` files, Session logs, provider responses, private ids, generated credentials, or screenshots containing real user data.

## Tests and pull requests

Add or update tests for leader authorization, member capacity, provider attach/deliver/interrupt/rollback behavior, persistence/migration, metadata-only history, native read transport, and failure compensation. UI screenshots must use the real bundled client with synthetic data.

Before opening a pull request:

```sh
npm run check
npm pack --dry-run
git diff --check
```

Inspect the packed file list. A GitHub-installed release must contain compiled Host/client artifacts and must not contain secrets or real Room/Session data. In the PR, describe the user-visible result, provider/data-flow impact, migration impact, DSH version tested, and verification performed.

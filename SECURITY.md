# Security policy

## Supported version

Security fixes target the latest release on `main`. DeepSeek Harness remains a developer-preview dependency; use the pinned version from the current release.

## Trust boundaries

Agent Team Room is trusted, same-process DSH plugin code. It coordinates members; it is not a sandbox, role verifier, capability broker, or authorization service for third-party transports.

The Room leader is the authority for Room mutations. Host tools and `/room` commands check that the calling Agent leads the target Room. The browser extension is convenience UI and never becomes an authority: all mutations return through `/room` and repeat Host checks.

Direct delivery, broadcast, member removal, and Room closure are mutually exclusive per Room while their provider work is in flight. Removal is committed before best-effort interruption, and raw provider interruption errors are not copied into Room history.

### Member providers

`RoomMemberProvider` implementations execute in the trusted Host process. They receive Room/member metadata and delivery content, and may create resources or contact external transports. Review provider code, dependencies, configuration, rollback behavior, and data policy before installation.

The built-in `dsh-session` provider accepts only a continuable direct child of the leader. It uses DSH's normal follow-up and interruption APIs. Removing a member or closing a Room does not delete its backing Session.

RoleHub `AgentRole` identity is non-authorizing provenance. Room validates the record shape and digest syntax but does not verify a role bundle, calculate effective permissions, grant tools, install skills, or create the role Session. Those responsibilities remain with a separately installed trusted bridge and Host policy.

## Native Web snapshot transport

The native DSH modal reads a minimal Room projection through `GET /agent-team-room/api/session/:sessionId`. The endpoint rejects browser requests marked cross-site, accepts no writes, disables caching, and omits provider-owned address descriptors, profile digests, event history, summaries, delivery bodies, and Session transcripts.

The same-origin check is a browser data-flow control, not user authentication. A client that can reach the DSH origin and knows or guesses Session ids may attempt direct requests. Keep DSH bound to a trusted interface, and put authenticated TLS in front of it before any remote exposure. Do not rely on `Sec-Fetch-Site` headers as the only boundary for untrusted networks.

## Persistence and data handling

Room state defaults to `$DSH_HOME/agent-team-room/rooms.json`, written through atomic replacement with mode `0600`. The store contains Room names, topics, summaries, member labels, provider/protocol/address metadata, optional identity provenance, lifecycle hints, and bounded delivery metadata. Message bodies and Session transcripts are not persisted by Room v0.4.

Room persistence is single-writer. Do not run multiple DSH processes against one storage file; use separate `storageFile` values. Restrict filesystem and backup access because provider addresses and identity metadata can still be sensitive.

The first v0.4 start can migrate schema v1 data in place. Back up the file first. Migration preserves Room and DSH Session membership, redacts legacy delivery bodies, and drops legacy task-board records. It does not delete DSH Sessions.

Do not put credentials, secrets, regulated data, or private transcripts in Room names, topics, summaries, member labels, provider descriptors, or messages. Delivery content is still visible to the selected provider and destination even though Room does not persist it.

## Reporting a vulnerability

Use the repository's private GitHub **Security → Report a vulnerability** flow. Include the affected release, synthetic reproduction, impact, and suggested mitigation. Do not open a public issue containing credentials, real Room data, Session ids, provider addresses, or transcripts.

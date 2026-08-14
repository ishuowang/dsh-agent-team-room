# Security policy

## Supported version

Security fixes target the latest release on `main`.

## Important deployment boundary

Agent Team Room is trusted, same-process DSH plugin code—not a sandbox. Its Web dashboard is read-only but exposes room names, roles, messages, task instructions, and results to anyone who can reach the DSH HTTP server.

DSH binds to `127.0.0.1` by default, and the plugin rejects direct non-loopback dashboard clients unless `allowRemote` is explicitly enabled. If you publish the service through a tunnel/reverse proxy, keep `allowRemote: false` when the proxy connects from loopback and enforce authentication plus TLS at that proxy. Enable remote dashboard access only when an authenticated front door is already in place.

Room state defaults to `$DSH_HOME/agent-team-room/rooms.json`, written with mode `0600`. Do not place credentials or secrets in room messages or task instructions.

Room persistence is single-writer. Do not run multiple DSH processes against the same Agent Team Room storage file; use distinct `storageFile` values instead.

## Reporting a vulnerability

Please use the repository's private GitHub Security Advisory flow. Include the affected release, impact, reproduction, and any suggested mitigation. Do not open a public issue for an unpatched vulnerability.

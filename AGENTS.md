# Repository workflow

- Create development branches with the `feature/` prefix.
- Keep the default branch releasable; open a pull request for every feature.
- Run `npm test`, `npm run typecheck`, and `npm run build` before publishing.
- Never commit credentials, DSH profiles, room data, or session transcripts.
- Treat DeepSeek Harness as a developer-preview dependency and keep its API usage behind adapters.


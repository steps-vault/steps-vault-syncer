# StepsVault Sync

Read [docs/plan.md](docs/plan.md) first. The tasks are GitHub issues (task N = issue #N). The code style is in
[CONTRIBUTING.md](CONTRIBUTING.md); follow it exactly.

- This repo is public: never commit private data, music, songs, keys or anything from the private StepsVault repos.
- `@stepsvault/sync-core` stays plain TypeScript: no DOM, no Node APIs. Add a port instead.
- Tests never call the network or real addons. Audio-matching fixtures come from synthetic audio, never from songs.
- Commits use Conventional Commits.
- Run `pnpm typecheck`, `pnpm lint` and `pnpm test` before every commit.

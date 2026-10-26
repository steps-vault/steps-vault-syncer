# StepsVault Sync

StepsVault Sync puts the songs from your [dancedance.studio](https://dancedance.studio) vault into your own StepMania game,
lined up with **your own copy of the music**. StepsVault makes dance steps; it never sends anyone music.

- It only adds, updates, moves or removes the songs it added itself. Your own song folders are never touched.
- It checks that your music file is the same version as the steps were made for, and lines the steps up with it.
- Addons made by the community can tell it where else your music might be.

Sync runs on the website (Chrome or Edge) and as this open-source desktop app (Windows first). Both share the
packages in this repo. How it works and what is planned: [docs/plan.md](docs/plan.md).

## Build it

You need Node 22 or newer, and pnpm. Run `corepack enable` once to get the pnpm version this repo pins. On Windows,
that needs an admin terminal.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

## Packages

| Folder | What it is |
|---|---|
| `packages/sync-core` | The sync engine: plain TypeScript, no DOM or Node APIs; everything outside goes through ports |
| `packages/sync-ui` | The Sync screens as React components, shared by the website and the desktop app |
| `apps/desktop` | The Windows app (Electron): the game's Songs folder, music folders, tray and background sync |

To see every screen with made-up data, run `pnpm --filter @stepsvault/sync-ui preview` and open the address it prints.
The desktop app (`apps/desktop`) comes with task 11.

## Run the desktop app

```bash
pnpm --filter @stepsvault/desktop start
```

To try it against a StepsVault site on your own computer, set `STEPSVAULT_SITE_URL` (for example
`http://127.0.0.1:8787`). `STEPSVAULT_USER_DATA_DIR` keeps a test run's settings apart from your real ones, and
`STEPSVAULT_LOG_STATE=1` prints one line per change (never the sign-in token).

## Licence

Apache-2.0. See [LICENSE](LICENSE).

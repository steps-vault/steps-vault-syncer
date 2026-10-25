# StepsVault Sync — plan

StepsVault Sync puts the songs in a player's StepsVault vault into their own StepMania `Songs` folder, using **the
player's own copy of each song's music**, and lines the steps up with that copy. Sync sends a player's music only to a generator the player chose, after telling
them where it goes.

The screens are designed on the StepsVault design canvas (page "v2", boards "Sync 1" to "Sync 7" and "Sync — states").
The written spec lives with the website and is summarised here.

## Two ways to run it, one core

| | Website (stepsvault.com/sync) | Desktop app (this repo, open source) |
|---|---|---|
| Runs in | Chrome or Edge on a computer | Windows first (Electron), later macOS and Linux |
| Songs folder | File System Access API; the browser asks for permission once per visit | Node `fs` |
| Music decoding | Chromium's own decoder (`decodeAudioData`) | the same, in a hidden app window (both are Chromium, so both hear a file the same way) |
| Signs in | the website's own session | "sign in by code" on stepsvault.com/link |
| Background sync | no (the tab must stay open) | yes, from the tray |

Both use the same packages from this repo:

- **`@stepsvault/sync-core`**: plain TypeScript, no DOM and no Node APIs. It contains the sync plan, the folder
  layout and names, the record of which folders we own, `.ssc` editing, audio matching, the addon protocol client
  and the StepsVault API client. Everything that touches the outside world goes through an interface (a "port")
  that the website and the app each implement:
  - `SongsFolder`: list, read, write, rename, remove inside the game's `Songs` folder;
  - `AudioDecoder`: a file → mono samples at 44.1 kHz (Chromium's `decodeAudioData`: mp3, ogg, wav, flac, AAC, Opus; no
    ffmpeg.wasm download and no unsigned program for Smart App Control to block);
  - `MusicLibrary`: the files in the player's music folders;
  - `HttpClient`: `fetch` with a timeout;
  - `Clock`.
- **`@stepsvault/sync-ui`**: the React screens from the design, shared by the website and the app.
- **`apps/desktop`**: the Electron app (main process: folder access, network, tray, updates; a hidden window decodes
  and matches audio; the visible window runs `sync-ui`).

The website (a private repo) installs `sync-core` and `sync-ui` from npm under the `@stepsvault` scope.

## Rules that never bend

1. **Never touch the player's own folders.** Sync only adds, updates, moves or removes folders it created itself.
   It knows them from two things that must agree: its own record of installed songs, and a marker file
   `.stepsvault.json` inside each song folder it writes. If the player changed a chart file, the song becomes
   "You edited this", and Sync never overwrites it unless the player chooses "Replace".
2. **We never send music unasked.** Sync downloads steps (`.ssc`, images) and the song's fingerprint (its onset
   envelope: how strongly new sounds start, 100 times a second). The player's music is read on their computer and
   copied into the song folder. The only time it leaves the computer is when the player makes a song with a generator
   that isn't on their computer (StepsVault's included): Sync first says "Your music file will be sent to <address>"
   and goes on only when the player agrees.
3. **Addons see song facts only**: title, artist, album, genre, length and the YouTube link, plus what the player
   types into a song source's fields. They never see the player's account, files or anything else. The player agrees once per addon. StepsVault lists no addons and
   promotes none.
4. **One clear status per song** (icon + word, never colour alone): Synced, Syncing…, Needs audio, Different edit,
   Update available, You edited this, Removed from vault.

## How one song syncs

1. **Find audio**, in this order: the file the player picked for this song, then their music folders (match by
   title and artist, then check the sound), then enabled addons (each returns a file the player already has, or a
   link the app opens for the player).
2. **Check it's the same edit.** Decode the file, build its onset envelope the same way the engine does, and
   cross-correlate it with the song's fingerprint. A good correlation with nearly the same length is the same edit.
   Anything else is "Different edit".
3. **Line up.** The best shift between the two envelopes moves `#OFFSET`
   (`offset = stored offset − shift`).
4. **Write to the game.** In a temporary folder next to the target: the `.ssc` (with `#MUSIC` pointing at the
   player's file and the corrected `#OFFSET`), the music file (ogg, mp3 and wav as they are; other formats as WAV,
   which StepMania plays), images and the marker. Then rename it into place, so
   a half-written song never appears in the game.

## Folder layout

The player chooses one: **One group** (`StepsVault`), **By genre** (`Pop`, `Rock`…) or **By artist**. A group name
the player already uses (compared without case, as Windows does) gets the prefix `StepsVault - ` instead. Changing
the layout moves only our folders. Folder names use English letters only, because StepMania 5 on Windows can't open
Hebrew or Japanese names: a song in another script is named by the English-letter spelling StepsVault sends. StepMania keeps scores by folder path, so moved songs start with fresh scores,
and Sync says so before moving anything.

## Addon protocol (v1)

An addon is a web service the player adds by its address. It serves:

- `GET /manifest.json`: `{ id, name, version, author, description, provides: ["audio-links"], protocol: 1 }`, and
  optionally up to 8 simple `options` the player picks from a list (never free text);
- `POST /audio-links` with one song's facts (and the player's option picks), answering with zero or more
  `{ kind: "file-url" | "open-page", url, label }`.

Sync calls addons from the app's main process (or the website's page) with a timeout. The full protocol is in [addons.md](addons.md); an addon on the player's own computer may use `http://127.0.0.1`. It treats every answer as
untrusted data, downloads only `https://` files into a temporary folder, and still checks every file with the
fingerprint. A slow or offline addon makes only the songs that wait on it wait; it never crashes the app.

## Desktop app security

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` and a strict Content Security Policy in the
renderer. The main process exposes a small, typed bridge, and it only touches the chosen `Songs` folder and the
chosen music folders. Releases are built in public CI and signed through SignPath's free plan for open-source
projects.

## Tasks

The tasks are GitHub issues in this repo, in roughly this order. Website and API work is tracked in the website's
own repo.

1. Repo setup: pnpm workspace, TypeScript, Vitest, lint, CI, contributor docs.
2. Core: the songs-folder port, the record of owned folders and the marker files.
3. Core: folder layout and group names (prefix only on a clash).
4. Core: the sync planner, from the vault and the folder to a list of actions and a status per song.
5. Core: `.ssc` editing (`#MUSIC`, `#OFFSET`) and writing a song safely.
6. Core: audio matching (onset envelope + cross-correlation), checked against the engine's own numbers.
7. Core: audio sources (music folders, picked files).
8. Core: the addon protocol v1 client and its docs.
9. Core: the StepsVault API client.
10. UI: the Sync screens as shared React components.
11. Desktop app: Electron shell, Node ports, sign in by code.
12. Desktop app: tray, background sync, game detection, updates.
13. Release: packaging, signing (SignPath), release workflow.

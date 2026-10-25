---
name: make-an-addon
description: Build a StepsVault Sync addon - a small web service that tells Sync where to find a song's music (and video). Use when someone wants to make, test or fix an addon for StepsVault Sync, or asks how addons work.
---

# Make a StepsVault Sync addon

An **addon** helps Sync find the music for a song in the player's vault: a file on your server, a file on the
player's own computer, or a page the player can open (a store). Sync calls it, checks what it gets, and does
everything else. The full rules are in `docs/addons.md`; read it before you start. This skill is the short path.

## 1. Decide what it gives

- Music only: `provides: ["audio-links"]`.
- Music and the song's video: `provides: ["audio-links", "video-links"]`. A video is used only together with music
  from the same answer, and must already play in StepMania 5 (H.264 Main, 8-bit `yuv420p`, at most 854x480, `.mp4`).
- Where it runs: on the internet (`https://…`) or on the player's computer (`http://127.0.0.1:<port>` or
  `http://localhost:<port>`). Nothing else is accepted.

## 2. Write the manifest: `GET /manifest.json`

```json
{ "protocol": 1, "kind": "addon", "id": "you.your-addon", "name": "Your Addon", "version": "0.1.0", "author": "you",
  "description": "One sentence: where the music comes from.", "provides": ["audio-links"], "options": [] }
```

`id`: lower-case letters, digits, `.` and `-`, 2-64 characters. `name` and `author` up to 60 characters,
`description` up to 300. Options are optional: up to 8 `choice` options (see `docs/addons.md`).

## 3. Answer `POST /audio-links`

Sync sends only the song's facts:
`{ "protocol": 1, "song": { "title", "artist", "album", "genre", "lengthSeconds", "youtubeId", "youtubeUrl" }, "options": {...} }`.

Answer one of:

- `200 { "links": [ { "kind": "file-url", "media": "audio", "url": "https://…/song.ogg", "label": "Song (ogg)", "fileName": "song.ogg" } ] }`
  (0-10 links; `media: "video"` for the video; `{ "kind": "open-page", "url": "https://…", "label": "Buy it" }` for
  a page the player opens themselves).
- `202 { "retryAfterSeconds": 5 }` while you prepare a file. Answer `200` only when every file is ready.
- `200 { "links": [], "error": "One short sentence" }` when you have nothing.

Answer within 20 seconds and under 64 KB. Sync checks that a music file is the same version of the song (by its sound)
before using it, so a wrong file is simply ignored.

## 4. A minimal addon (Node, no packages)

Start from the example in `docs/addons.md` ("A minimal addon"), and add `"kind": "addon"` to its manifest.

## 5. Test it before you share it

```bash
curl -s http://127.0.0.1:8080/manifest.json
curl -s -X POST http://127.0.0.1:8080/audio-links -H "Content-Type: application/json" -d '{"protocol":1,"song":{"title":"Pulse Garden","artist":"Kairo Lights","album":null,"genre":null,"lengthSeconds":201,"youtubeId":null,"youtubeUrl":null}}'
```

Then add its address in Sync under **Addons**: Sync shows what it will see, then uses it on songs that need music.

## Checklist

- [ ] Manifest has `kind: "addon"`, a unique `id`, and a description that says where the music comes from.
- [ ] Links are `https`, or `http` only to the player's own computer; pages are `https`.
- [ ] `202` with `retryAfterSeconds` while working; `200` with every file ready.
- [ ] You only offer files you have the right to share; no passwords, no tracking.

# Generators (protocol 1)

> Draft. It gets a legal review before it is announced anywhere.

A **generator** makes the steps for a song from the music. StepsVault's own generator is the default: songs it makes
go to the vault, where every player can get them, and each costs a token. Anyone can also connect **their own
generator**: a small web service that answers this protocol. Songs a player makes with their own generator are
theirs alone. They never go to the vault; Sync puts them in the player's game, and the website shows them to that
player only while Sync is connected.

StepsVault doesn't list, host, review or recommend generators. Players add one by pasting its address in Sync's
**Generators** section. Each player is responsible for the generators they use and for the music they give them.

## What a generator gets

For each song, a generator gets:

| Part | What it is |
|---|---|
| the music | the player's own music file, as Sync found it (music folders, a file the player picked, or an addon) |
| the video | the song's video, when Sync has one; otherwise nothing |
| the song's facts | `title`, `artist` and `lengthSeconds` always (Sync falls back to the file's name, `"Unknown artist"`, and the length it measures); `album`, `genre`, `youtubeId` when known, else `null` |
| the difficulties | which of `Beginner`, `Easy`, `Medium`, `Hard`, `Challenge` to make |
| the options | the player's picks for the generator's options, as for addons |

Never the player's account, name, other songs or anything else on their computer.

**Where the music goes.** A generator on the player's own computer (`http://127.0.0.1:<port>` or
`http://localhost:<port>`) keeps the music on that computer. A generator at any other address receives the music file
over the internet: before its first job, Sync tells the player exactly that ("Your music file will be sent to
<address>") and goes on only when the player agrees. StepsVault's own generator is on the internet too, so it asks the
same question before the first song.

Sizes in this document: 1 MB is 1,048,576 bytes.

## Address

`https://…`, or `http://127.0.0.1:<port>` / `http://localhost:<port>` on the player's own computer. No user name,
password, `?` or `#`.

A generator on the player's computer can be started by Sync itself: see "A program on the player's computer" in
`addons.md`.

## Signing in

Community generators get no sign-in: Sync never sends them the player's StepsVault account or token. Only
StepsVault's own generator, at the StepsVault address, gets the player's Sync device token
(`Authorization: Bearer …`) on every call, file downloads included, because it spends the player's token and keeps
their jobs apart. A generator that needs its own accounts must handle them on its side, outside this protocol.

## `GET <address>/manifest.json`

```json
{
  "protocol": 1,
  "kind": "generator",
  "id": "example.onset-steps",
  "name": "Onset Steps",
  "version": "0.1.0",
  "author": "you",
  "description": "Steps on the music's onsets, arrows by simple rules.",
  "difficulties": ["Beginner", "Easy", "Medium", "Hard", "Challenge"],
  "musicTypes": ["audio/wav", "audio/ogg", "audio/mpeg", "audio/flac"],
  "usesVideo": false,
  "maxMusicBytes": 31457280,
  "options": []
}
```

- `kind`: always `generator` (an addon says `addon`).
- `id`, `name`, `version`, `author`, `description`, `options`: the same rules as for addons (see `addons.md`).
- `difficulties`: the ones it can make, at least one. Sync asks only for these.
- `musicTypes`: the music file types it accepts; must include `audio/wav`. Sync sends the player's file as it is when
  its type is listed, and otherwise decodes it to WAV (Sync has no encoder for other formats). A WAV is about 10 MB a
  minute, so a generator that lists only WAV should allow a large `maxMusicBytes`.
- `usesVideo`: `true` if it wants the video (to make its own background video). Sync sends it only then.
- `maxMusicBytes` (optional): the largest music file it takes, at most 100 MB (the default). Sync refuses a bigger file
  before uploading anything.

## `POST <address>/jobs`

A song takes minutes, so it is a job: Sync starts it, asks how it goes, then collects the files.

The request is `multipart/form-data` with these parts:

- `request` (`application/json`):

  ```json
  { "protocol": 1, "song": { "title": "Pulse Garden", "artist": "Kairo Lights", "album": null, "genre": null,
    "lengthSeconds": 201, "youtubeId": null }, "difficulties": ["Easy", "Medium"], "options": {} }
  ```

- `music`: the music file, with its `Content-Type` (one of the manifest's `musicTypes`) and a file name, at most
  `maxMusicBytes`.
- `video`: the video file (`video/mp4`), only when the manifest says `usesVideo` and Sync has one, at most 500 MB.

Answers:

- `202 { "jobId": "a1b2c3", "retryAfterSeconds": 10 }`. `jobId`: letters, digits, `-` and `_`, up to 64.
- `409 { "error": "One short sentence", "vaultSongId": "…" }`: the song already exists, or someone is making it right
  now. Only StepsVault's generator sends `vaultSongId`; Sync then adds that song to the player's vault
  (`POST /api/sync/vault/<vaultSongId>`, free) and syncs, so it installs like any vault song, and no token is spent.
  Sync ignores a `vaultSongId` from any other generator.
- Anything else means the generator couldn't take the job. An answer may carry `{ "error": "One short sentence" }`,
  which Sync shows the player.

## `GET <address>/jobs/<jobId>`

```json
{ "state": "working", "progress": 0.4, "stage": "Placing the steps", "retryAfterSeconds": 10 }
```

- `state`: `queued`, `working`, `done` or `failed`.
- `progress` (optional): 0 to 1. `stage` (optional): up to 60 characters, shown as is.
- `retryAfterSeconds`: when to ask again, 1 to 600; needed only while `queued` or `working`.
- When `failed`: `error`, one short sentence for the player.
- Sync waits up to 2 hours for a job. Three missed answers in a row (no answer, an error status, or a page that isn't
  this JSON) end the wait; a `404` means the generator lost the job.
- When `done`: `files`, a list of `{ "kind", "url", "bytes" }`:

| `kind` | File | Needed |
|---|---|---|
| `chart` | the song file (`.ssc`, StepMania 5), with a chart for each difficulty asked (Sync keeps only those) | yes |
| `banner`, `background`, `jacket` | PNG pictures (418×164, 854×480, 512×512) | no: Sync makes plain ones from the title |
| `video` | the background video, H.264 at most 854×480 in `.mp4` | no |
| `music` | the music the chart was timed on, Ogg Vorbis | no: Sync uses the player's own file |
| `report` | how the song was made, Markdown, at most 256 KB | no: shown under "How it was made" |

File `url`s are absolute and stay valid for at least an hour. They follow the address rules, except that they may carry
a query (signed download links need one). A generator that isn't on the player's computer may not link to it. StepsVault's
generator links only to its own address, with the same sign-in. A missing chart, a file over its size limit or a link
that breaks these rules refuses the whole song.

StepsVault's own generator also puts `"vaultSongId": "song_…"` in its `done` answer: the vault song it made, the same id
as in Sync's vault list. Sync then adds that song to the player's vault and syncs, so it installs with the player's music
like any vault song; it doesn't download the files, so this answer may leave out `files`. Sync ignores `vaultSongId` from
any other generator, and finds the song by its title and artist when StepsVault's answer has none.

## `DELETE <address>/jobs/<jobId>`

Sync calls it when the player cancels. Answer `200 { "cancelled": true }` when the job stopped, or
`200 { "cancelled": false, "error": "One short sentence" }` when it's too late (for example, StepsVault's generator
can't stop a song already being made: it still costs the token and still lands in the vault). Sync shows the sentence.

## What Sync checks before a song reaches the game

- Every file is within its size limit (song file 2 MB, each picture 5 MB, video 500 MB, music 100 MB).
- The song file opens with Sync's own reader (every tag must start a line), has `#OFFSET` and `#BPMS`, and has a
  chart for each difficulty asked; anything it can't read is refused, with the reason shown to the player. A chart
  counts when its `#STEPSTYPE` is `dance-single` and it has `#NOTES`; `#DIFFICULTY` is matched without case, and only
  the first chart of each difficulty is kept. Every other chart is dropped.
- A picture that isn't a PNG counts as missing. Sync doesn't check a picture's size.
- Sync writes the files under its own names (`<folder name>.ssc`, `music.<extension>`, `video.mp4`, `banner.png`,
  `background.png`, `jacket.png`), never the names a generator gives, and points `#MUSIC`, `#BANNER`, `#BACKGROUND`,
  `#JACKET` and `#BGCHANGES` at them. A picture Sync has no file for is left empty in the song file.
- Sync never runs anything a generator sends.

## Where generated songs go

Songs from **StepsVault's generator** are vault songs: StepsVault's `done` answer names the song (`vaultSongId`), and Sync
adds it to the player's vault and installs it like any other vault song. The vault never makes the same song twice.

Songs from a **community generator** go into the player's game, in the group **My generated songs**, one folder per
song named in English letters (StepMania on Windows can't open other scripts). The folder is named from the song file's
`#TITLETRANSLIT`, else its `#TITLE`, with accents taken off ("Beyoncé" becomes "Beyonce"). When that name has no English
letters, or still has letters from another script, the folder is called `Song <youtubeId>` when the song has a
`youtubeId`, else `Generated song <YYYY-MM-DD HHMM>`. When a folder of that name is already there, the artist is added,
then a number.

Making the same song again replaces the earlier version, in the same folder; files the new version doesn't use are
removed. The same song means the same `youtubeId`, else the same title and artist (ignoring case and extra spaces),
whichever generator made it.

When the same song is also in the player's vault, Sync asks which one to keep in the game. The one not chosen stays
out of the game.

When the music came from a song source with a video, and the generator sends no video of its own, that video plays
behind the generated song. It plays only with the player's music, since it shares that music's timing: when the
generator sends its own music, the song source's video is left out.

## On the website

While Sync is running, the website's **Play** page ("Your songs on this PC") lists the songs made on this computer and
plays them in game mode. They are never uploaded: the page, in the player's own browser, reads them from Sync on the
same computer (the "local bridge"). The website's server never talks to it. That needs a one-time pairing in Sync, and
Sync answers only the StepsVault website.

The local bridge (protocol 1):

- Sync listens on `http://127.0.0.1:47821` (or 47822, then 47823 when a port is taken), on the loopback address only,
  so no other computer can reach it.
- **Pairing.** In Sync, Generators › Play on the website › **Pair a browser** shows a code like `K7QM-4ZPX`. The player
  types it on the website, whose page sends `POST /v1/pairing` with `{ "code": "K7QM-4ZPX" }` and gets back
  `{ "protocol": 1, "token": "…" }`: 32 random bytes made by Sync, kept by the browser, never seen by any server. A code
  works once, for 5 minutes; five wrong codes throw it away, and Sync takes at most 10 tries a minute. Sync keeps the
  tokens encrypted like its own sign-in. **Forget paired browsers** cancels them all.
- Every other request carries `Authorization: Bearer <token>`:
  - `GET /v1/songs`: `{ "protocol": 1, "songs": [{ "songKey", "title", "artist", "generatorName", "difficulties":
    [{ "difficulty", "level" }], "location": { "groupName", "folderName" }, "fileKinds", "generatedAt" }] }`, the songs
    in Sync's own record of generated songs whose folder is still the one Sync wrote.
  - `GET /v1/songs/<songKey, URI-encoded>/<kind>`, where kind is `chart`, `music`, `video`, `banner`, `background` or
    `jacket`: that file of the song. A request never names a file: Sync takes the folder from its record and the file
    from its own names, and refuses links or anything else outside the Songs folder.
- Sync answers only requests whose `Origin` is exactly `https://dancedance.studio` (a development build also answers
  the test site it syncs with) and whose `Host` is its own loopback address. Every other request, and one without
  `Origin`, is refused without CORS headers. On a preflight that asks `Access-Control-Request-Private-Network: true`,
  Sync answers `Access-Control-Allow-Private-Network: true`.
- Errors are `{ "protocol": 1, "reason", "error" }`, `error` being one sentence for the player.

## Rules for generator makers

- Use the music only to make this player's song; don't keep it or share it.
- Don't ask players for passwords, and don't track them.
- Say in your description what your generator does with the music.

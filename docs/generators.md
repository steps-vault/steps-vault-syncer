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
<address>") and goes on only when the player agrees.

## Address

`https://…`, or `http://127.0.0.1:<port>` / `http://localhost:<port>` on the player's own computer. No user name,
password, `?` or `#`.

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
  "musicTypes": ["audio/ogg", "audio/mpeg", "audio/wav", "audio/flac"],
  "usesVideo": false,
  "maxMusicBytes": 31457280,
  "options": []
}
```

- `kind`: always `generator` (an addon has none).
- `id`, `name`, `version`, `author`, `description`, `options`: the same rules as for addons (see `addons.md`).
- `difficulties`: the ones it can make, at least one. Sync asks only for these.
- `musicTypes`: the music file types it accepts. Sync converts to Ogg Vorbis when the player's file is another type.
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
  now. Only StepsVault's generator sends `vaultSongId`; Sync then adds that vault song instead, and no token is spent.
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
- When `done`: `files`, a list of `{ "kind", "url", "bytes" }`:

| `kind` | File | Needed |
|---|---|---|
| `chart` | the song file (`.ssc`, StepMania 5), with a chart for each difficulty asked (Sync keeps only those) | yes |
| `banner`, `background`, `jacket` | PNG pictures (418×164, 854×480, 512×512) | no: Sync makes plain ones from the title |
| `video` | the background video, H.264 at most 854×480 in `.mp4` | no |
| `music` | the music the chart was timed on, Ogg Vorbis | no: Sync uses the player's own file |
| `report` | how the song was made, Markdown, at most 256 KB | no: shown under "How it was made" |

File `url`s are absolute, follow the address rules (on the generator's own address for StepsVault's generator, which
needs the same sign-in), and stay valid for at least an hour.

## `DELETE <address>/jobs/<jobId>`

Sync calls it when the player cancels. Answer `200 { "cancelled": true }` when the job stopped, or
`200 { "cancelled": false, "error": "One short sentence" }` when it's too late (for example, StepsVault's generator
can't stop a song already being made: it still costs the token and still lands in the vault). Sync shows the sentence.

## What Sync checks before a song reaches the game

- Every file is within its size limit (song file 2 MB, each picture 5 MB, video 500 MB, music 100 MB).
- The song file opens with Sync's own reader, has `#OFFSET` and `#BPMS`, and has a `dance-single` chart for each
  difficulty asked; anything it can't read is refused, with the reason shown to the player.
- Sync writes the files under its own names (`<title>.ssc`, `banner.png`, …), never the names a generator gives, and
  points `#MUSIC`, `#BANNER`, `#BACKGROUND`, `#JACKET` and `#BGCHANGES` at them.
- Sync never runs anything a generator sends.

## Where generated songs go

Songs from **StepsVault's generator** are vault songs: Sync adds them to the player's vault and installs them like
any other vault song. The vault never makes the same song twice.

Songs from a **community generator** go into the player's game, in the group **My generated songs**, one folder per
song named in English letters (StepMania on Windows can't open other scripts). Making a song again replaces the earlier
version. When the same song is also in the player's vault, Sync asks which one to keep in the game.

## On the website

While Sync is running and linked, the website's **My songs** also lists the songs made on this computer. The player can
play them in the simulator and download them. They are never uploaded: the website reads them from Sync on the same
computer. That needs a one-time pairing in Sync, and Sync answers only the StepsVault website.

## Rules for generator makers

- Use the music only to make this player's song; don't keep it or share it.
- Don't ask players for passwords, and don't track them.
- Say in your description what your generator does with the music.

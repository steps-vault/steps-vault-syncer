# Addons (protocol v1)

> Draft. It gets a legal review before it is announced anywhere.

Every StepsVault song needs the player's own copy of the music. Sync looks in the player's music folders and in
files they pick. An **addon** is a small web service, made by anyone, that can suggest other places the music might
be: a file on the addon maker's own server, or a page the player can open (a store, a library).

StepsVault doesn't list, host, review or recommend addons. Players add one by pasting its address, after a screen that
shows exactly what the addon will see.

## What an addon sees

For each song Sync asks about, an addon gets the song's facts only:

| Field | Example |
|---|---|
| `title` | `"Pulse Garden"` |
| `artist` | `"Kairo Lights"` |
| `album` | `"Afterimage"` or `null` |
| `genre` | `"Electronic"` or `null` |
| `lengthSeconds` | `201` or `null` |
| `youtubeId`, `youtubeUrl` | the song's video on StepsVault, or `null` |

Never the player's account, name, IP-based identity beyond what any web request carries, files, other songs, or
anything else on their computer.

## Address

An addon's address is `https://…`. The only exception is an addon running on the player's own computer, which may use
`http://127.0.0.1:<port>` or `http://localhost:<port>`. Addresses can't contain a user name, a password, `?` or `#`.

## `GET <address>/manifest.json`

```json
{
  "protocol": 1,
  "id": "indie.tapes",
  "name": "Indie Tapes",
  "version": "0.6.1",
  "author": "hyperpad",
  "description": "Links to the songs we host ourselves.",
  "provides": ["audio-links"]
}
```

- `id`: lower-case letters, digits, `.` and `-`, 2–64 characters.
- `name` and `author`: up to 60 characters. `description`: up to 300 characters.

## `POST <address>/audio-links`

Request:

```json
{ "protocol": 1, "song": { "title": "Pulse Garden", "artist": "Kairo Lights", "album": null, "genre": "Electronic",
  "lengthSeconds": 201, "youtubeId": null, "youtubeUrl": null } }
```

Answers:

- `200 { "links": [...] }`. Zero to 10 links, each one of these:
  - `{ "kind": "file-url", "url": "https://…/pulse-garden.ogg", "label": "Pulse Garden (ogg)", "fileName": "pulse-garden.ogg" }`:
    a music file. Sync downloads it into a temporary folder, then **checks that it is the same version of the song**
    (by its sound) before using it. A file that doesn't match is ignored.
  - `{ "kind": "open-page", "url": "https://…", "label": "Buy on Example Store" }`: a page Sync shows as a button. The
    player opens it themselves; Sync never follows it.
  - Optionally, `"error": "One short sentence"`. It is shown on the song when there are no links.
- `202 { "retryAfterSeconds": 5 }`: still working (for example, preparing the file). Sync asks again after that
  many seconds, between 1 and 600.
- Any other status counts as "not answering". So does a timeout (20 s) or an answer over 64 KB. The song simply waits,
  and the player can pick a file meanwhile.

Links must follow the same rule as addresses: `https`, or `http` only to the player's own computer. Page links must
be `https`. Sync drops any link that breaks these rules.

## A minimal addon (Node)

```js
import { createServer } from 'node:http';

const manifest = { protocol: 1, id: 'example.hosted', name: 'Example hosted songs', version: '1.0.0',
  author: 'you', description: 'Songs we host ourselves.', provides: ['audio-links'] };
const filesByTitle = new Map([['pulse garden', 'https://files.example.org/pulse-garden.ogg']]);

createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/manifest.json') return sendJson(response, 200, manifest);
  if (request.method !== 'POST' || request.url !== '/audio-links') return sendJson(response, 404, {});
  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    const { song } = JSON.parse(body);
    const url = filesByTitle.get(song.title.toLowerCase());
    sendJson(response, 200, { links: url ? [{ kind: 'file-url', url, label: song.title, fileName: null }] : [] });
  });
}).listen(8080);

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}
```

## Rules for addon makers

- Only offer files you have the right to share.
- Don't ask players for passwords, and don't track them.

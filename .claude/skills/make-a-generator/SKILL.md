---
name: make-a-generator
description: Build a StepsVault Sync generator - a small web service that turns a player's music into a StepMania song (.ssc). Use when someone wants to make, test or fix a step generator for StepsVault Sync, or asks how generators work.
---

# Make a StepsVault Sync generator

A **generator** makes the steps for a song from the player's music. Sync finds the music (music folders, a picked file,
addons), sends it to your generator as a **job**, collects the song file you make, checks it, and puts it in the
player's game under **My generated songs**. Your songs never go to the StepsVault vault. The full rules are in
`docs/generators.md`; read it before you start. This skill is the short path.

## 1. Decide where it runs

- On the player's computer (`http://127.0.0.1:<port>`): the music never leaves their PC. Best for most generators.
- On the internet (`https://…`): Sync warns the player before their first job that their music file will be sent to
  you. You must not keep or share it.

## 2. Write the manifest: `GET /manifest.json`

```json
{ "protocol": 1, "kind": "generator", "id": "you.your-generator", "name": "Your Generator", "version": "0.1.0",
  "author": "you", "description": "One sentence: how it makes steps and what it does with the music.",
  "difficulties": ["Beginner", "Easy", "Medium", "Hard", "Challenge"],
  "musicTypes": ["audio/ogg", "audio/mpeg", "audio/wav"], "usesVideo": false, "options": [] }
```

`musicTypes` must include `audio/ogg`. Add `maxMusicBytes` if you take less than 100 MB. Options follow the addon
rules (choices only).

## 3. Jobs

- `POST /jobs`, `multipart/form-data`: a `request` JSON part
  (`{ "protocol": 1, "song": { "title", "artist", "lengthSeconds", "album", "genre", "youtubeId" }, "difficulties": [...], "options": {...} }`),
  a `music` file part, and a `video` part only if you set `usesVideo`. Answer `202 { "jobId", "retryAfterSeconds" }`
  right away and do the work in the background.
- `GET /jobs/<jobId>`: `{ "state": "queued" | "working", "progress": 0.4, "stage": "Placing the steps", "retryAfterSeconds": 10 }`,
  then `{ "state": "done", "files": [ { "kind": "chart", "url": "<absolute url>", "bytes": 12345 } ] }` or
  `{ "state": "failed", "error": "One short sentence for the player" }`.
- `GET <file url>`: the file. `chart` (the `.ssc`) is required; `banner`, `background`, `jacket` (PNG), `video`,
  `music` (Ogg) and `report` (Markdown) are optional.
- `DELETE /jobs/<jobId>`: `{ "cancelled": true }`, or `{ "cancelled": false, "error": "…" }` if it's too late.

## 4. The song file Sync accepts

A StepMania 5 `.ssc` with `#OFFSET` and `#BPMS`, and one `dance-single` chart per difficulty asked:

```
#VERSION:0.83;
#TITLE:Pulse Garden;
#ARTIST:Kairo Lights;
#MUSIC:music.ogg;
#OFFSET:-0.120000;
#BPMS:0.000=128.000;

#NOTEDATA:;
#STEPSTYPE:dance-single;
#DIFFICULTY:Easy;
#METER:3;
#NOTES:
1000
0000
0100
0000
,
0010
0000
0001
0000
;
```

Each measure is 4 or more rows of 4 columns (Left, Down, Up, Right): `1` step, `2` hold start, `3` hold end, `0`
empty; measures end with `,` and the chart with `;`. Sync renames every file and fixes `#MUSIC` and the picture
tags, so their values don't matter. For a song title in Hebrew, Japanese or similar, also write `#TITLETRANSLIT` in
English letters.

## 5. A minimal generator (Python, FastAPI)

```python
# pip install fastapi uvicorn python-multipart   |   run: uvicorn generator:app --port 47870
import json, pathlib, threading, uuid
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse

app = FastAPI()
WORK_FOLDER = pathlib.Path("jobs")
status_by_job_id: dict[str, dict] = {}
MANIFEST = {"protocol": 1, "kind": "generator", "id": "you.your-generator", "name": "Your Generator",
            "version": "0.1.0", "author": "you", "description": "Makes steps on the beat. Keeps nothing.",
            "difficulties": ["Easy", "Medium"], "musicTypes": ["audio/ogg"], "usesVideo": False, "options": []}


@app.get("/manifest.json")
def get_manifest():
    return MANIFEST


@app.post("/jobs", status_code=202)
async def start_job(request: str = Form(...), music: UploadFile = File(...)):
    job_id = uuid.uuid4().hex
    folder = WORK_FOLDER / job_id
    folder.mkdir(parents=True)
    music_path = folder / "music.ogg"
    music_path.write_bytes(await music.read())
    status_by_job_id[job_id] = {"state": "queued", "retryAfterSeconds": 5}
    threading.Thread(target=run_job, args=(job_id, json.loads(request), music_path), daemon=True).start()
    return {"jobId": job_id, "retryAfterSeconds": 5}


def run_job(job_id: str, request: dict, music_path: pathlib.Path) -> None:
    status_by_job_id[job_id] = {"state": "working", "stage": "Placing the steps", "retryAfterSeconds": 5}
    try:
        ssc_text = make_song_file(music_path, song=request["song"], difficulties=request["difficulties"])
        (music_path.parent / "song.ssc").write_text(ssc_text, encoding="utf-8")
        status_by_job_id[job_id] = {"state": "done"}
    except Exception:
        status_by_job_id[job_id] = {"state": "failed", "error": "The steps couldn't be made for this song. Try another file."}
    finally:
        music_path.unlink(missing_ok=True)  # don't keep the player's music


def make_song_file(music_path: pathlib.Path, *, song: dict, difficulties: list[str]) -> str:
    raise NotImplementedError("Your step-making goes here: return the whole .ssc text.")


@app.get("/jobs/{job_id}")
def get_job(job_id: str, request: Request):
    status = status_by_job_id.get(job_id)
    if status is None:
        return {"state": "failed", "error": "This job was lost. Start the song again."}
    if status["state"] != "done":
        return status
    chart = WORK_FOLDER / job_id / "song.ssc"
    url = f"{str(request.base_url).rstrip('/')}/jobs/{job_id}/files/chart"
    return {"state": "done", "files": [{"kind": "chart", "url": url, "bytes": chart.stat().st_size}]}


@app.get("/jobs/{job_id}/files/chart")
def get_chart(job_id: str):
    return FileResponse(WORK_FOLDER / job_id / "song.ssc", media_type="text/plain; charset=utf-8")


@app.delete("/jobs/{job_id}")
def cancel_job(job_id: str):
    return {"cancelled": False, "error": "This generator can't stop a song once it has started."}
```

## 6. Test it before you share it

```bash
curl -s http://127.0.0.1:47870/manifest.json
curl -s -X POST http://127.0.0.1:47870/jobs -F 'request={"protocol":1,"song":{"title":"Test","artist":"Me","lengthSeconds":120,"album":null,"genre":null,"youtubeId":null},"difficulties":["Easy"],"options":{}};type=application/json' -F "music=@song.ogg;type=audio/ogg"
curl -s http://127.0.0.1:47870/jobs/<jobId>
```

Open the `.ssc` you get in StepMania 5 (put it in a song folder with the music as `music.ogg`) and play it. Then add the
address in Sync under **Generators** and make a song from there.

## Checklist

- [ ] Manifest has `kind: "generator"`, the difficulties you really make, `audio/ogg` in `musicTypes`.
- [ ] `POST /jobs` answers at once; the work runs in the background; status answers never hang.
- [ ] Every finished song has a `chart` file with a `dance-single` chart per difficulty asked, `#OFFSET` and `#BPMS`.
- [ ] File URLs are absolute and stay valid for an hour.
- [ ] Errors are one short sentence that tells the player what to do.
- [ ] You don't keep or share the music, ask for passwords, or track players. Your description says what you do with the music.

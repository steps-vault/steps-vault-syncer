import { describe, expect, it } from 'vitest';
import { buildGeneratedSongMarkerText } from '../ownership/generated-song-marker';
import type { GeneratedSong } from '../ownership/generated-songs';
import { buildEmptyInstalledSongsRecord, type InstalledSongsRecord } from '../ownership/installed-songs';
import { MemorySongsFolder } from '../songs-folder/memory-songs-folder';
import { encodeBase64Url, isSameSecret, LocalBridgePairing, MAX_PAIRING_TRIES_PER_MINUTE, MAX_WRONG_CODES_PER_PAIRING, PAIRING_CODE_LIFETIME_MILLISECONDS, type PairedBrowser } from './local-bridge-pairing';
import { STEPSVAULT_SITE_ORIGIN } from './local-bridge-protocol';
import { handleLocalBridgeRequest, type LocalBridgeRequest, type LocalBridgeResponse } from './local-bridge-requests';

const PORT = 47821;
const HOST = `127.0.0.1:${String(PORT)}`;
const GROUP_NAME = 'My generated songs';

function buildGeneratedSong(overrides: Partial<GeneratedSong> = {}): GeneratedSong {
  return {
    songKey: 'song:night drive\nlumen park',
    song: { title: 'Night Drive', artist: 'Lumen Park', album: null, genre: null, lengthSeconds: 201, youtubeId: null },
    generatorId: 'stepcat.tap-forge', generatorVersion: '1.2.0', generatorName: 'Tap Forge', difficulties: ['Easy', 'Hard'], levelsByDifficulty: { Easy: 3, Hard: 9 },
    installId: 'install-1', folderPath: [GROUP_NAME, 'Night Drive'], inPlaceOfVaultSongId: null, generatedAt: '2026-10-30T10:00:00.000Z',
    ...overrides,
  };
}

async function writeSongFolder({ songsFolder, generatedSong }: { songsFolder: MemorySongsFolder; generatedSong: GeneratedSong }): Promise<void> {
  const folder = generatedSong.folderPath;
  await songsFolder.writeText({ path: [...folder, 'Night Drive.ssc'], text: '#TITLE:Night Drive;\n#MUSIC:music.ogg;\n' });
  await songsFolder.writeBytes({ path: [...folder, 'music.ogg'], bytes: new Uint8Array([79, 103, 103, 83]) });
  await songsFolder.writeBytes({ path: [...folder, 'banner.png'], bytes: new Uint8Array([137, 80, 78, 71]) });
  await songsFolder.writeText({ path: [...folder, '.stepsvault.json'], text: buildGeneratedSongMarkerText(generatedSong) });
}

class MemoryPairedBrowserStore {
  savedBrowsers: readonly PairedBrowser[] = [];

  load(): Promise<PairedBrowser[]> {
    return Promise.resolve([...this.savedBrowsers]);
  }

  save(browsers: readonly PairedBrowser[]): Promise<void> {
    this.savedBrowsers = [...browsers];
    return Promise.resolve();
  }
}

async function buildBridge({ record, songsFolder = new MemorySongsFolder() }: { record?: InstalledSongsRecord; songsFolder?: MemorySongsFolder | null } = {}) {
  const generatedSong = buildGeneratedSong();
  const bridgeRecord = record ?? { ...buildEmptyInstalledSongsRecord(), generatedSongs: [generatedSong] };
  if (songsFolder && !record) await writeSongFolder({ songsFolder, generatedSong });
  const clock = { nowMilliseconds: Date.parse('2026-11-01T10:00:00.000Z') };
  let randomSeed = 0;
  const store = new MemoryPairedBrowserStore();
  const pairing = new LocalBridgePairing({
    store,
    getRandomBytes: (byteCount) => Uint8Array.from({ length: byteCount }, () => (randomSeed += 7) % 256),
    getNowMilliseconds: () => clock.nowMilliseconds,
  });
  await pairing.initialize();
  const dependencies = { pairing, getRecord: () => bridgeRecord, getSongsFolder: () => songsFolder, allowedOrigins: [STEPSVAULT_SITE_ORIGIN], port: PORT };
  const send = (request: Partial<LocalBridgeRequest>): Promise<LocalBridgeResponse> =>
    handleLocalBridgeRequest({ request: { method: 'GET', target: '/v1/songs', origin: STEPSVAULT_SITE_ORIGIN, host: HOST, authorization: null, isPrivateNetworkPreflight: false, bodyText: null, ...request }, dependencies });
  const pairBrowser = async (): Promise<string> => {
    const { code } = pairing.startPairing();
    const response = await send({ method: 'POST', target: '/v1/pairing', bodyText: JSON.stringify({ code }) });
    return (response.body as { kind: 'json'; value: { token: string } }).value.token;
  };
  return { pairing, store, clock, send, pairBrowser, songsFolder, generatedSong };
}

function getJson(response: LocalBridgeResponse): Record<string, unknown> {
  if (response.body.kind !== 'json') throw new Error('Expected a JSON answer.');
  return response.body.value as Record<string, unknown>;
}

describe('the local bridge refuses everyone but the paired StepsVault site', () => {
  it('refuses another website, without the CORS headers its page would need to read the answer', async () => {
    const { send, pairBrowser } = await buildBridge();
    const token = await pairBrowser();
    const response = await send({ origin: 'https://evil.example', authorization: `Bearer ${token}` });
    expect(response.status).toBe(403);
    expect(getJson(response).reason).toBe('origin-refused');
    expect(response.headers['Access-Control-Allow-Origin']).toBeUndefined();
    const preflight = await send({ method: 'OPTIONS', origin: 'https://dancedance.studio.evil.example', isPrivateNetworkPreflight: true });
    expect(preflight.status).toBe(403);
    expect(preflight.headers['Access-Control-Allow-Private-Network']).toBeUndefined();
  });

  it('refuses a request without an Origin, as curl or another program sends', async () => {
    const { send, pairBrowser } = await buildBridge();
    const response = await send({ origin: null, authorization: `Bearer ${await pairBrowser()}` });
    expect(response.status).toBe(403);
    expect(getJson(response).reason).toBe('origin-refused');
  });

  it('refuses the site without a token, with a wrong one, and after the player forgets paired browsers', async () => {
    const { send, pairBrowser, pairing } = await buildBridge();
    const token = await pairBrowser();
    expect((await send({})).status).toBe(401);
    expect(getJson(await send({})).reason).toBe('not-paired');
    expect((await send({ authorization: `Bearer ${token.slice(0, -1)}x` })).status).toBe(401);
    expect((await send({ authorization: token })).status).toBe(401);
    expect((await send({ authorization: `Bearer ${token}` })).status).toBe(200);
    await pairing.forgetPairedBrowsers();
    expect((await send({ authorization: `Bearer ${token}` })).status).toBe(401);
  });

  it('refuses a Host that isn’t its own loopback address, so a rebound name can’t reach it', async () => {
    const { send, pairBrowser } = await buildBridge();
    const token = await pairBrowser();
    expect(getJson(await send({ host: 'attacker.example:47821', authorization: `Bearer ${token}` })).reason).toBe('host-refused');
    expect((await send({ host: null, authorization: `Bearer ${token}` })).status).toBe(403);
    expect((await send({ host: 'localhost:47821', authorization: `Bearer ${token}` })).status).toBe(200);
  });

  it('answers the site’s preflight, with the Private Network Access header Chrome asks for', async () => {
    const { send } = await buildBridge();
    const preflight = await send({ method: 'OPTIONS', isPrivateNetworkPreflight: true });
    expect(preflight.status).toBe(204);
    expect(preflight.headers).toMatchObject({ 'Access-Control-Allow-Origin': STEPSVAULT_SITE_ORIGIN, 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' });
  });

  it('is read only: anything but GET is refused once paired', async () => {
    const { send, pairBrowser } = await buildBridge();
    expect((await send({ method: 'DELETE', authorization: `Bearer ${await pairBrowser()}` })).status).toBe(405);
  });
});

describe('pairing a browser', () => {
  it('trades the code Sync shows for a long random token, once', async () => {
    const { send, pairing, store } = await buildBridge();
    const { code } = pairing.startPairing();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const response = await send({ method: 'POST', target: '/v1/pairing', bodyText: JSON.stringify({ code: code.toLowerCase().replace('-', ' ') }) });
    expect(response.status).toBe(200);
    const { token } = getJson(response) as { token: string };
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.savedBrowsers.map((browser) => browser.token)).toEqual([token]);
    expect(getJson(await send({ method: 'POST', target: '/v1/pairing', bodyText: JSON.stringify({ code }) })).reason).toBe('no-pairing-code');
  });

  it('refuses a code after five minutes', async () => {
    const { send, pairing, clock } = await buildBridge();
    const { code } = pairing.startPairing();
    clock.nowMilliseconds += PAIRING_CODE_LIFETIME_MILLISECONDS;
    expect(pairing.getPendingCode()).toBeNull();
    const response = await send({ method: 'POST', target: '/v1/pairing', bodyText: JSON.stringify({ code }) });
    expect(response.status).toBe(410);
    expect(getJson(response).reason).toBe('code-expired');
  });

  it('throws the code away after five wrong ones, so the right one no longer works either', async () => {
    const { send, pairing } = await buildBridge();
    const { code } = pairing.startPairing();
    const reasons: unknown[] = [];
    for (let attempt = 0; attempt < MAX_WRONG_CODES_PER_PAIRING; attempt += 1) reasons.push(getJson(await send({ method: 'POST', target: '/v1/pairing', bodyText: JSON.stringify({ code: 'AAAA-AAAA' }) })).reason);
    expect(reasons).toEqual(['wrong-code', 'wrong-code', 'wrong-code', 'wrong-code', 'too-many-tries']);
    expect(getJson(await send({ method: 'POST', target: '/v1/pairing', bodyText: JSON.stringify({ code }) })).reason).toBe('no-pairing-code');
  });

  it('takes only a few tries a minute, even across new codes', async () => {
    const { send, pairing, clock } = await buildBridge();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < MAX_PAIRING_TRIES_PER_MINUTE; attempt += 1) {
      if (attempt % 4 === 0) pairing.startPairing();
      statuses.push((await send({ method: 'POST', target: '/v1/pairing', bodyText: JSON.stringify({ code: 'AAAA-AAAA' }) })).status);
    }
    const { code } = pairing.startPairing();
    expect((await send({ method: 'POST', target: '/v1/pairing', bodyText: JSON.stringify({ code }) })).status).toBe(429);
    clock.nowMilliseconds += 60_000;
    expect((await send({ method: 'POST', target: '/v1/pairing', bodyText: JSON.stringify({ code }) })).status).toBe(200);
    expect(statuses.every((status) => status === 403)).toBe(true);
  });

  it('refuses a pairing body it can’t read', async () => {
    const { send, pairing } = await buildBridge();
    pairing.startPairing();
    expect((await send({ method: 'POST', target: '/v1/pairing', bodyText: '{not json' })).status).toBe(400);
    expect((await send({ method: 'POST', target: '/v1/pairing', bodyText: JSON.stringify({ code: 7 }) })).status).toBe(400);
    expect((await send({ method: 'GET', target: '/v1/pairing' })).status).toBe(405);
  });
});

describe('the songs it serves', () => {
  it('lists the generated songs in Sync’s record, with their generator and levels', async () => {
    const { send, pairBrowser } = await buildBridge();
    const response = await send({ authorization: `Bearer ${await pairBrowser()}` });
    expect(getJson(response)).toEqual({
      protocol: 1,
      songs: [{
        songKey: 'song:night drive\nlumen park', title: 'Night Drive', artist: 'Lumen Park', generatorName: 'Tap Forge',
        difficulties: [{ difficulty: 'Easy', level: 3 }, { difficulty: 'Hard', level: 9 }],
        location: { groupName: GROUP_NAME, folderName: 'Night Drive' }, fileKinds: ['chart', 'music', 'banner'], generatedAt: '2026-10-30T10:00:00.000Z',
      }],
    });
  });

  it('serves a song’s files by song key and kind, from the song’s own folder', async () => {
    const { send, pairBrowser, generatedSong } = await buildBridge();
    const authorization = `Bearer ${await pairBrowser()}`;
    const music = await send({ target: `/v1/songs/${encodeURIComponent(generatedSong.songKey)}/music`, authorization });
    expect(music.body).toEqual({ kind: 'file', file: { songsPath: [GROUP_NAME, 'Night Drive', 'music.ogg'], contentType: 'audio/ogg' } });
    expect(music.headers['Content-Type']).toBe('audio/ogg');
    const chart = await send({ target: `/v1/songs/${encodeURIComponent(generatedSong.songKey)}/chart`, authorization });
    expect(chart.body).toEqual({ kind: 'file', file: { songsPath: [GROUP_NAME, 'Night Drive', 'Night Drive.ssc'], contentType: 'text/plain; charset=utf-8' } });
    expect((await send({ target: `/v1/songs/${encodeURIComponent(generatedSong.songKey)}/video`, authorization })).status).toBe(404);
  });

  it('answers 404 for an unknown song key or file kind', async () => {
    const { send, pairBrowser, generatedSong } = await buildBridge();
    const authorization = `Bearer ${await pairBrowser()}`;
    expect((await send({ target: '/v1/songs/song%3Anobody/chart', authorization })).status).toBe(404);
    expect((await send({ target: `/v1/songs/${encodeURIComponent(generatedSong.songKey)}/marker`, authorization })).status).toBe(404);
    expect((await send({ target: '/v1/nothing', authorization })).status).toBe(404);
  });

  it('never follows a path in the request out of the song’s folder', async () => {
    const { send, pairBrowser } = await buildBridge();
    const authorization = `Bearer ${await pairBrowser()}`;
    const traversals = ['/v1/songs/..%2F..%2F..%2FWindows%2Fwin.ini/chart', '/v1/songs/../../secret.txt', '/v1/songs/%2E%2E/chart', '/v1/songs/song%3Anight%20drive/..%2F.stepsvault.json', '/v1/songs/a/b/chart', '/v1/songs/%E0%A4%A/chart'];
    const responses = await Promise.all(traversals.map((target) => send({ target, authorization })));
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404, 400]);
    expect(responses.every((response) => response.body.kind !== 'file')).toBe(true);
  });

  it('leaves out a song whose folder the player replaced, and serves none of its files', async () => {
    const songsFolder = new MemorySongsFolder();
    const generatedSong = buildGeneratedSong();
    await writeSongFolder({ songsFolder, generatedSong: { ...generatedSong, installId: 'someone-else' } });
    const { send, pairBrowser } = await buildBridge({ record: { ...buildEmptyInstalledSongsRecord(), generatedSongs: [generatedSong] }, songsFolder });
    const authorization = `Bearer ${await pairBrowser()}`;
    expect(getJson(await send({ authorization })).songs).toEqual([]);
    expect((await send({ target: `/v1/songs/${encodeURIComponent(generatedSong.songKey)}/music`, authorization })).status).toBe(404);
  });

  it('says to connect the game first when there is none', async () => {
    const { send, pairBrowser } = await buildBridge({ songsFolder: null });
    expect((await send({ authorization: `Bearer ${await pairBrowser()}` })).status).toBe(503);
  });
});

describe('secrets', () => {
  it('compares in full and never takes an empty secret as a match', () => {
    expect(isSameSecret({ expected: 'ABCDEFGH', given: 'ABCDEFGH' })).toBe(true);
    expect(isSameSecret({ expected: 'ABCDEFGH', given: 'ABCDEFG' })).toBe(false);
    expect(isSameSecret({ expected: 'ABCDEFGH', given: 'ABCDEFGHI' })).toBe(false);
    expect(isSameSecret({ expected: '', given: '' })).toBe(false);
  });

  it('writes tokens in URL-safe base64 without padding', () => {
    expect(encodeBase64Url(new Uint8Array([251, 255, 191]))).toBe('-_-_');
    expect(encodeBase64Url(new Uint8Array([102, 111]))).toBe('Zm8');
  });
});

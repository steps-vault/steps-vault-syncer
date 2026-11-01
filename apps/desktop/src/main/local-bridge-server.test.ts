import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { request as sendHttpRequest, createServer as createPlainServer, type Server } from 'node:http';
import { connect } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildEmptyInstalledSongsRecord, buildGeneratedSongMarkerText, LocalBridgePairing, STEPSVAULT_SITE_ORIGIN, type GeneratedSong, type InstalledSongsRecord, type PairedBrowser } from '@stepsvault/sync-core';
import { getLocalBridgeOrigins } from './local-bridge-origins';
import { LocalBridgeServer } from './local-bridge-server';
import { MusicSourceRegistry } from './music-source-registry';
import { NodeSongsFolder } from './node-songs-folder';

const TEST_PORTS = [47921, 47922, 47923];
const MUSIC_BYTES = Buffer.from('OggS synthetic test bytes');

let workFolder: string;
let songsFolderPath: string;
let server: LocalBridgeServer;
let pairing: LocalBridgePairing;
let record: InstalledSongsRecord;
const blockingServers: Server[] = [];

function buildGeneratedSong(overrides: Partial<GeneratedSong> = {}): GeneratedSong {
  return {
    songKey: 'song:night drive\nlumen park', song: { title: 'Night Drive', artist: 'Lumen Park', album: null, genre: null, lengthSeconds: 201, youtubeId: null },
    generatorId: 'stepcat.tap-forge', generatorVersion: '1.2.0', generatorName: 'Tap Forge', difficulties: ['Hard'], levelsByDifficulty: { Hard: 9 },
    installId: 'install-1', folderPath: ['My generated songs', 'Night Drive'], inPlaceOfVaultSongId: null, generatedAt: '2026-10-30T10:00:00.000Z', ...overrides,
  };
}

async function writeSongFolder({ folder, generatedSong }: { folder: string; generatedSong: GeneratedSong }): Promise<void> {
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'Night Drive.ssc'), '#TITLE:Night Drive;\n#MUSIC:music.ogg;\n');
  await writeFile(path.join(folder, 'music.ogg'), MUSIC_BYTES);
  await writeFile(path.join(folder, '.stepsvault.json'), buildGeneratedSongMarkerText(generatedSong));
}

async function startServer({ ports = TEST_PORTS }: { ports?: readonly number[] } = {}): Promise<number> {
  const songsFolder = new NodeSongsFolder({ rootFolder: songsFolderPath, musicSources: new MusicSourceRegistry(), convertMusicToWav: () => Promise.resolve(new Uint8Array()) });
  let savedBrowsers: readonly PairedBrowser[] = [];
  pairing = new LocalBridgePairing({
    store: { load: () => Promise.resolve([...savedBrowsers]), save: (browsers) => { savedBrowsers = browsers; return Promise.resolve(); } },
    getRandomBytes: (byteCount) => Uint8Array.from({ length: byteCount }, (_, index) => (index * 37 + 11) % 256),
    getNowMilliseconds: () => Date.now(),
  });
  await pairing.initialize();
  server = new LocalBridgeServer({ dependencies: { pairing, getRecord: () => record, getSongsFolder: () => songsFolder, allowedOrigins: [STEPSVAULT_SITE_ORIGIN] }, openSongFile: (songsPath) => songsFolder.openFileForReading(songsPath), ports });
  const port = await server.start();
  if (port === null) throw new Error('The test bridge found no free port.');
  return port;
}

interface TestAnswer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function send({ port, method = 'GET', target, headers = {}, body }: { port: number; method?: string; target: string; headers?: Record<string, string>; body?: string }): Promise<TestAnswer> {
  return new Promise((resolve, reject) => {
    const request = sendHttpRequest({ host: '127.0.0.1', port, method, path: target, headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => { resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }); });
    });
    request.on('error', reject);
    request.end(body);
  });
}

async function pairBrowser(port: number): Promise<string> {
  const { code } = pairing.startPairing();
  const answer = await send({ port, method: 'POST', target: '/v1/pairing', headers: { Origin: STEPSVAULT_SITE_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  return (JSON.parse(answer.body.toString('utf8')) as { token: string }).token;
}

function isRefusedConnection({ host, port }: { host: string; port: number }): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    socket.setTimeout(2000, () => { socket.destroy(); resolve(true); });
    socket.on('connect', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { resolve(true); });
  });
}

beforeEach(async () => {
  workFolder = await mkdtemp(path.join(os.tmpdir(), 'stepsvault-bridge-test-'));
  songsFolderPath = path.join(workFolder, 'Songs');
  const generatedSong = buildGeneratedSong();
  await writeSongFolder({ folder: path.join(songsFolderPath, ...generatedSong.folderPath), generatedSong });
  record = { ...buildEmptyInstalledSongsRecord(), generatedSongs: [generatedSong] };
});

afterEach(async () => {
  await server.stop();
  await Promise.all(blockingServers.splice(0).map((blockingServer) => new Promise((resolve) => blockingServer.close(resolve))));
  await rm(workFolder, { recursive: true, force: true });
});

describe('the local bridge server', () => {
  it('listens on 127.0.0.1 only: not on ::1 and not on this computer’s network addresses', async () => {
    const port = await startServer();
    expect(await isRefusedConnection({ host: '127.0.0.1', port })).toBe(false);
    expect(await isRefusedConnection({ host: '::1', port })).toBe(true);
    const networkAddresses = Object.values(os.networkInterfaces()).flat().flatMap((networkInterface) => (networkInterface && !networkInterface.internal && networkInterface.family === 'IPv4' ? [networkInterface.address] : []));
    for (const address of networkAddresses) expect(await isRefusedConnection({ host: address, port })).toBe(true);
  });

  it('moves to the next port when one is taken', async () => {
    const blockingServer = createPlainServer();
    blockingServers.push(blockingServer);
    await new Promise<void>((resolve) => blockingServer.listen({ host: '127.0.0.1', port: TEST_PORTS[0] }, resolve));
    expect(await startServer()).toBe(TEST_PORTS[1]);
  });

  it('refuses another website and a request without a token, over real HTTP', async () => {
    const port = await startServer();
    const token = await pairBrowser(port);
    const otherOrigin = await send({ port, target: '/v1/songs', headers: { Origin: 'https://evil.example', Authorization: `Bearer ${token}` } });
    expect(otherOrigin.status).toBe(403);
    expect(otherOrigin.headers['access-control-allow-origin']).toBeUndefined();
    const noOrigin = await send({ port, target: '/v1/songs', headers: { Authorization: `Bearer ${token}` } });
    expect(noOrigin.status).toBe(403);
    const noToken = await send({ port, target: '/v1/songs', headers: { Origin: STEPSVAULT_SITE_ORIGIN } });
    expect(noToken.status).toBe(401);
    expect(noToken.headers['access-control-allow-origin']).toBe(STEPSVAULT_SITE_ORIGIN);
    const paired = await send({ port, target: '/v1/songs', headers: { Origin: STEPSVAULT_SITE_ORIGIN, Authorization: `Bearer ${token}` } });
    expect(paired.status).toBe(200);
    expect((JSON.parse(paired.body.toString('utf8')) as { songs: Array<{ title: string }> }).songs.map((song) => song.title)).toEqual(['Night Drive']);
  });

  it('answers Chrome’s Private Network Access preflight for the site', async () => {
    const port = await startServer();
    const preflight = await send({ port, method: 'OPTIONS', target: '/v1/songs', headers: { Origin: STEPSVAULT_SITE_ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization', 'Access-Control-Request-Private-Network': 'true' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-private-network']).toBe('true');
    expect(preflight.headers['access-control-allow-origin']).toBe(STEPSVAULT_SITE_ORIGIN);
  });

  it('sends a song’s music, byte for byte, and refuses paths that climb out of the song', async () => {
    const port = await startServer();
    const headers = { Origin: STEPSVAULT_SITE_ORIGIN, Authorization: `Bearer ${await pairBrowser(port)}` };
    const music = await send({ port, target: `/v1/songs/${encodeURIComponent('song:night drive\nlumen park')}/music`, headers });
    expect(music.status).toBe(200);
    expect(music.headers['content-type']).toBe('audio/ogg');
    expect(music.body.equals(MUSIC_BYTES)).toBe(true);
    await writeFile(path.join(workFolder, 'secret.txt'), 'private');
    const traversals = await Promise.all(['/v1/songs/../../secret.txt', '/v1/songs/..%2F..%2F..%2Fsecret.txt/chart', '/v1/songs/song%3Anight%20drive%0Alumen%20park/..%2F..%2F..%2Fsecret.txt'].map((target) => send({ port, target, headers })));
    expect(traversals.map((answer) => answer.status)).toEqual([404, 404, 404]);
    expect(traversals.some((answer) => answer.body.toString('utf8').includes('private'))).toBe(false);
    expect((await send({ port, target: '/v1/songs/song%3Anobody/music', headers })).status).toBe(404);
  });

  it('never follows a link out of the Songs folder', async () => {
    const outsideFolder = path.join(workFolder, 'Documents', 'Night Drive');
    const generatedSong = buildGeneratedSong({ folderPath: ['Linked', 'Night Drive'] });
    await writeSongFolder({ folder: outsideFolder, generatedSong });
    await symlink(path.dirname(outsideFolder), path.join(songsFolderPath, 'Linked'), 'junction');
    record = { ...buildEmptyInstalledSongsRecord(), generatedSongs: [generatedSong] };
    const port = await startServer();
    const headers = { Origin: STEPSVAULT_SITE_ORIGIN, Authorization: `Bearer ${await pairBrowser(port)}` };
    expect((await send({ port, target: `/v1/songs/${encodeURIComponent(generatedSong.songKey)}/music`, headers })).status).toBe(404);
    expect((JSON.parse((await send({ port, target: '/v1/songs', headers })).body.toString('utf8')) as { songs: unknown[] }).songs).toEqual([]);
  });

  it('refuses a pairing body that is too long', async () => {
    const port = await startServer();
    pairing.startPairing();
    const answer = await send({ port, method: 'POST', target: '/v1/pairing', headers: { Origin: STEPSVAULT_SITE_ORIGIN }, body: 'x'.repeat(4096) }).catch(() => ({ status: 413 }));
    expect(answer.status).toBe(413);
  });
});

describe('which website origins the bridge answers', () => {
  it('answers only https://dancedance.studio in an installed copy, whatever the environment says', () => {
    expect(getLocalBridgeOrigins({ isPackaged: true, siteUrl: 'http://localhost:5173', developmentOriginsText: 'http://localhost:9999' })).toEqual(['https://dancedance.studio']);
  });

  it('adds the test site and listed origins in a development run, as exact origins only', () => {
    expect(getLocalBridgeOrigins({ isPackaged: false, siteUrl: 'http://localhost:5173/', developmentOriginsText: 'https://localhost:6100/path, file:///x, not a url' })).toEqual(['https://dancedance.studio', 'http://localhost:5173', 'https://localhost:6100']);
  });
});

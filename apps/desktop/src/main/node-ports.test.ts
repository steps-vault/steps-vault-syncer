import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpRequestError, scanMusicLibrary, SongsFolderError } from '@stepsvault/sync-core';
import { JsonFileStore } from './json-file-store';
import { MusicSourceRegistry } from './music-source-registry';
import { NodeHttpClient } from './node-http-client';
import { NodeMusicLibrary } from './node-music-library';
import { NodeSongsFolder } from './node-songs-folder';

let workFolder: string;
let songsFolderPath: string;
let musicSources: MusicSourceRegistry;
let songsFolder: NodeSongsFolder;
const convertedWav = new Uint8Array([82, 73, 70, 70]);

beforeEach(async () => {
  workFolder = await mkdtemp(path.join(os.tmpdir(), 'stepsvault-sync-test-'));
  songsFolderPath = path.join(workFolder, 'Songs');
  await mkdir(songsFolderPath);
  musicSources = new MusicSourceRegistry();
  songsFolder = new NodeSongsFolder({ rootFolder: songsFolderPath, musicSources, convertMusicToWav: () => Promise.resolve(convertedWav) });
});

afterEach(async () => {
  await rm(workFolder, { recursive: true, force: true });
});

async function expectFailure(promise: Promise<unknown>, failure: SongsFolderError['failure']): Promise<void> {
  const error: unknown = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(SongsFolderError);
  expect((error as SongsFolderError).failure).toBe(failure);
}

describe('NodeSongsFolder', () => {
  it('writes, lists, reads, renames and removes inside the Songs folder', async () => {
    await songsFolder.writeText({ path: ['StepsVault', 'Sorry', 'Sorry.ssc'], text: '#TITLE:Sorry;' });
    expect(await songsFolder.listEntries(['StepsVault'])).toEqual([{ name: 'Sorry', isFolder: true }]);
    expect(await songsFolder.readText(['StepsVault', 'Sorry', 'Sorry.ssc'])).toBe('#TITLE:Sorry;');
    expect(await songsFolder.readText(['StepsVault', 'Nope.ssc'])).toBeNull();
    expect(await songsFolder.listEntries(['Missing'])).toEqual([]);
    await songsFolder.rename({ from: ['StepsVault', 'Sorry'], to: ['Pop', 'Sorry'] });
    expect(await readFile(path.join(songsFolderPath, 'Pop', 'Sorry', 'Sorry.ssc'), 'utf8')).toBe('#TITLE:Sorry;');
    await songsFolder.removeFolder(['Pop', 'Sorry']);
    expect(await songsFolder.listEntries(['Pop'])).toEqual([]);
  });

  it.each([[['..', 'outside.txt']], [['Pop', '..', '..', 'outside.txt']], [['C:\\Windows', 'x.txt']], [['Pop/../..', 'x.txt']], [['']]])('refuses %j, which would leave the Songs folder', async (songsPath) => {
    await expectFailure(songsFolder.writeText({ path: songsPath, text: 'x' }), 'no-permission');
  });

  it('never goes through a link or junction inside the Songs folder', async () => {
    const outside = path.join(workFolder, 'Documents');
    await mkdir(outside);
    await symlink(outside, path.join(songsFolderPath, 'Linked'), 'junction');
    await expectFailure(songsFolder.writeText({ path: ['Linked', 'x.txt'], text: 'x' }), 'no-permission');
    await expectFailure(songsFolder.removeFolder(['Linked']), 'no-permission');
  });

  it('never renames onto something that exists, and never removes the whole Songs folder', async () => {
    await songsFolder.writeText({ path: ['StepsVault', 'Sorry', 'a.ssc'], text: 'ours' });
    await songsFolder.writeText({ path: ['Pop', 'Sorry', 'b.ssc'], text: 'theirs' });
    await expectFailure(songsFolder.rename({ from: ['StepsVault', 'Sorry'], to: ['Pop', 'Sorry'] }), 'already-exists');
    expect(await songsFolder.readText(['Pop', 'Sorry', 'b.ssc'])).toBe('theirs');
    await expectFailure(songsFolder.removeFolder([]), 'no-permission');
  });

  it('copies ogg, mp3 and wav as they are, and converts other formats to WAV', async () => {
    const oggPath = path.join(workFolder, 'Cheap Thrills.OGG');
    const m4aPath = path.join(workFolder, 'Cheap Thrills.m4a');
    await writeFile(oggPath, 'OggS');
    await writeFile(m4aPath, 'ftypM4A');
    expect(await songsFolder.copyMusic({ sourceId: musicSources.register(oggPath), folder: ['StepsVault', 'Cheap Thrills'], baseName: 'music' })).toBe('music.ogg');
    expect(await songsFolder.copyMusic({ sourceId: musicSources.register(m4aPath), folder: ['StepsVault', 'Other'], baseName: 'music' })).toBe('music.wav');
    expect(new Uint8Array(await readFile(path.join(songsFolderPath, 'StepsVault', 'Other', 'music.wav')))).toEqual(convertedWav);
    await expectFailure(songsFolder.copyMusic({ sourceId: 'file:unknown', folder: ['StepsVault', 'X'], baseName: 'music' }), 'not-found');
  });
});

describe('NodeMusicLibrary', () => {
  it('finds audio files in nested folders, skips hidden folders and other files, and gives stable ids', async () => {
    const musicFolder = path.join(workFolder, 'Music');
    await mkdir(path.join(musicFolder, 'Sia', 'This Is Acting'), { recursive: true });
    await mkdir(path.join(musicFolder, '.cache'), { recursive: true });
    await writeFile(path.join(musicFolder, 'Sia', 'This Is Acting', 'Cheap Thrills.mp3'), 'x');
    await writeFile(path.join(musicFolder, 'Sia', 'cover.jpg'), 'x');
    await writeFile(path.join(musicFolder, '.cache', 'hidden.mp3'), 'x');
    const index = await scanMusicLibrary({ musicLibrary: new NodeMusicLibrary({ musicFolders: [musicFolder], musicSources }) });
    expect(index.fileCount).toBe(1);
    const [file] = index.filesByTitleKey.get('cheap thrills') ?? [];
    expect(file?.folderNames).toEqual(['Music', 'Sia', 'This Is Acting']);
    expect(file?.sourceId).toBe(new MusicSourceRegistry().register(path.join(musicFolder, 'Sia', 'This Is Acting', 'Cheap Thrills.mp3')));
  });
});

describe('NodeHttpClient', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer((request, response) => {
      if (request.url === '/json') response.end(JSON.stringify({ isOk: true }));
      else if (request.url === '/big') response.end('x'.repeat(10_000));
      else if (request.url === '/slow') setTimeout(() => response.end('late'), 2_000);
      else if (request.url === '/redirect') response.writeHead(302, { Location: 'https://example.org/' }).end();
      else response.writeHead(404).end('{"message":"Not found."}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => { resolve(); }));
  });

  const client = new NodeHttpClient({ appVersion: '0.1.0' });
  const request = (pathName: string, overrides: { timeoutMilliseconds?: number; maxResponseBytes?: number } = {}) => ({ url: `${baseUrl}${pathName}`, method: 'GET' as const, timeoutMilliseconds: 1_000, maxResponseBytes: 1_000, ...overrides });

  it('returns JSON and statuses without throwing on 404', async () => {
    expect(await client.requestJson(request('/json'))).toEqual({ status: 200, body: { isOk: true } });
    expect(await client.requestJson(request('/missing'))).toEqual({ status: 404, body: { message: 'Not found.' } });
  });

  it.each([
    ['/big', 'too-large'],
    ['/slow', 'timeout'],
    ['/redirect', 'network'],
  ])('fails %s as %s', async (pathName, failure) => {
    const error: unknown = await client.requestText(request(pathName, { timeoutMilliseconds: 300 })).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpRequestError);
    expect((error as HttpRequestError).failure).toBe(failure);
  });
});

describe('JsonFileStore', () => {
  it('saves, loads, and starts over from a file it cannot read, keeping that file aside', async () => {
    const filePath = path.join(workFolder, 'data', 'record.json');
    const store = new JsonFileStore<{ count: number }>({ filePath, buildDefault: () => ({ count: 0 }), parse: (value) => value as { count: number } });
    expect(await store.load()).toEqual({ count: 0 });
    await store.save({ count: 3 });
    expect(await store.load()).toEqual({ count: 3 });
    await writeFile(filePath, '{"count": 3');
    expect(await store.load()).toEqual({ count: 0 });
    expect(await readFile(`${filePath}.unreadable`, 'utf8')).toBe('{"count": 3');
  });
});

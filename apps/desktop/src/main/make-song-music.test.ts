import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildInstalledAddon, scanMusicLibrary, type AddonManifest, type GeneratorManifest, type HttpClient, type HttpResponse } from '@stepsvault/sync-core';
import { MakeSongMusic, type MakeSongMusicPorts } from './make-song-music';
import { MusicSourceRegistry } from './music-source-registry';
import { NodeMusicLibrary } from './node-music-library';

const MANIFEST: GeneratorManifest = { protocol: 1, kind: 'generator', id: 'stepcat.tap-forge', name: 'Tap Forge', version: '1.2.0', author: '@stepcat', description: '', difficulties: ['Easy'], musicTypes: ['audio/ogg', 'audio/mpeg'], usesVideo: true, maxMusicBytes: 1_000_000, options: [] };
const SONG_SOURCE: AddonManifest = { protocol: 1, kind: 'addon', id: 'tube.songs', name: 'Tube Songs', version: '0.2.0', author: '@noa', description: '', provides: ['song-source'], options: [], inputs: [{ id: 'link', kind: 'link', label: 'YouTube link', placeholder: null, sites: ['youtube.com', 'youtu.be'] }] };

let workFolder: string;
let jobFolder: string;

beforeEach(async () => {
  workFolder = await mkdtemp(path.join(os.tmpdir(), 'stepsvault-make-song-test-'));
  jobFolder = path.join(workFolder, 'jobs', 'job-1');
  await mkdir(jobFolder, { recursive: true });
});

afterEach(async () => {
  await rm(workFolder, { recursive: true, force: true });
});

function buildMakeSongMusic(overrides: Partial<MakeSongMusicPorts> = {}): { makeSongMusic: MakeSongMusic; musicSources: MusicSourceRegistry; downloads: string[] } {
  const musicSources = new MusicSourceRegistry();
  const downloads: string[] = [];
  const makeSongMusic = new MakeSongMusic({
    httpClient: { requestJson: () => Promise.reject(new Error('offline')), requestText: () => Promise.reject(new Error('Not used.')), requestBytes: () => Promise.reject(new Error('Not used.')) },
    musicSources,
    measureLength: () => Promise.resolve(200.6),
    convertToWav: () => Promise.resolve(new Uint8Array([82, 73, 70, 70])),
    downloadFile: async ({ url, filePath }) => { downloads.push(url); await writeFile(filePath, url.endsWith('.mp4') ? 'video' : 'OggS'); },
    waitMilliseconds: () => Promise.resolve(),
    ...overrides,
  });
  return { makeSongMusic, musicSources, downloads };
}

describe('MakeSongMusic', () => {
  it('sends a picked file as it is when the generator takes its type, with facts from its name and its measured length', async () => {
    const filePath = path.join(workFolder, 'Lumen Park - Night Drive.mp3');
    await writeFile(filePath, 'ID3-music');
    const { makeSongMusic } = buildMakeSongMusic();
    const music = makeSongMusic.addPickedFile(filePath);
    expect(music).toMatchObject({ title: 'Night Drive', artist: 'Lumen Park', sourceText: 'Lumen Park - Night Drive.mp3' });
    const prepared = await makeSongMusic.prepareMusic({ musicId: music.musicId, manifest: MANIFEST, jobFolder });
    expect(prepared).toMatchObject({ song: { title: 'Night Drive', artist: 'Lumen Park', lengthSeconds: 201, youtubeId: null }, music: { fileName: 'Lumen Park - Night Drive.mp3', contentType: 'audio/mpeg', bytes: 9 }, video: null, playerMusicLocation: filePath });
  });

  it('converts a file to WAV for a generator that takes WAV but not its type, and refuses when it takes neither', async () => {
    const filePath = path.join(workFolder, 'Night Drive.flac');
    await writeFile(filePath, 'fLaC');
    const { makeSongMusic, musicSources } = buildMakeSongMusic();
    const music = makeSongMusic.addPickedFile(filePath);
    await expect(makeSongMusic.prepareMusic({ musicId: music.musicId, manifest: MANIFEST, jobFolder })).rejects.toThrow('Tap Forge doesn’t take this kind of music file. Pick a file of one of these types: audio/ogg, audio/mpeg.');
    const prepared = await makeSongMusic.prepareMusic({ musicId: music.musicId, manifest: { ...MANIFEST, musicTypes: ['audio/ogg', 'audio/wav'] }, jobFolder });
    expect(prepared.music).toMatchObject({ fileName: 'Night Drive.wav', contentType: 'audio/wav', bytes: 4 });
    expect(await readFile(musicSources.getSource(prepared.music.sourceId)?.filePath ?? '', 'utf8')).toBe('RIFF');
    expect(prepared.playerMusicLocation).toBe(filePath);
  });

  it('finds music in the scanned folders by the words typed', async () => {
    const musicFolder = path.join(workFolder, 'Music', 'Lumen Park');
    await mkdir(musicFolder, { recursive: true });
    await writeFile(path.join(musicFolder, 'Night Drive.ogg'), 'OggS');
    const { makeSongMusic, musicSources } = buildMakeSongMusic();
    const index = await scanMusicLibrary({ musicLibrary: new NodeMusicLibrary({ musicFolders: [path.join(workFolder, 'Music')], musicSources }) });
    const [music] = makeSongMusic.searchMusicFolders({ index, query: 'lumen night' });
    expect(music).toMatchObject({ title: 'Night Drive', artist: 'Unknown artist', sourceText: 'Music\\Lumen Park\\Night Drive.ogg' });
    expect(makeSongMusic.searchMusicFolders({ index: null, query: 'night' })).toEqual([]);
  });

  it('finds a song with a song source, then downloads its music and video into the job folder when it is made', async () => {
    const answer: HttpResponse<unknown> = { status: 200, body: { song: { title: 'Low Tide', artist: 'Marla Quinn', lengthSeconds: 242, youtubeId: 'dQw4w9WgXcQ' }, links: [{ kind: 'file-url', url: 'https://files.example.org/low-tide.ogg', label: 'Music', fileName: 'low-tide.ogg' }, { kind: 'file-url', media: 'video', url: 'https://files.example.org/low-tide.mp4', label: 'Video', fileName: null }] } };
    const httpClient: HttpClient = { requestJson: () => Promise.resolve(answer), requestText: () => Promise.reject(new Error('Not used.')), requestBytes: () => Promise.reject(new Error('Not used.')) };
    const { makeSongMusic, downloads } = buildMakeSongMusic({ httpClient });
    const addon = buildInstalledAddon({ baseUrl: 'http://127.0.0.1:7801', manifest: SONG_SOURCE, consentedAt: '' });
    const result = await makeSongMusic.findSong({ addon, valuesByInputId: { link: 'https://youtu.be/dQw4w9WgXcQ' } });
    if (result.kind !== 'found') throw new Error(`Expected a song, got ${result.kind}.`);
    expect(result.musics).toMatchObject([{ title: 'Low Tide', artist: 'Marla Quinn', sourceText: 'From Tube Songs', lengthText: '4:02', hasVideo: true }]);
    expect(downloads).toEqual([]);
    const musicId = result.musics[0]?.musicId ?? '';
    const prepared = await makeSongMusic.prepareMusic({ musicId, manifest: MANIFEST, jobFolder });
    expect(downloads).toEqual(['https://files.example.org/low-tide.ogg', 'https://files.example.org/low-tide.mp4']);
    expect(prepared).toMatchObject({ song: { title: 'Low Tide', lengthSeconds: 242, youtubeId: 'dQw4w9WgXcQ' }, music: { contentType: 'audio/ogg' }, video: { contentType: 'video/mp4' }, playerMusicLocation: path.join(jobFolder, 'source-music.ogg'), playerVideoLocation: path.join(jobFolder, 'source-video.mp4') });
  });

  it('offers every song a song source found, and downloads only the one the player makes', async () => {
    const choice = (title: string, url: string): unknown => ({ song: { title, artist: 'Lumen Park' }, links: [{ kind: 'file-url', url, label: 'Music', fileName: null }] });
    const answer: HttpResponse<unknown> = { status: 200, body: { choices: [choice('Night Drive', 'https://files.example.org/a.ogg'), choice('Night Drive (Live)', 'https://files.example.org/b.ogg')] } };
    const httpClient: HttpClient = { requestJson: () => Promise.resolve(answer), requestText: () => Promise.reject(new Error('Not used.')), requestBytes: () => Promise.reject(new Error('Not used.')) };
    const { makeSongMusic, downloads } = buildMakeSongMusic({ httpClient });
    const addon = buildInstalledAddon({ baseUrl: 'http://127.0.0.1:7801', manifest: SONG_SOURCE, consentedAt: '' });
    const result = await makeSongMusic.findSong({ addon, valuesByInputId: { link: 'https://youtu.be/dQw4w9WgXcQ' } });
    if (result.kind !== 'found') throw new Error(`Expected songs, got ${result.kind}.`);
    expect(result.musics.map((music) => music.title)).toEqual(['Night Drive', 'Night Drive (Live)']);
    await makeSongMusic.prepareMusic({ musicId: result.musics[1]?.musicId ?? '', manifest: MANIFEST, jobFolder });
    expect(downloads).toEqual(['https://files.example.org/b.ogg']);
  });

  it('shows a refused input under its field, without calling the addon', async () => {
    const { makeSongMusic } = buildMakeSongMusic();
    const addon = buildInstalledAddon({ baseUrl: 'http://127.0.0.1:7801', manifest: SONG_SOURCE, consentedAt: '' });
    expect(await makeSongMusic.findSong({ addon, valuesByInputId: { link: 'https://example.org/song' } })).toEqual({ kind: 'invalid-input', inputId: 'link', message: 'Paste a link from youtube.com or youtu.be.' });
    expect(await makeSongMusic.findSong({ addon, valuesByInputId: { link: 'https://youtu.be/dQw4w9WgXcQ' } })).toMatchObject({ kind: 'not-answering' });
  });
});

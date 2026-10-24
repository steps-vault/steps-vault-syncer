import { describe, expect, it } from 'vitest';
import { buildInstalledAddon, type InstalledAddon } from '../addons/addon-client';
import { HttpRequestError, type HttpClient, type HttpResponse } from '../network/http-client';
import type { AudioMatch } from '../planner/sync-plan-types';
import { findAudioForSong, type AudioSearchOptions, type AudioSearchSong } from './audio-search';
import { findMusicCandidates, scanMusicLibrary, type MusicFile, type MusicLibrary } from './music-library';
import { getFileNameFacts, getSongNameKey } from './song-names';

const CHEAP_THRILLS: AudioSearchSong = { vaultSongId: 'a', title: 'Cheap Thrills', artist: 'Sia', album: 'This Is Acting', genre: 'Pop', lengthSeconds: 224, youtubeId: null, youtubeUrl: null };

function buildMusicFile(overrides: Partial<MusicFile> & { sourceId: string; fileName: string }): MusicFile {
  return { folderNames: [], taggedTitle: null, taggedArtist: null, ...overrides };
}

class ListedMusicLibrary implements MusicLibrary {
  constructor(private readonly files: MusicFile[]) {}

  async *listMusicFiles({ shouldStop }: { shouldStop: () => boolean }): AsyncIterable<MusicFile> {
    for (const file of this.files) {
      if (shouldStop()) return;
      yield await Promise.resolve(file);
    }
  }
}

/** The sound check, with fixed answers per file. */
function buildChecker(matchesBySourceId: Record<string, 'matched' | 'different-edit'>): { checkAudioSource: AudioSearchOptions['checkAudioSource']; checkedSourceIds: string[] } {
  const checkedSourceIds: string[] = [];
  return {
    checkedSourceIds,
    checkAudioSource: ({ sourceId }) => {
      checkedSourceIds.push(sourceId);
      const kind = matchesBySourceId[sourceId] ?? 'different-edit';
      const match: AudioMatch = kind === 'matched' ? { kind, sourceId, shiftSeconds: 0.1 } : { kind, sourceId };
      return Promise.resolve(match);
    },
  };
}

function buildAddonHttpClient(answersByUrl: Record<string, HttpResponse<unknown> | 'offline'>): HttpClient {
  return {
    requestJson: ({ url }) => {
      const answer = answersByUrl[url];
      if (!answer || answer === 'offline') return Promise.reject(new HttpRequestError({ failure: 'network', message: 'offline' }));
      return Promise.resolve(answer);
    },
    requestText: () => Promise.reject(new Error('unused')),
    requestBytes: () => Promise.reject(new Error('unused')),
  };
}

const NO_ADDONS: Pick<AudioSearchOptions, 'addons' | 'httpClient' | 'downloadAddonFile'> = { addons: [], httpClient: buildAddonHttpClient({}), downloadAddonFile: () => Promise.reject(new Error('unused')) };

function buildAddon(name: string): InstalledAddon {
  return buildInstalledAddon({ baseUrl: `https://${name}.example.org`, manifest: { protocol: 1, id: `${name}.addon`, name, version: '1.0.0', author: 'someone', description: '', provides: ['audio-links'] }, consentedAt: '2026-10-24T10:00:00Z' });
}

describe('song names', () => {
  it.each([
    ['Beyoncé – Sorry (Official Video) [HD]', 'beyonce sorry'],
    ['Cheap Thrills (feat. Sean Paul)', 'cheap thrills'],
    ['CHEAP   THRILLS!!', 'cheap thrills'],
    ['Sorry (Remastered 2016)', 'sorry'],
    ['Watch Me (Whip / Nae Nae)', 'watch me whip nae nae'],
  ])('%j has the key %j', (text, key) => {
    expect(getSongNameKey(text)).toBe(key);
  });

  it('reads artist and title from file names without tags', () => {
    expect(getFileNameFacts('03 - Sia - Cheap Thrills.mp3')).toEqual({ artist: 'Sia', title: 'Cheap Thrills' });
    expect(getFileNameFacts('Cheap Thrills.ogg')).toEqual({ artist: null, title: 'Cheap Thrills' });
  });
});

describe('scanning music folders', () => {
  it('indexes files by title, reports progress and can be stopped', async () => {
    const files = Array.from({ length: 250 }, (_, index) => buildMusicFile({ sourceId: `f${String(index)}`, fileName: `Song ${String(index)}.mp3` }));
    const progress: number[] = [];
    const index = await scanMusicLibrary({ musicLibrary: new ListedMusicLibrary(files), onProgress: ({ scannedFileCount }) => progress.push(scannedFileCount) });
    expect(index.fileCount).toBe(250);
    expect(progress).toEqual([100, 200, 250]);
    let seen = 0;
    const stopped = await scanMusicLibrary({ musicLibrary: new ListedMusicLibrary(files), shouldStop: () => (seen += 1) > 10 });
    expect(stopped.fileCount).toBeLessThan(10);
  });

  it('never offers another artist’s song with the same title', async () => {
    const index = await scanMusicLibrary({
      musicLibrary: new ListedMusicLibrary([
        buildMusicFile({ sourceId: 'beyonce', fileName: 'Beyoncé - Sorry.mp3' }),
        buildMusicFile({ sourceId: 'bieber', fileName: 'Sorry.mp3', taggedTitle: 'Sorry', taggedArtist: 'Justin Bieber' }),
        buildMusicFile({ sourceId: 'unknown', fileName: 'sorry.ogg' }),
        buildMusicFile({ sourceId: 'in-artist-folder', fileName: 'Sorry.flac', folderNames: ['Music', 'Justin Bieber', 'Purpose'] }),
      ]),
    });
    expect(findMusicCandidates({ index, title: 'Sorry', artist: 'Justin Bieber' }).map((file) => file.sourceId)).toEqual(['bieber', 'in-artist-folder', 'unknown']);
  });
});

describe('findAudioForSong', () => {
  it('picks the album version over the radio edit next to it, whatever the order', async () => {
    const index = await scanMusicLibrary({
      musicLibrary: new ListedMusicLibrary([
        buildMusicFile({ sourceId: 'radio-edit', fileName: 'Sia - Cheap Thrills (Radio Edit).mp3', taggedTitle: 'Cheap Thrills', taggedArtist: 'Sia' }),
        buildMusicFile({ sourceId: 'album', fileName: 'Sia - Cheap Thrills.mp3' }),
      ]),
    });
    const { checkAudioSource } = buildChecker({ album: 'matched' });
    const result = await findAudioForSong({ song: CHEAP_THRILLS, pickedSourceId: null, musicIndex: index, checkAudioSource, ...NO_ADDONS });
    expect(result.match).toEqual({ kind: 'matched', sourceId: 'album', shiftSeconds: 0.1 });
  });

  it('uses only the picked file, and calls it a different edit when it doesn’t match', async () => {
    const index = await scanMusicLibrary({ musicLibrary: new ListedMusicLibrary([buildMusicFile({ sourceId: 'album', fileName: 'Sia - Cheap Thrills.mp3' })]) });
    const checker = buildChecker({ album: 'matched' });
    const result = await findAudioForSong({ song: CHEAP_THRILLS, pickedSourceId: 'picked-radio-edit', musicIndex: index, checkAudioSource: checker.checkAudioSource, ...NO_ADDONS });
    expect(result.match).toEqual({ kind: 'different-edit', sourceId: 'picked-radio-edit' });
    expect(checker.checkedSourceIds).toEqual(['picked-radio-edit']);
  });

  it('needs audio when nothing is found anywhere', async () => {
    const result = await findAudioForSong({ song: CHEAP_THRILLS, pickedSourceId: null, musicIndex: null, checkAudioSource: buildChecker({}).checkAudioSource, ...NO_ADDONS });
    expect(result.match).toEqual({ kind: 'not-found', isWaitingForAddon: false });
  });

  it('downloads and checks an addon’s file, and shows its page links', async () => {
    const httpClient = buildAddonHttpClient({
      'https://tapes.example.org/audio-links': { status: 200, body: { links: [{ kind: 'open-page', url: 'https://store.example.org/x', label: 'Buy it' }, { kind: 'file-url', url: 'https://tapes.example.org/x.ogg', label: 'ogg' }] } },
    });
    const downloads: string[] = [];
    const result = await findAudioForSong({
      song: CHEAP_THRILLS,
      pickedSourceId: null,
      musicIndex: null,
      addons: [buildAddon('tapes')],
      httpClient,
      checkAudioSource: buildChecker({ 'download:x.ogg': 'matched' }).checkAudioSource,
      downloadAddonFile: ({ url }) => {
        downloads.push(url);
        return Promise.resolve('download:x.ogg');
      },
    });
    expect(downloads).toEqual(['https://tapes.example.org/x.ogg']);
    expect(result.match).toMatchObject({ kind: 'matched', sourceId: 'download:x.ogg' });
    expect(result.pageLinks).toEqual([{ kind: 'open-page', url: 'https://store.example.org/x', label: 'Buy it' }]);
  });

  it('waits for an addon that is working or offline, and skips one the player turned off', async () => {
    const offline = buildAddon('offline');
    const turnedOff = { ...buildAddon('off'), isEnabled: false };
    const httpClient = buildAddonHttpClient({ 'https://working.example.org/audio-links': { status: 202, body: { retryAfterSeconds: 5 } }, 'https://offline.example.org/audio-links': 'offline' });
    const result = await findAudioForSong({ song: CHEAP_THRILLS, pickedSourceId: null, musicIndex: null, addons: [buildAddon('working'), offline, turnedOff], httpClient, checkAudioSource: buildChecker({}).checkAudioSource, downloadAddonFile: () => Promise.reject(new Error('unused')) });
    expect(result.match).toEqual({ kind: 'not-found', isWaitingForAddon: true });
    expect(result.addonMessages).toEqual(['offline isn’t answering. We’ll try again later.']);
  });

  it('keeps "different edit" from the music folder when addons find nothing better', async () => {
    const index = await scanMusicLibrary({ musicLibrary: new ListedMusicLibrary([buildMusicFile({ sourceId: 'radio-edit', fileName: 'Sia - Cheap Thrills.mp3' })]) });
    const httpClient = buildAddonHttpClient({ 'https://tapes.example.org/audio-links': { status: 200, body: { links: [], error: 'Not in our catalog' } } });
    const result = await findAudioForSong({ song: CHEAP_THRILLS, pickedSourceId: null, musicIndex: index, addons: [buildAddon('tapes')], httpClient, checkAudioSource: buildChecker({}).checkAudioSource, downloadAddonFile: () => Promise.reject(new Error('unused')) });
    expect(result.match).toEqual({ kind: 'different-edit', sourceId: 'radio-edit' });
    expect(result.addonMessages).toEqual(['tapes: Not in our catalog']);
  });
});

describe('addon video', () => {
  const answerWithVideo = { status: 200, body: { links: [{ kind: 'file-url', url: 'https://tapes.example.org/x.ogg', label: 'ogg' }, { kind: 'file-url', media: 'video', url: 'https://tapes.example.org/x.mp4', label: 'video' }] } };

  it('comes with the music when the music from the same answer matched', async () => {
    const downloads: string[] = [];
    const result = await findAudioForSong({
      song: CHEAP_THRILLS, pickedSourceId: null, musicIndex: null, addons: [buildAddon('tapes')],
      httpClient: buildAddonHttpClient({ 'https://tapes.example.org/audio-links': answerWithVideo }),
      checkAudioSource: buildChecker({ 'download:x.ogg': 'matched' }).checkAudioSource,
      downloadAddonFile: ({ url }) => {
        downloads.push(url);
        return Promise.resolve(url.endsWith('.mp4') ? 'download:x.mp4' : 'download:x.ogg');
      },
    });
    expect(result.match).toEqual({ kind: 'matched', sourceId: 'download:x.ogg', shiftSeconds: 0.1, videoSourceId: 'download:x.mp4' });
    expect(downloads).toEqual(['https://tapes.example.org/x.ogg', 'https://tapes.example.org/x.mp4']);
  });

  it('is never downloaded when the music did not match', async () => {
    const downloads: string[] = [];
    const result = await findAudioForSong({
      song: CHEAP_THRILLS, pickedSourceId: null, musicIndex: null, addons: [buildAddon('tapes')],
      httpClient: buildAddonHttpClient({ 'https://tapes.example.org/audio-links': answerWithVideo }),
      checkAudioSource: buildChecker({}).checkAudioSource,
      downloadAddonFile: ({ url }) => {
        downloads.push(url);
        return Promise.resolve('download:x.ogg');
      },
    });
    expect(result.match.kind).toBe('different-edit');
    expect(downloads).toEqual(['https://tapes.example.org/x.ogg']);
  });

  it('leaves the song with music only when the video fails to download', async () => {
    const result = await findAudioForSong({
      song: CHEAP_THRILLS, pickedSourceId: null, musicIndex: null, addons: [buildAddon('tapes')],
      httpClient: buildAddonHttpClient({ 'https://tapes.example.org/audio-links': answerWithVideo }),
      checkAudioSource: buildChecker({ 'download:x.ogg': 'matched' }).checkAudioSource,
      downloadAddonFile: ({ url }) => (url.endsWith('.mp4') ? Promise.reject(new Error('offline')) : Promise.resolve('download:x.ogg')),
    });
    expect(result.match).toEqual({ kind: 'matched', sourceId: 'download:x.ogg', shiftSeconds: 0.1 });
    expect(result.addonMessages[0]).toContain('plays without it');
  });
});

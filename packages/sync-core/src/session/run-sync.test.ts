import { describe, expect, it } from 'vitest';
import { scanMusicLibrary, type MusicFile } from '../audio-sources/music-library';
import type { AudioFingerprint } from '../audio-matching/audio-match';
import { buildEmptyInstalledSongsRecord, type InstalledSongsRecord } from '../ownership/installed-songs';
import type { HttpClient } from '../network/http-client';
import type { AudioMatch } from '../planner/sync-plan-types';
import { MemorySongsFolder } from '../songs-folder/memory-songs-folder';
import type { VaultSongDetails } from '../stepsvault-api/stepsvault-api-types';
import type { SongFiles } from '../writing/song-writer';
import { runSync, type SyncPhase, type SyncPorts, type SyncSettings, type SyncVault } from './run-sync';

const CHEAP_THRILLS: VaultSongDetails = { vaultSongId: 'a', slug: 'cheap-thrills', title: 'Cheap Thrills', artist: 'Sia', album: null, genre: 'Pop', lengthSeconds: 224, levels: [2, 4, 6, 9, null], bpm: 90, youtubeId: null, chartVersion: 'v1', imageKinds: ['banner'], hasFingerprint: true };
const WATCH_ME: VaultSongDetails = { vaultSongId: 'b', slug: 'watch-me', title: 'Watch Me', artist: 'Silentó', album: null, genre: 'Hip-Hop', lengthSeconds: 185, levels: [1, 3, 5, 8, null], bpm: 140, youtubeId: null, chartVersion: 'v1', imageKinds: ['banner'], hasFingerprint: true };
const NO_FINGERPRINT: VaultSongDetails = { ...WATCH_ME, vaultSongId: 'c', slug: 'old-song', title: 'Old Song', hasFingerprint: false };

class FakeVault implements SyncVault {
  constructor(public songs: VaultSongDetails[]) {}

  fetchVault(): Promise<VaultSongDetails[]> {
    return Promise.resolve(this.songs);
  }

  fetchFingerprint(vaultSongId: string): Promise<AudioFingerprint> {
    return Promise.resolve({ envelope: [vaultSongId.charCodeAt(0)], rateHertz: 100 });
  }

  fetchSongFiles({ vaultSongId, chartVersion }: { vaultSongId: string; chartVersion: string }): Promise<SongFiles> {
    return Promise.resolve({ sscText: `#TITLE:${vaultSongId};\n#OFFSET:-0.100000;\n#VERSIONTAG:${chartVersion};\n`, images: [{ fileName: 'banner.png', bytes: new Uint8Array([1]) }] });
  }
}

class MemoryRecordStore {
  record: InstalledSongsRecord = buildEmptyInstalledSongsRecord();
  saveCount = 0;

  load(): Promise<InstalledSongsRecord> {
    return Promise.resolve(this.record);
  }

  save(record: InstalledSongsRecord): Promise<void> {
    this.record = record;
    this.saveCount += 1;
    return Promise.resolve();
  }
}

const UNUSED_HTTP: HttpClient = { requestJson: () => Promise.reject(new Error('unused')), requestText: () => Promise.reject(new Error('unused')), requestBytes: () => Promise.reject(new Error('unused')) };

function buildPorts({ songsFolder, vault, recordStore, checkedFingerprints }: { songsFolder: MemorySongsFolder; vault: FakeVault; recordStore: MemoryRecordStore; checkedFingerprints: string[] }): SyncPorts {
  let idCount = 0;
  return {
    songsFolder,
    vault,
    recordStore,
    httpClient: UNUSED_HTTP,
    // The music file "sia-cheap-thrills" matches song a's fingerprint; anything else is another edit.
    checkAudioSource: ({ sourceId, fingerprint }) => {
      checkedFingerprints.push(`${sourceId}:${String(fingerprint.envelope[0])}`);
      const match: AudioMatch = sourceId === 'sia-cheap-thrills' && fingerprint.envelope[0] === 'a'.charCodeAt(0) ? { kind: 'matched', sourceId, shiftSeconds: 0.2 } : { kind: 'different-edit', sourceId };
      return Promise.resolve(match);
    },
    downloadAddonFile: () => Promise.reject(new Error('unused')),
    createId: () => `id-${String((idCount += 1))}`,
    getNow: () => '2026-10-24T12:00:00Z',
  };
}

async function buildSettings(): Promise<SyncSettings> {
  const files: MusicFile[] = [{ sourceId: 'sia-cheap-thrills', fileName: 'Sia - Cheap Thrills.mp3', folderNames: ['Music'], taggedTitle: null, taggedArtist: null }];
  const musicIndex = await scanMusicLibrary({ musicLibrary: { listMusicFiles: () => toAsyncIterable(files) } });
  return { layout: 'one-group', shouldUpdateAutomatically: true, choices: { replaceEditedSongIds: new Set(), removeFromGameSongIds: new Set(), updateSongIds: new Set() }, pickedSourceIdsBySongId: new Map(), musicIndex, addons: [] };
}

async function* toAsyncIterable<Item>(items: readonly Item[]): AsyncIterable<Item> {
  for (const item of items) yield await Promise.resolve(item);
}

describe('runSync', () => {
  it('adds the songs it found audio for, and reports every status', async () => {
    const songsFolder = new MemorySongsFolder();
    songsFolder.addMusicSource({ sourceId: 'sia-cheap-thrills', bytes: new Uint8Array([79, 103, 103, 83]) });
    const recordStore = new MemoryRecordStore();
    const checkedFingerprints: string[] = [];
    const phases: SyncPhase['kind'][] = [];
    const outcome = await runSync({ ports: buildPorts({ songsFolder, vault: new FakeVault([CHEAP_THRILLS, WATCH_ME, NO_FINGERPRINT]), recordStore, checkedFingerprints }), settings: await buildSettings(), onPhase: (phase) => phases.push(phase.kind) });

    expect(outcome.finalPlan.songPlans.map((songPlan) => [songPlan.vaultSongId, songPlan.status])).toEqual([['a', 'synced'], ['b', 'needs-audio'], ['c', 'needs-audio']]);
    expect(await songsFolder.readText(['StepsVault', 'Cheap Thrills', 'Cheap Thrills.ssc'])).toContain('#OFFSET:-0.300000;');
    expect(outcome.events.map((event) => [event.vaultSongId, event.kind])).toEqual([['a', 'added']]);
    expect(outcome.audioResultsBySongId.get('c')?.addonMessages[0]).toContain('no sound fingerprint');
    expect(checkedFingerprints).toEqual(['sia-cheap-thrills:97']);
    expect(recordStore.record.installedSongs.map((song) => song.vaultSongId)).toEqual(['a']);
    expect(phases).toEqual(['reading-vault', 'finding-audio', 'finding-audio', 'finding-audio', 'writing']);
  });

  it('never searches audio again for installed songs, and updates their steps in place', async () => {
    const songsFolder = new MemorySongsFolder();
    songsFolder.addMusicSource({ sourceId: 'sia-cheap-thrills', bytes: new Uint8Array([79, 103, 103, 83]) });
    const recordStore = new MemoryRecordStore();
    const vault = new FakeVault([CHEAP_THRILLS]);
    const checkedFingerprints: string[] = [];
    const ports = buildPorts({ songsFolder, vault, recordStore, checkedFingerprints });
    const settings = await buildSettings();
    await runSync({ ports, settings });
    vault.songs = [{ ...CHEAP_THRILLS, chartVersion: 'v2' }];
    const outcome = await runSync({ ports, settings });
    expect(checkedFingerprints).toHaveLength(1);
    expect(outcome.events.map((event) => event.kind)).toEqual(['updated']);
    expect(await songsFolder.readText(['StepsVault', 'Cheap Thrills', 'Cheap Thrills.ssc'])).toContain('#VERSIONTAG:v2;');
    expect(outcome.finalPlan.songPlans.map((songPlan) => songPlan.status)).toEqual(['synced']);
  });

  it('never reuses the name of a folder the player put inside our group', async () => {
    const songsFolder = new MemorySongsFolder();
    songsFolder.addMusicSource({ sourceId: 'sia-cheap-thrills', bytes: new Uint8Array([79, 103, 103, 83]) });
    const recordStore = new MemoryRecordStore();
    recordStore.record = { ...recordStore.record, ownedGroupNames: ['StepsVault'] };
    await songsFolder.writeText({ path: ['StepsVault', 'Cheap Thrills', 'theirs.ssc'], text: 'the player own song' });
    const outcome = await runSync({ ports: buildPorts({ songsFolder, vault: new FakeVault([CHEAP_THRILLS]), recordStore, checkedFingerprints: [] }), settings: await buildSettings() });
    expect(outcome.events[0]?.folderPath).toEqual(['StepsVault', 'Cheap Thrills (Sia)']);
    expect(await songsFolder.readText(['StepsVault', 'Cheap Thrills', 'theirs.ssc'])).toBe('the player own song');
  });
});

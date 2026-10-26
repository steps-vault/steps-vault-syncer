import { describe, expect, it } from 'vitest';
import type { FolderLayout } from '../layout/folder-layout';
import { getPlayerGroupNames } from '../layout/player-groups';
import { checkInstalledSongs } from '../ownership/installed-song-check';
import { buildEmptyInstalledSongsRecord, findInstalledSong, type InstalledSongsRecord } from '../ownership/installed-songs';
import { SONG_FOLDER_MARKER_FILE_NAME } from '../ownership/song-folder-marker';
import type { AudioMatch, PlayerChoices, SyncPlan, VaultSong } from '../planner/sync-plan-types';
import { buildSyncPlan } from '../planner/sync-planner';
import { MemorySongsFolder } from '../songs-folder/memory-songs-folder';
import type { SongFiles, SongWriterDependencies } from './song-writer';
import { carryOutSyncPlan, type SyncResult } from './sync-executor';

const CHEAP_THRILLS: VaultSong = { vaultSongId: 'a', title: 'Cheap Thrills', artist: 'Sia', genre: 'Pop', chartVersion: 'v1' };
const WATCH_ME: VaultSong = { vaultSongId: 'b', title: 'Watch Me', artist: 'Silentó', genre: 'Hip-Hop', chartVersion: 'v1' };
const NO_CHOICES: PlayerChoices = { replaceEditedSongIds: new Set(), removeFromGameSongIds: new Set(), updateSongIds: new Set() };
const MUSIC_BYTES = new Uint8Array([79, 103, 103, 83]);
const BANNER_BYTES = new Uint8Array([137, 80, 78, 71]);

function buildSongFiles({ vaultSongId, chartVersion }: { vaultSongId: string; chartVersion: string }): SongFiles {
  return { sscText: `#TITLE:${vaultSongId};\n#MUSIC:x.ogg;\n#BANNER:banner.png;\n#OFFSET:-0.100000;\n#BPMS:0.000=120.000;\n#VERSIONTAG:${chartVersion};\n`, images: [{ fileName: 'banner.png', bytes: BANNER_BYTES }] };
}

class SyncedGame {
  readonly songsFolder = new MemorySongsFolder();
  record: InstalledSongsRecord = buildEmptyInstalledSongsRecord();
  readonly savedRecords: InstalledSongsRecord[] = [];
  private idCount = 0;

  constructor() {
    for (const song of [CHEAP_THRILLS, WATCH_ME]) this.songsFolder.addMusicSource({ sourceId: `file:${song.vaultSongId}`, bytes: MUSIC_BYTES });
  }

  get dependencies(): SongWriterDependencies {
    return {
      songsFolder: this.songsFolder,
      vaultFiles: { fetchSongFiles: (options) => Promise.resolve(buildSongFiles(options)) },
      createId: () => `id-${String((this.idCount += 1))}`,
      getNow: () => '2026-10-24T12:00:00Z',
    };
  }

  async plan({ vaultSongs, layout = 'one-group', choices = NO_CHOICES }: { vaultSongs: VaultSong[]; layout?: FolderLayout; choices?: PlayerChoices }): Promise<SyncPlan> {
    const audioMatchesBySongId = new Map<string, AudioMatch>(vaultSongs.map((song) => [song.vaultSongId, { kind: 'matched', sourceId: `file:${song.vaultSongId}`, shiftSeconds: 0.25 }]));
    return buildSyncPlan({
      vaultSongs,
      record: this.record,
      checks: await checkInstalledSongs({ songsFolder: this.songsFolder, record: this.record }),
      audioMatchesBySongId,
      layout,
      playerGroupNames: await getPlayerGroupNames({ songsFolder: this.songsFolder, record: this.record }),
      choices,
      shouldUpdateAutomatically: true,
    });
  }

  async sync(options: { vaultSongs: VaultSong[]; layout?: FolderLayout; choices?: PlayerChoices }): Promise<SyncResult> {
    const result = await carryOutSyncPlan({ plan: await this.plan(options), record: this.record, dependencies: this.dependencies, onRecordChange: (record) => Promise.resolve(void this.savedRecords.push(record)) });
    this.record = result.record;
    return result;
  }
}

describe('carryOutSyncPlan', () => {
  it('adds a whole song folder: song file lined up with the music, music, images and marker', async () => {
    const game = new SyncedGame();
    const result = await game.sync({ vaultSongs: [CHEAP_THRILLS] });
    const folder = ['dancedance.studio', 'Cheap Thrills'];
    expect(await game.songsFolder.readText([...folder, 'Cheap Thrills.ssc'])).toContain('#OFFSET:-0.350000;');
    expect(await game.songsFolder.readText([...folder, 'Cheap Thrills.ssc'])).toContain('#MUSIC:music.ogg;');
    expect(game.songsFolder.readBytes([...folder, 'music.ogg'])).toEqual(MUSIC_BYTES);
    expect(game.songsFolder.readBytes([...folder, 'banner.png'])).toEqual(BANNER_BYTES);
    expect(await game.songsFolder.readText([...folder, SONG_FOLDER_MARKER_FILE_NAME])).toContain('"vaultSongId": "a"');
    expect(result.events).toMatchObject([{ vaultSongId: 'a', kind: 'added', folderPath: folder }]);
    expect(game.record.ownedGroupNames).toEqual(['dancedance.studio']);
  });

  it('leaves nothing behind when the disk fills up halfway, and carries on with the next song', async () => {
    const game = new SyncedGame();
    game.songsFolder.failWritesAfter({ count: 1, failure: 'disk-full' });
    const result = await game.sync({ vaultSongs: [CHEAP_THRILLS, WATCH_ME] });
    expect(await game.songsFolder.listEntries(['dancedance.studio'])).toEqual([]);
    expect(result.events.map((event) => [event.vaultSongId, event.kind, event.failure])).toEqual([['a', 'failed', 'disk-full'], ['b', 'failed', 'disk-full']]);
    expect(result.events[0]?.message).toContain('Free up some space');
    expect(game.record.installedSongs).toEqual([]);
  });

  it('updates the steps in place, keeping the player music and its shift', async () => {
    const game = new SyncedGame();
    await game.sync({ vaultSongs: [CHEAP_THRILLS] });
    const result = await game.sync({ vaultSongs: [{ ...CHEAP_THRILLS, chartVersion: 'v2' }] });
    const sscText = await game.songsFolder.readText(['dancedance.studio', 'Cheap Thrills', 'Cheap Thrills.ssc']);
    expect(sscText).toContain('#VERSIONTAG:v2;');
    expect(sscText).toContain('#OFFSET:-0.350000;');
    expect(await game.songsFolder.readText(['dancedance.studio', 'Cheap Thrills', 'Cheap Thrills.ssc.stepsvault-new'])).toBeNull();
    expect(result.events).toMatchObject([{ kind: 'updated' }]);
    expect(findInstalledSong({ record: game.record, vaultSongId: 'a' })?.chartVersion).toBe('v2');
  });

  it('says to close StepMania when the game holds the folder, and keeps the old steps', async () => {
    const game = new SyncedGame();
    await game.sync({ vaultSongs: [CHEAP_THRILLS] });
    game.songsFolder.lock(['dancedance.studio', 'Cheap Thrills', 'Cheap Thrills.ssc']);
    const result = await game.sync({ vaultSongs: [{ ...CHEAP_THRILLS, chartVersion: 'v2' }] });
    expect(result.events).toMatchObject([{ kind: 'failed', failure: 'locked' }]);
    expect(result.events[0]?.message).toContain('Close StepMania');
    expect(findInstalledSong({ record: game.record, vaultSongId: 'a' })?.chartVersion).toBe('v1');
  });

  it('leaves a folder alone when the player replaced it after the plan was made', async () => {
    const game = new SyncedGame();
    await game.sync({ vaultSongs: [CHEAP_THRILLS] });
    const plan = await game.plan({ vaultSongs: [], choices: { ...NO_CHOICES, removeFromGameSongIds: new Set(['a']) } });
    await game.songsFolder.removeFolder(['dancedance.studio', 'Cheap Thrills']);
    await game.songsFolder.writeText({ path: ['dancedance.studio', 'Cheap Thrills', 'mine.ssc'], text: 'the player own steps' });
    const result = await carryOutSyncPlan({ plan, record: game.record, dependencies: game.dependencies });
    expect(result.events).toMatchObject([{ kind: 'failed', failure: 'not-ours' }]);
    expect(await game.songsFolder.readText(['dancedance.studio', 'Cheap Thrills', 'mine.ssc'])).toBe('the player own steps');
  });

  it('moves songs for a new layout and removes the group it emptied', async () => {
    const game = new SyncedGame();
    await game.sync({ vaultSongs: [CHEAP_THRILLS, WATCH_ME] });
    const result = await game.sync({ vaultSongs: [CHEAP_THRILLS, WATCH_ME], layout: 'by-genre' });
    expect(result.events.map((event) => event.kind)).toEqual(['moved', 'moved']);
    expect((await game.songsFolder.listEntries([])).map((entry) => entry.name).sort()).toEqual(['Hip-Hop', 'Pop']);
    expect(game.record.ownedGroupNames).not.toContain('dancedance.studio');
  });

  it('saves the record after every song, and a second sync has nothing to do', async () => {
    const game = new SyncedGame();
    await game.sync({ vaultSongs: [CHEAP_THRILLS, WATCH_ME] });
    expect(game.savedRecords.map((record) => record.installedSongs.length)).toEqual([1, 2]);
    const second = await game.plan({ vaultSongs: [CHEAP_THRILLS, WATCH_ME] });
    expect(second.songPlans.map((songPlan) => songPlan.status)).toEqual(['synced', 'synced']);
  });
});

describe('a song with its video', () => {
  it('gets video.mp4 and the background line, and keeps both when its steps update', async () => {
    const game = new SyncedGame();
    const videoBytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
    game.songsFolder.addMusicSource({ sourceId: 'video:a', bytes: videoBytes });
    const plan = await game.plan({ vaultSongs: [CHEAP_THRILLS] });
    const planWithVideo = { ...plan, songPlans: plan.songPlans.map((songPlan) => ({ ...songPlan, actions: songPlan.actions.map((action) => (action.kind === 'add' ? { ...action, audio: { ...action.audio, videoSourceId: 'video:a' } } : action)) })) };
    game.record = (await carryOutSyncPlan({ plan: planWithVideo, record: game.record, dependencies: game.dependencies })).record;
    const folder = ['dancedance.studio', 'Cheap Thrills'];
    expect(game.songsFolder.readBytes([...folder, 'video.mp4'])).toEqual(videoBytes);
    expect(await game.songsFolder.readText([...folder, 'Cheap Thrills.ssc'])).toContain('#BGCHANGES:');
    expect(findInstalledSong({ record: game.record, vaultSongId: 'a' })?.music.videoFileName).toBe('video.mp4');
    await game.sync({ vaultSongs: [{ ...CHEAP_THRILLS, chartVersion: 'v2' }] });
    const updated = await game.songsFolder.readText([...folder, 'Cheap Thrills.ssc']);
    expect(updated).toContain('#VERSIONTAG:v2;');
    expect(updated).toContain('=video.mp4=');
  });
});

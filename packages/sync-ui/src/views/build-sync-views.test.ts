import { describe, expect, it } from 'vitest';
import { buildEmptyInstalledSongsRecord, buildSongsPath, withInstalledSong, type VaultSongDetails } from '@stepsvault/sync-core';
import { buildActivityEntries, buildLayoutViews, buildSongDetailsById, buildSongRows, describeShift, getTrayStatus, type SongViewInput } from './build-sync-views';

const CHEAP_THRILLS: VaultSongDetails = { vaultSongId: 'a', slug: 'cheap-thrills', title: 'Cheap Thrills', artist: 'Sia', album: null, genre: 'Pop', lengthSeconds: 224, levels: [2, 4, 6, 9, null], bpm: 90, youtubeId: null, chartVersion: 'v1', imageKinds: [], hasFingerprint: true };
const BUNNY: VaultSongDetails = { ...CHEAP_THRILLS, vaultSongId: 'b', slug: 'bunny', title: 'Big Buck Bunny', artist: 'Blender', genre: 'Electronic' };
const RECORD = withInstalledSong({ record: buildEmptyInstalledSongsRecord(), installedSong: { vaultSongId: 'a', chartVersion: 'v1', installId: 'i', folderPath: buildSongsPath('StepsVault', 'Cheap Thrills'), chartHashesByFileName: {}, music: { fileName: 'music.ogg', shiftSeconds: 0.5 }, installedAt: '2026-10-24T10:00:00Z' } });

function buildInput(overrides: Partial<SongViewInput> = {}): SongViewInput {
  return {
    vaultSongs: [CHEAP_THRILLS, BUNNY],
    songPlans: [{ vaultSongId: 'a', status: 'synced', actions: [], isWaitingForAddon: false }, { vaultSongId: 'b', status: 'needs-audio', actions: [], isWaitingForAddon: true }],
    audioResultsBySongId: new Map([['b', { match: { kind: 'not-found', isWaitingForAddon: true }, addonMessages: ['Indie Tapes isn’t answering. We’ll try again later.'], pageLinks: [] }]]),
    record: RECORD,
    pickedSongIds: new Set(),
    addonNamesBySourceId: new Map(),
    ...overrides,
  };
}

describe('song views', () => {
  it('gives each song its status, levels, audio source and waiting note', () => {
    const rows = buildSongRows(buildInput());
    expect(rows.map((row) => [row.title, row.status, row.audioSource.kind, row.note])).toEqual([
      ['Cheap Thrills', 'synced', 'music-folder', null],
      ['Big Buck Bunny', 'needs-audio', 'none', 'Indie Tapes isn’t answering. We’ll try again later.'],
    ]);
    expect(rows[0]?.levels).toEqual([2, 4, 6, 9, null]);
  });

  it('names the addon a song’s audio came from', () => {
    const rows = buildSongRows(buildInput({ audioResultsBySongId: new Map([['b', { match: { kind: 'matched', sourceId: 'file:x', shiftSeconds: 0 }, addonMessages: [], pageLinks: [] }]]), addonNamesBySourceId: new Map([['file:x', 'YouTube audio (personal)']]) }));
    expect(rows[1]?.audioSource).toEqual({ kind: 'addon', addonName: 'YouTube audio (personal)' });
  });

  it('describes the timing shift and where the song lives', () => {
    const details = buildSongDetailsById(buildInput());
    expect(details.a?.audioMatch.timingText).toBe('Moved the steps 0.50 s later to fit your copy.');
    expect(details.a?.gameFolderPath).toBe('Songs/StepsVault/Cheap Thrills');
    expect(details.a?.bpmText).toBe('90 BPM');
    expect(describeShift(-0.18)).toBe('Moved the steps 0.18 s earlier to fit your copy.');
    expect(describeShift(0.001)).toContain('nothing to move');
  });
});

describe('activity and layout views', () => {
  it('writes activity lines newest first, with the problem for a failed song', () => {
    const entries = buildActivityEntries({
      events: [
        { vaultSongId: 'a', kind: 'added', at: '2026-10-24T10:00:00Z', folderPath: ['StepsVault', 'Cheap Thrills'] },
        { vaultSongId: 'b', kind: 'failed', at: '2026-10-24T10:05:00Z', folderPath: ['StepsVault', 'Big Buck Bunny'], failure: 'disk-full', message: 'Your disk is full.' },
      ],
      vaultSongs: [CHEAP_THRILLS, BUNNY],
    });
    expect(entries.map((entry) => `${entry.textBefore}${entry.highlightedText}${entry.textAfter}`)).toEqual(['Couldn’t write Big Buck Bunny', 'Added Cheap Thrills in StepsVault']);
    expect(entries[0]?.kind).toBe('write-failed');
    expect(entries[0]?.summaryText).toBe('Your disk is full.');
  });

  it('counts the songs each layout would move, with "song" for one', () => {
    const views = buildLayoutViews({ vaultSongs: [CHEAP_THRILLS], record: RECORD, playerGroupNames: ['Pop'] });
    expect(views.movingSongCountsByLayout).toEqual({ 'one-group': 0, 'by-genre': 1, 'by-artist': 1 });
    expect(views.previewsByLayout['by-genre'].groups[0]).toMatchObject({ groupName: 'StepsVault - Pop', tagText: 'name taken' });
    expect(views.previewsByLayout['one-group'].groups[0]).toMatchObject({ groupName: 'StepsVault', tagText: '1 song' });
  });

  it('shows the tray status', () => {
    expect(getTrayStatus({ isSyncing: false, isPaused: false, songPlans: buildInput().songPlans })).toBe('needs-attention');
    expect(getTrayStatus({ isSyncing: true, isPaused: false, songPlans: [] })).toBe('syncing');
    expect(getTrayStatus({ isSyncing: false, isPaused: true, songPlans: [] })).toBe('paused');
  });
});

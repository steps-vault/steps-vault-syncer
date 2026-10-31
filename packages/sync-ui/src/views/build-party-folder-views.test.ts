import { describe, expect, it } from 'vitest';
import { buildEmptyInstalledSongsRecord, buildSongsPath, type InstalledSong, type PartyFolderPlan, type SyncPartyList, type VaultSongDetails } from '@stepsvault/sync-core';
import { buildActivityEntries } from './build-sync-views';
import { buildPartyFolderPreview, buildPartyFolderViews, getPartyListEndText } from './build-party-folder-views';

const NOW = new Date('2026-10-31T12:00:00Z');
const CHEAP_THRILLS: VaultSongDetails = { vaultSongId: 'a', slug: 'cheap-thrills', title: 'Cheap Thrills', artist: 'Sia', album: null, genre: 'Pop', lengthSeconds: 224, levels: [2, 4, 6, 9, null], bpm: 90, youtubeId: null, chartVersion: 'v1', imageKinds: [], hasFingerprint: true };
const LEVITATING: VaultSongDetails = { ...CHEAP_THRILLS, vaultSongId: 'd', slug: 'levitating', title: 'Levitating', artist: 'Dua Lipa' };
const MAYA: SyncPartyList = { partyListId: 'party_maya', slug: 'maya-bday-7q2xk', name: 'Maya bday', gameFolderName: 'Party - Maya bday', endsAt: '2026-11-02T13:00:00Z', songs: [CHEAP_THRILLS, LEVITATING] };
const MAYA_PLAN: PartyFolderPlan = {
  partyListId: 'party_maya',
  listName: 'Maya bday',
  baseName: 'Party - Maya bday',
  groupName: 'Party - Maya bday',
  isSynced: true,
  songPlans: [{ vaultSongId: 'a', status: 'synced', actions: [], isWaitingForAddon: false }, { vaultSongId: 'd', status: 'needs-audio', actions: [], isWaitingForAddon: false }],
  forgetActions: [],
};
const COPY: InstalledSong = { vaultSongId: 'a', chartVersion: 'v1', installId: 'i', folderPath: buildSongsPath('Party - Old night', 'Cheap Thrills'), chartHashesByFileName: {}, music: { fileName: 'music.ogg', shiftSeconds: 0 }, installedAt: '2026-10-24T10:00:00Z' };

describe('party folder views', () => {
  it('lists each synced list’s folder with its songs in the game, the songs that need audio and its end', () => {
    const views = buildPartyFolderViews({ partyFolderPlans: [MAYA_PLAN], partyLists: [MAYA], record: buildEmptyInstalledSongsRecord(), now: NOW });
    expect(views).toEqual([{ partyListId: 'party_maya', listName: 'Maya bday', folderText: 'Songs/Party - Maya bday', songCountText: '1 song in your game', needsYouText: '1 needs audio', endsText: 'Ends in 2d', isLeaving: false }]);
  });

  it('shows a gone list while its folder is still being removed, and drops it once it is gone', () => {
    const leaving: PartyFolderPlan = { ...MAYA_PLAN, isSynced: false, songPlans: [{ vaultSongId: 'a', status: 'syncing', actions: [], isWaitingForAddon: false }] };
    expect(buildPartyFolderViews({ partyFolderPlans: [leaving], partyLists: [], record: buildEmptyInstalledSongsRecord(), now: NOW })[0]).toMatchObject({ isLeaving: true, endsText: null });
    expect(buildPartyFolderViews({ partyFolderPlans: [{ ...leaving, songPlans: [] }], partyLists: [], record: buildEmptyInstalledSongsRecord(), now: NOW })).toEqual([]);
  });

  it('shows the folders as the record has them when the site didn’t say which lists are synced', () => {
    const record = { ...buildEmptyInstalledSongsRecord(), partyFolders: [{ partyListId: 'party_old', listName: 'Old night', baseName: 'Party - Old night', groupName: 'Party - Old night', installedSongs: [COPY] }] };
    expect(buildPartyFolderViews({ partyFolderPlans: undefined, partyLists: null, record, now: NOW })).toMatchObject([{ listName: 'Old night', songCountText: '1 song in your game', isLeaving: false }]);
  });

  it('says how long a list has left', () => {
    expect(getPartyListEndText({ endsAt: null, now: NOW })).toBeNull();
    expect(getPartyListEndText({ endsAt: '2026-10-31T11:00:00Z', now: NOW })).toBeNull();
    expect(getPartyListEndText({ endsAt: '2026-10-31T12:30:00Z', now: NOW })).toBe('Ends within the hour');
    expect(getPartyListEndText({ endsAt: '2026-10-31T17:59:00Z', now: NOW })).toBe('Ends in 5h');
  });

  it('draws the player’s own party folders in the Folder layout tree, songs marked as copies', () => {
    expect(buildPartyFolderPreview({ partyFolderPlans: [MAYA_PLAN], partyLists: [MAYA], now: NOW })).toEqual({ groups: [{ groupName: 'Party - Maya bday', isPartyFolder: true, tagText: 'ends in 2d', songTitles: ['Cheap Thrills', 'Levitating'], moreSongCount: 0, songTagText: 'copy' }] });
    expect(buildPartyFolderPreview({ partyFolderPlans: [], partyLists: [], now: NOW })).toBeNull();
  });

  it('says a party copy was removed from its folder, not from the game', () => {
    const entries = buildActivityEntries({ events: [{ vaultSongId: 'a', kind: 'removed', at: '2026-10-31T12:00:00Z', folderPath: ['Party - Maya bday', 'Cheap Thrills'], partyListId: 'party_maya' }], vaultSongs: [CHEAP_THRILLS] });
    expect(`${entries[0]?.textBefore ?? ''}${entries[0]?.highlightedText ?? ''}${entries[0]?.textAfter ?? ''}`).toBe('Removed Cheap Thrills from Party - Maya bday');
  });
});

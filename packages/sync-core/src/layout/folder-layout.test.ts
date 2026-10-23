import { describe, expect, it } from 'vitest';
import { buildEmptyInstalledSongsRecord, withInstalledSong, withOwnedGroup, type InstalledSongsRecord } from '../ownership/installed-songs';
import { MemorySongsFolder } from '../songs-folder/memory-songs-folder';
import { buildSongsPath, type SongsPath } from '../songs-folder/songs-path';
import { getGroupName, getTargetFolderPaths, type SongFolderFacts } from './folder-layout';
import { getSongFolderMoves } from './layout-change';
import { getPlayerGroupNames } from './player-groups';
import { getSafeFolderName, MAX_FOLDER_NAME_LENGTH } from './safe-folder-name';

const CHEAP_THRILLS: SongFolderFacts = { vaultSongId: 'a', title: 'Cheap Thrills', artist: 'Sia', genre: 'Pop' };
const BIEBER_SORRY: SongFolderFacts = { vaultSongId: 'b', title: 'Sorry', artist: 'Justin Bieber', genre: 'Pop' };
const BEYONCE_SORRY: SongFolderFacts = { vaultSongId: 'c', title: 'Sorry', artist: 'Beyoncé', genre: 'R&B' };

function recordWithInstalled({ vaultSongId, folderPath }: { vaultSongId: string; folderPath: SongsPath }, record = buildEmptyInstalledSongsRecord()): InstalledSongsRecord {
  return withInstalledSong({ record, installedSong: { vaultSongId, folderPath, chartVersion: 'v1', installId: `install-${vaultSongId}`, chartHashesByFileName: {}, installedAt: '2026-10-24T10:00:00Z' } });
}

describe('getGroupName', () => {
  it('keeps the plain name when the player has no folder called that', () => {
    expect(getGroupName({ baseName: 'Pop', playerGroupNames: ['DDR A20', 'Rock'] })).toBe('Pop');
  });

  it('adds the prefix when the player already has that folder, even in other letter case', () => {
    expect(getGroupName({ baseName: 'Pop', playerGroupNames: ['pop'] })).toBe('StepsVault · Pop');
  });

  it('numbers the prefixed name if the player has that one too', () => {
    expect(getGroupName({ baseName: 'Pop', playerGroupNames: ['Pop', 'StepsVault · Pop'] })).toBe('StepsVault · Pop 2');
  });
});

describe('getSafeFolderName', () => {
  it.each([
    ['AC/DC', 'AC DC'],
    ['What? Why: "Me"', 'What Why Me'],
    ['Trailing dots...', 'Trailing dots'],
    ['CON', 'CON _'],
    ['con.txt', 'con.txt _'],
    ['???', 'Untitled'],
  ])('%j becomes %j', (name, expected) => {
    expect(getSafeFolderName({ name, fallback: 'Untitled' })).toBe(expected);
  });

  it('shortens long names without cutting a character in half', () => {
    const name = getSafeFolderName({ name: '桜'.repeat(100), fallback: 'Untitled' });
    expect(Array.from(name)).toHaveLength(MAX_FOLDER_NAME_LENGTH);
  });
});

describe('getTargetFolderPaths', () => {
  it('groups by genre and prefixes only the genre the player already uses', () => {
    const targets = getTargetFolderPaths({ songs: [CHEAP_THRILLS, BEYONCE_SORRY], layout: 'by-genre', playerGroupNames: ['POP'], record: buildEmptyInstalledSongsRecord() });
    expect(targets.get('a')).toEqual(['StepsVault · Pop', 'Cheap Thrills']);
    expect(targets.get('c')).toEqual(['R&B', 'Sorry']);
  });

  it('gives a second song with the same title its artist, and never renames the installed one', () => {
    const record = recordWithInstalled({ vaultSongId: 'c', folderPath: buildSongsPath('StepsVault', 'Sorry') });
    const targets = getTargetFolderPaths({ songs: [BIEBER_SORRY, BEYONCE_SORRY], layout: 'one-group', playerGroupNames: [], record });
    expect(targets.get('c')).toEqual(['StepsVault', 'Sorry']);
    expect(targets.get('b')).toEqual(['StepsVault', 'Sorry (Justin Bieber)']);
  });

  it('never picks a folder name the player already put inside our group', () => {
    const targets = getTargetFolderPaths({
      songs: [CHEAP_THRILLS],
      layout: 'one-group',
      playerGroupNames: [],
      record: buildEmptyInstalledSongsRecord(),
      foreignFolderNamesByGroupKey: new Map([['stepsvault', ['cheap thrills']]]),
    });
    expect(targets.get('a')).toEqual(['StepsVault', 'Cheap Thrills (Sia)']);
  });
});

describe('a layout change', () => {
  it('moves only installed songs whose group changes', () => {
    let record = recordWithInstalled({ vaultSongId: 'a', folderPath: buildSongsPath('StepsVault', 'Cheap Thrills') });
    record = recordWithInstalled({ vaultSongId: 'c', folderPath: buildSongsPath('StepsVault', 'Sorry') }, record);
    const targets = getTargetFolderPaths({ songs: [CHEAP_THRILLS, BEYONCE_SORRY], layout: 'by-artist', playerGroupNames: ['Sia'], record });
    expect(getSongFolderMoves({ record, targetPathsBySongId: targets })).toEqual([
      { vaultSongId: 'a', from: ['StepsVault', 'Cheap Thrills'], to: ['StepsVault · Sia', 'Cheap Thrills'] },
      { vaultSongId: 'c', from: ['StepsVault', 'Sorry'], to: ['Beyoncé', 'Sorry'] },
    ]);
  });
});

describe('getPlayerGroupNames', () => {
  it('lists the top-level folders Sync did not create', async () => {
    const songsFolder = new MemorySongsFolder();
    songsFolder.addFolder(['DDR A20']);
    songsFolder.addFolder(['StepsVault']);
    await songsFolder.writeText({ path: ['readme.txt'], text: 'not a group' });
    const record = withOwnedGroup({ record: buildEmptyInstalledSongsRecord(), groupName: 'StepsVault' });
    expect(await getPlayerGroupNames({ songsFolder, record })).toEqual(['DDR A20']);
  });
});

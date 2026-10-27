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
  return withInstalledSong({ record, installedSong: { vaultSongId, folderPath, chartVersion: 'v1', installId: `install-${vaultSongId}`, chartHashesByFileName: {}, music: { fileName: 'song.ogg', shiftSeconds: 0 }, installedAt: '2026-10-24T10:00:00Z' } });
}

describe('getGroupName', () => {
  it('keeps the plain name when the player has no folder called that', () => {
    expect(getGroupName({ baseName: 'Pop', playerGroupNames: ['DDR A20', 'Rock'] })).toBe('Pop');
  });

  it('adds the prefix when the player already has that folder, even in other letter case', () => {
    expect(getGroupName({ baseName: 'Pop', playerGroupNames: ['pop'] })).toBe('dancedance.studio - Pop');
  });

  it('numbers the prefixed name if the player has that one too', () => {
    expect(getGroupName({ baseName: 'Pop', playerGroupNames: ['Pop', 'dancedance.studio - Pop'] })).toBe('dancedance.studio - Pop 2');
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
    ['Beyoncé', 'Beyonce'],
    ['הזוג הזה', 'הזוג הזה'],
    ['StepsVault · Pop', 'StepsVault Pop'],
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
    expect(targets.get('a')).toEqual(['dancedance.studio - Pop', 'Cheap Thrills']);
    expect(targets.get('c')).toEqual(['R&B', 'Sorry']);
  });

  it('gives a second song with the same title its artist, and never renames the installed one', () => {
    const record = recordWithInstalled({ vaultSongId: 'c', folderPath: buildSongsPath('dancedance.studio', 'Sorry') });
    const targets = getTargetFolderPaths({ songs: [BIEBER_SORRY, BEYONCE_SORRY], layout: 'one-group', playerGroupNames: [], record });
    expect(targets.get('c')).toEqual(['dancedance.studio', 'Sorry']);
    expect(targets.get('b')).toEqual(['dancedance.studio', 'Sorry (Justin Bieber)']);
  });

  it('never picks a folder name the player already put inside our group', () => {
    const targets = getTargetFolderPaths({
      songs: [CHEAP_THRILLS],
      layout: 'one-group',
      playerGroupNames: [],
      record: buildEmptyInstalledSongsRecord(),
      foreignFolderNamesByGroupKey: new Map([['dancedance.studio', ['cheap thrills']]]),
    });
    expect(targets.get('a')).toEqual(['dancedance.studio', 'Cheap Thrills (Sia)']);
  });
});

describe('songs written in another script', () => {
  const MERGUI: SongFolderFacts = { vaultSongId: 'd', title: 'הזוג הזה', artist: 'מרגי', titleTransliteration: 'HaZug HaZe', artistTransliteration: 'Mergui', genre: 'Pop' };

  it('are named by their English-letter spelling', () => {
    const record = buildEmptyInstalledSongsRecord();
    expect(getTargetFolderPaths({ songs: [MERGUI], layout: 'one-group', playerGroupNames: [], record }).get('d')).toEqual(['dancedance.studio', 'HaZug HaZe']);
    expect(getTargetFolderPaths({ songs: [MERGUI], layout: 'by-artist', playerGroupNames: [], record }).get('d')).toEqual(['Mergui', 'HaZug HaZe']);
  });
});

describe('a layout change', () => {
  it('moves only installed songs whose group changes', () => {
    let record = recordWithInstalled({ vaultSongId: 'a', folderPath: buildSongsPath('dancedance.studio', 'Cheap Thrills') });
    record = recordWithInstalled({ vaultSongId: 'c', folderPath: buildSongsPath('dancedance.studio', 'Sorry') }, record);
    const targets = getTargetFolderPaths({ songs: [CHEAP_THRILLS, BEYONCE_SORRY], layout: 'by-artist', playerGroupNames: ['Sia'], record });
    expect(getSongFolderMoves({ record, targetPathsBySongId: targets })).toEqual([
      { vaultSongId: 'a', from: ['dancedance.studio', 'Cheap Thrills'], to: ['dancedance.studio - Sia', 'Cheap Thrills'] },
      { vaultSongId: 'c', from: ['dancedance.studio', 'Sorry'], to: ['Beyonce', 'Sorry'] },
    ]);
  });
});

describe('getPlayerGroupNames', () => {
  it('lists the top-level folders Sync did not create', async () => {
    const songsFolder = new MemorySongsFolder();
    songsFolder.addFolder(['DDR A20']);
    songsFolder.addFolder(['dancedance.studio']);
    await songsFolder.writeText({ path: ['readme.txt'], text: 'not a group' });
    const record = withOwnedGroup({ record: buildEmptyInstalledSongsRecord(), groupName: 'dancedance.studio' });
    expect(await getPlayerGroupNames({ songsFolder, record })).toEqual(['DDR A20']);
  });
});

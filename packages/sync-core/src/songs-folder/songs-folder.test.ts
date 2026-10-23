import { describe, expect, it } from 'vitest';
import { MemorySongsFolder } from './memory-songs-folder';
import { buildSongsPath, isSamePath, UnsafeSongsPathError } from './songs-path';

describe('buildSongsPath', () => {
  it.each(['..', '.', '', 'Pop/../..', 'C:\\Windows'])('refuses %j, which could lead outside the Songs folder', (name) => {
    expect(() => buildSongsPath('Pop', name)).toThrow(UnsafeSongsPathError);
  });

  it('compares names without case, as Windows does', () => {
    expect(isSamePath({ first: buildSongsPath('Pop', 'Sorry'), second: buildSongsPath('POP', 'sorry') })).toBe(true);
  });
});

describe('MemorySongsFolder', () => {
  it('lists folders and files directly inside a folder', async () => {
    const songsFolder = new MemorySongsFolder();
    await songsFolder.writeText({ path: ['Pop', 'Sorry', 'Sorry.ssc'], text: 'x' });
    await songsFolder.writeText({ path: ['Pop', 'notes.txt'], text: 'x' });
    songsFolder.addFolder(['Rock']);
    expect(await songsFolder.listEntries([])).toEqual(expect.arrayContaining([{ name: 'Pop', isFolder: true }, { name: 'Rock', isFolder: true }]));
    expect(await songsFolder.listEntries(['Pop'])).toEqual(expect.arrayContaining([{ name: 'Sorry', isFolder: true }, { name: 'notes.txt', isFolder: false }]));
  });

  it('never renames onto something that exists', async () => {
    const songsFolder = new MemorySongsFolder();
    await songsFolder.writeText({ path: ['StepsVault', 'Sorry', 'Sorry.ssc'], text: 'ours' });
    await songsFolder.writeText({ path: ['Pop', 'Sorry', 'Sorry.ssc'], text: 'theirs' });
    await expect(songsFolder.rename({ from: ['StepsVault', 'Sorry'], to: ['pop', 'SORRY'] })).rejects.toThrow('already there');
    expect(await songsFolder.readText(['Pop', 'Sorry', 'Sorry.ssc'])).toBe('theirs');
  });

  it('moves a whole folder on rename and removes only inside the given folder', async () => {
    const songsFolder = new MemorySongsFolder();
    await songsFolder.writeText({ path: ['StepsVault', 'Sorry', 'Sorry.ssc'], text: 'ours' });
    await songsFolder.writeText({ path: ['StepsVault', 'Sorry Not Sorry', 'a.ssc'], text: 'other' });
    await songsFolder.rename({ from: ['StepsVault', 'Sorry'], to: ['StepsVault · Pop', 'Sorry'] });
    await songsFolder.removeFolder(['StepsVault · Pop', 'Sorry']);
    expect(await songsFolder.readText(['StepsVault · Pop', 'Sorry', 'Sorry.ssc'])).toBeNull();
    expect(await songsFolder.readText(['StepsVault', 'Sorry Not Sorry', 'a.ssc'])).toBe('other');
  });
});

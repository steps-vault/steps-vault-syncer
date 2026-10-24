import { describe, expect, it } from 'vitest';
import { MemorySongsFolder } from '../songs-folder/memory-songs-folder';
import { buildSongsPath } from '../songs-folder/songs-path';
import { getChartHash } from './chart-hash';
import { checkInstalledSong } from './installed-song-check';
import type { InstalledSong } from './installed-songs';
import { buildSongFolderMarkerText, SONG_FOLDER_MARKER_FILE_NAME } from './song-folder-marker';

const CHART_TEXT = '#TITLE:Cheap Thrills;\n#OFFSET:-0.120;\n';

function buildInstalledSong(overrides: Partial<InstalledSong> = {}): InstalledSong {
  return {
    vaultSongId: 'song-1',
    chartVersion: 'v3',
    installId: 'install-a',
    folderPath: buildSongsPath('StepsVault', 'Cheap Thrills'),
    chartHashesByFileName: { 'Cheap Thrills.ssc': getChartHash(CHART_TEXT) },
    installedAt: '2026-10-24T10:00:00Z',
    ...overrides,
  };
}

async function writeSongFolder({ songsFolder, installedSong, markerText }: { songsFolder: MemorySongsFolder; installedSong: InstalledSong; markerText?: string }): Promise<void> {
  await songsFolder.writeText({ path: [...installedSong.folderPath, 'Cheap Thrills.ssc'], text: CHART_TEXT });
  await songsFolder.writeText({ path: [...installedSong.folderPath, SONG_FOLDER_MARKER_FILE_NAME], text: markerText ?? buildSongFolderMarkerText(installedSong) });
}

describe('checkInstalledSong', () => {
  it('finds a folder Sync wrote, unchanged, intact', async () => {
    const songsFolder = new MemorySongsFolder();
    const installedSong = buildInstalledSong();
    await writeSongFolder({ songsFolder, installedSong });
    expect((await checkInstalledSong({ songsFolder, installedSong })).state).toBe('intact');
  });

  it('finds the folder whatever the case of its name, as Windows does', async () => {
    const songsFolder = new MemorySongsFolder();
    const installedSong = buildInstalledSong();
    await writeSongFolder({ songsFolder, installedSong: { ...installedSong, folderPath: buildSongsPath('stepsvault', 'CHEAP THRILLS') } });
    expect((await checkInstalledSong({ songsFolder, installedSong })).state).toBe('intact');
  });

  it('reports a deleted folder as missing', async () => {
    const songsFolder = new MemorySongsFolder();
    expect((await checkInstalledSong({ songsFolder, installedSong: buildInstalledSong() })).state).toBe('missing');
  });

  it('never claims a folder without a marker, even at the path Sync recorded', async () => {
    const songsFolder = new MemorySongsFolder();
    const installedSong = buildInstalledSong();
    await songsFolder.writeText({ path: [...installedSong.folderPath, 'Cheap Thrills.ssc'], text: 'the player put their own song here' });
    expect((await checkInstalledSong({ songsFolder, installedSong })).state).toBe('not-ours');
  });

  it('never claims a folder whose marker came from another install (copied folder or another computer)', async () => {
    const songsFolder = new MemorySongsFolder();
    const installedSong = buildInstalledSong();
    await writeSongFolder({ songsFolder, installedSong, markerText: buildSongFolderMarkerText({ ...installedSong, installId: 'install-b' }) });
    expect((await checkInstalledSong({ songsFolder, installedSong })).state).toBe('not-ours');
  });

  it('never claims a folder with a broken marker', async () => {
    const songsFolder = new MemorySongsFolder();
    const installedSong = buildInstalledSong();
    await writeSongFolder({ songsFolder, installedSong, markerText: '{"format": "stepsvault-song", "version": 1' });
    expect((await checkInstalledSong({ songsFolder, installedSong })).state).toBe('not-ours');
  });

  it('notices a chart file the player edited', async () => {
    const songsFolder = new MemorySongsFolder();
    const installedSong = buildInstalledSong();
    await writeSongFolder({ songsFolder, installedSong });
    await songsFolder.writeText({ path: [...installedSong.folderPath, 'Cheap Thrills.ssc'], text: `${CHART_TEXT}#EDITED:yes;\n` });
    const check = await checkInstalledSong({ songsFolder, installedSong });
    expect(check.state).toBe('edited');
    expect(check.editedFileNames).toEqual(['Cheap Thrills.ssc']);
  });

  it('counts a removed chart file as an edit', async () => {
    const songsFolder = new MemorySongsFolder();
    const installedSong = buildInstalledSong({ chartHashesByFileName: { 'Cheap Thrills.ssc': getChartHash(CHART_TEXT), 'Extra.ssc': getChartHash('x') } });
    await writeSongFolder({ songsFolder, installedSong });
    expect((await checkInstalledSong({ songsFolder, installedSong })).editedFileNames).toEqual(['Extra.ssc']);
  });
});

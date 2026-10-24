import type { SongsFolder } from '../songs-folder/songs-folder';
import { buildSongsPath, getNameKey, type SongsPath } from '../songs-folder/songs-path';
import { getChartHash } from './chart-hash';
import type { InstalledSong, InstalledSongsRecord } from './installed-songs';
import { isMarkerOf, parseSongFolderMarker, SONG_FOLDER_MARKER_FILE_NAME } from './song-folder-marker';

/**
 * - `intact`: ours, as Sync wrote it.
 * - `edited`: ours, but the player changed a chart file; Sync won't overwrite it unless the player asks.
 * - `missing`: the folder is gone (the player deleted or moved it).
 * - `not-ours`: a folder is there, but its marker doesn't match: the player replaced it. Never touch it again.
 */
export type InstalledSongState = 'intact' | 'edited' | 'missing' | 'not-ours';

export interface InstalledSongCheck {
  installedSong: InstalledSong;
  state: InstalledSongState;
  editedFileNames: string[];
}

export async function checkInstalledSongs({ songsFolder, record }: { songsFolder: SongsFolder; record: InstalledSongsRecord }): Promise<InstalledSongCheck[]> {
  return Promise.all(record.installedSongs.map((installedSong) => checkInstalledSong({ songsFolder, installedSong })));
}

export async function checkInstalledSong({ songsFolder, installedSong }: { songsFolder: SongsFolder; installedSong: InstalledSong }): Promise<InstalledSongCheck> {
  const folderPath = installedSong.folderPath;
  if (!(await isFolderPresent({ songsFolder, folderPath }))) return { installedSong, state: 'missing', editedFileNames: [] };
  const markerText = await songsFolder.readText(buildSongsPath(...folderPath, SONG_FOLDER_MARKER_FILE_NAME));
  const marker = markerText === null ? null : parseSongFolderMarker(markerText);
  if (!isMarkerOf({ marker, installedSong })) return { installedSong, state: 'not-ours', editedFileNames: [] };
  const editedFileNames = await getEditedChartFileNames({ songsFolder, installedSong });
  return { installedSong, state: editedFileNames.length > 0 ? 'edited' : 'intact', editedFileNames };
}

async function isFolderPresent({ songsFolder, folderPath }: { songsFolder: SongsFolder; folderPath: SongsPath }): Promise<boolean> {
  const folderName = folderPath.at(-1);
  if (folderName === undefined) return false;
  const siblings = await songsFolder.listEntries(folderPath.slice(0, -1));
  return siblings.some((entry) => entry.isFolder && getNameKey(entry.name) === getNameKey(folderName));
}

/** A chart file that is missing counts as edited too: the player removed steps on purpose. */
async function getEditedChartFileNames({ songsFolder, installedSong }: { songsFolder: SongsFolder; installedSong: InstalledSong }): Promise<string[]> {
  const fileNames = Object.keys(installedSong.chartHashesByFileName);
  const currentTexts = await Promise.all(fileNames.map((fileName) => songsFolder.readText(buildSongsPath(...installedSong.folderPath, fileName))));
  return fileNames.filter((fileName, index) => {
    const currentText = currentTexts[index];
    return currentText === null || currentText === undefined || getChartHash(currentText) !== installedSong.chartHashesByFileName[fileName];
  });
}

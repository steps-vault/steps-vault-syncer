import { getChartHash } from '../ownership/chart-hash';
import { checkInstalledSong } from '../ownership/installed-song-check';
import type { InstalledSong } from '../ownership/installed-songs';
import { buildSongFolderMarkerText, SONG_FOLDER_MARKER_FILE_NAME } from '../ownership/song-folder-marker';
import type { SyncAction } from '../planner/sync-plan-types';
import { buildPlayerSsc } from '../ssc/player-ssc';
import { SongsFolderError, type SongsFolder } from '../songs-folder/songs-folder';
import { buildSongsPath, type SongsPath } from '../songs-folder/songs-path';
import { SongWriteError, toSongWriteError } from './song-write-error';

/** The music keeps one plain name in every song folder, so it never needs escaping inside the song file. */
export const MUSIC_BASE_NAME = 'music';
export const VIDEO_BASE_NAME = 'video';
/** Hidden from StepMania and most file browsers by the leading dot, while a song is being written. */
export const TEMPORARY_FOLDER_PREFIX = '.stepsvault-new-';
const NEW_FILE_SUFFIX = '.stepsvault-new';

/** A song's files on StepsVault, for one chart version. */
export interface SongFiles {
  sscText: string;
  /** Banner, background, jacket: the names the song file refers to. */
  images: readonly { fileName: string; bytes: Uint8Array }[];
}

/** Where song files come from: the StepsVault API client (task 9) implements this. */
export interface VaultFiles {
  fetchSongFiles(options: { vaultSongId: string; chartVersion: string }): Promise<SongFiles>;
}

export interface SongWriterDependencies {
  songsFolder: SongsFolder;
  vaultFiles: VaultFiles;
  createId: () => string;
  getNow: () => string;
}

type AddAction = Extract<SyncAction, { kind: 'add' }>;
type UpdateAction = Extract<SyncAction, { kind: 'update' }>;

/**
 * Everything is written into a hidden folder next to the target and renamed into place last, so the game never sees a
 * half-written song; if anything fails, the hidden folder is removed and the error says what the player can do.
 */
export async function addSong({ dependencies, action }: { dependencies: SongWriterDependencies; action: AddAction }): Promise<InstalledSong> {
  const { songsFolder } = dependencies;
  const installId = dependencies.createId();
  const [groupName, folderName] = action.to;
  if (groupName === undefined || folderName === undefined) throw new SongWriteError({ failure: 'other', message: 'A song can only be added as a group and a song folder. This is a bug in Sync; please report it.' });
  const temporaryPath = buildSongsPath(groupName, `${TEMPORARY_FOLDER_PREFIX}${installId}`);
  try {
    const files = await fetchFiles({ dependencies, vaultSongId: action.vaultSongId, chartVersion: action.chartVersion });
    const musicFileName = await songsFolder.copyMusic({ sourceId: action.audio.sourceId, folder: temporaryPath, baseName: MUSIC_BASE_NAME });
    const videoFileName = action.audio.videoSourceId === null ? null : await songsFolder.copyVideo({ sourceId: action.audio.videoSourceId, folder: temporaryPath, baseName: VIDEO_BASE_NAME });
    const music = { fileName: musicFileName, shiftSeconds: action.audio.shiftSeconds, videoFileName };
    const sscFileName = `${folderName}.ssc`;
    const sscText = buildPlayerSsc({ sscText: files.sscText, musicFileName, shiftSeconds: music.shiftSeconds, videoFileName });
    await writeImages({ songsFolder, folder: temporaryPath, files });
    await songsFolder.writeText({ path: [...temporaryPath, sscFileName], text: sscText });
    const installedSong: InstalledSong = { vaultSongId: action.vaultSongId, chartVersion: action.chartVersion, installId, folderPath: action.to, chartHashesByFileName: { [sscFileName]: getChartHash(sscText) }, music, installedAt: dependencies.getNow() };
    await songsFolder.writeText({ path: [...temporaryPath, SONG_FOLDER_MARKER_FILE_NAME], text: buildSongFolderMarkerText(installedSong) });
    await songsFolder.rename({ from: temporaryPath, to: action.to });
    return installedSong;
  } catch (error) {
    await removeQuietly({ songsFolder, path: temporaryPath });
    throw toSongWriteError(error);
  }
}

/** New steps for an installed song: same music, same shift; the old song file is swapped for the new one last. */
export async function updateSong({ dependencies, action, installedSong }: { dependencies: SongWriterDependencies; action: UpdateAction; installedSong: InstalledSong }): Promise<InstalledSong> {
  const { songsFolder } = dependencies;
  await assertStillOurs({ songsFolder, installedSong });
  try {
    const files = await fetchFiles({ dependencies, vaultSongId: action.vaultSongId, chartVersion: action.chartVersion });
    const sscFileName = `${action.at.at(-1) ?? 'song'}.ssc`;
    const sscText = buildPlayerSsc({ sscText: files.sscText, musicFileName: installedSong.music.fileName, shiftSeconds: installedSong.music.shiftSeconds, videoFileName: installedSong.music.videoFileName ?? null });
    await writeImages({ songsFolder, folder: action.at, files });
    await replaceText({ songsFolder, path: [...action.at, sscFileName], text: sscText });
    await removeOldChartFiles({ songsFolder, installedSong, keptFileName: sscFileName });
    return { ...installedSong, chartVersion: action.chartVersion, chartHashesByFileName: { [sscFileName]: getChartHash(sscText) } };
  } catch (error) {
    throw toSongWriteError(error);
  }
}

export async function moveSong({ songsFolder, installedSong, to }: { songsFolder: SongsFolder; installedSong: InstalledSong; to: SongsPath }): Promise<InstalledSong> {
  await assertStillOurs({ songsFolder, installedSong });
  try {
    await songsFolder.rename({ from: installedSong.folderPath, to });
    return { ...installedSong, folderPath: to };
  } catch (error) {
    throw toSongWriteError(error);
  }
}

export async function removeSong({ songsFolder, installedSong }: { songsFolder: SongsFolder; installedSong: InstalledSong }): Promise<void> {
  await assertStillOurs({ songsFolder, installedSong });
  try {
    await songsFolder.removeFolder(installedSong.folderPath);
  } catch (error) {
    throw toSongWriteError(error);
  }
}

/** The plan was made a moment ago; the player may have replaced the folder since. Checked again before every change. */
async function assertStillOurs({ songsFolder, installedSong }: { songsFolder: SongsFolder; installedSong: InstalledSong }): Promise<void> {
  const check = await checkInstalledSong({ songsFolder, installedSong });
  if (check.state === 'intact' || check.state === 'edited') return;
  throw new SongWriteError({ failure: 'not-ours', message: `${installedSong.folderPath.join(' / ')} changed while syncing, so Sync left it alone. Sync again to see what to do.` });
}

async function fetchFiles({ dependencies, vaultSongId, chartVersion }: { dependencies: SongWriterDependencies; vaultSongId: string; chartVersion: string }): Promise<SongFiles> {
  try {
    return await dependencies.vaultFiles.fetchSongFiles({ vaultSongId, chartVersion });
  } catch (error) {
    throw new SongWriteError({ failure: 'download-failed', message: 'The steps couldn’t be downloaded from StepsVault. Check your internet connection and sync again.', cause: error });
  }
}

async function writeImages({ songsFolder, folder, files }: { songsFolder: SongsFolder; folder: SongsPath; files: SongFiles }): Promise<void> {
  for (const image of files.images) await songsFolder.writeBytes({ path: [...folder, ...buildSongsPath(image.fileName)], bytes: image.bytes });
}

/** Written beside the old file first, so a full disk leaves the old song file as it was. */
async function replaceText({ songsFolder, path, text }: { songsFolder: SongsFolder; path: SongsPath; text: string }): Promise<void> {
  const newPath = [...path.slice(0, -1), `${path.at(-1) ?? ''}${NEW_FILE_SUFFIX}`];
  await songsFolder.writeText({ path: newPath, text });
  await songsFolder.removeFile(path);
  await songsFolder.rename({ from: newPath, to: path });
}

async function removeOldChartFiles({ songsFolder, installedSong, keptFileName }: { songsFolder: SongsFolder; installedSong: InstalledSong; keptFileName: string }): Promise<void> {
  const oldFileNames = Object.keys(installedSong.chartHashesByFileName).filter((fileName) => fileName !== keptFileName);
  for (const fileName of oldFileNames) await songsFolder.removeFile([...installedSong.folderPath, ...buildSongsPath(fileName)]);
}

export async function removeQuietly({ songsFolder, path }: { songsFolder: SongsFolder; path: SongsPath }): Promise<void> {
  try {
    await songsFolder.removeFolder(path);
  } catch (error) {
    // The original failure matters more; a leftover hidden folder is cleaned up by the next sync.
    if (!(error instanceof SongsFolderError)) throw error;
  }
}

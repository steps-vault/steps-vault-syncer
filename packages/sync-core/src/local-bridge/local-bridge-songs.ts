import { getGeneratedSongFolderState } from '../ownership/generated-song-marker';
import { getGeneratedSongs, type GeneratedSong } from '../ownership/generated-songs';
import type { InstalledSongsRecord } from '../ownership/installed-songs';
import type { SongsFolder, SongsFolderEntry } from '../songs-folder/songs-folder';
import { getNameKey, type SongsPath } from '../songs-folder/songs-path';
import { LOCAL_BRIDGE_FILE_KINDS, type LocalBridgeFileKind, type LocalBridgeSong } from './local-bridge-protocol';

/**
 * Which generated songs and files the bridge may serve. Only songs in Sync's own record, only while their folder is
 * still the one Sync wrote (its marker matches), and only the files Sync writes there under its own names. Nothing
 * here takes a name from a request: a request picks a song key and a file kind, and the names come from the record.
 */

const CONTENT_TYPES_BY_MUSIC_EXTENSION: Readonly<Record<string, string>> = { ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav' };
const CONTENT_TYPES_BY_VIDEO_EXTENSION: Readonly<Record<string, string>> = { mp4: 'video/mp4', m4v: 'video/x-m4v', avi: 'video/x-msvideo', mpg: 'video/mpeg', mpeg: 'video/mpeg' };
const PICTURE_CONTENT_TYPE = 'image/png';
/** Plain text, never HTML, so a song file opened by itself can't run anything. */
const CHART_CONTENT_TYPE = 'text/plain; charset=utf-8';

export interface LocalBridgeSongFile {
  songsPath: SongsPath;
  contentType: string;
}

interface OwnSongFolder {
  generatedSong: GeneratedSong;
  folderPath: SongsPath;
  folderName: string;
  fileEntries: SongsFolderEntry[];
}

export async function getLocalBridgeSongs({ record, songsFolder }: { record: InstalledSongsRecord; songsFolder: SongsFolder }): Promise<LocalBridgeSong[]> {
  const ownFolders = await Promise.all(getGeneratedSongs(record).map((generatedSong) => getOwnSongFolder({ songsFolder, generatedSong }).catch(() => null)));
  return ownFolders.flatMap((ownFolder) => (ownFolder ? [buildLocalBridgeSong(ownFolder)] : [])).sort((first, second) => first.title.localeCompare(second.title));
}

/** null when the song isn't Sync's, its folder was replaced or removed, or it has no file of that kind. */
export async function getLocalBridgeSongFile({ record, songsFolder, songKey, fileKind }: { record: InstalledSongsRecord; songsFolder: SongsFolder; songKey: string; fileKind: LocalBridgeFileKind }): Promise<LocalBridgeSongFile | null> {
  const generatedSong = getGeneratedSongs(record).find((song) => song.songKey === songKey);
  if (!generatedSong) return null;
  // A folder Sync can't read (a link put in its place, a locked disk) is served like a missing one.
  const ownFolder = await getOwnSongFolder({ songsFolder, generatedSong }).catch(() => null);
  if (!ownFolder) return null;
  const file = findSongFile({ ownFolder, fileKind });
  return file ? { songsPath: [...ownFolder.folderPath, file.fileName], contentType: file.contentType } : null;
}

async function getOwnSongFolder({ songsFolder, generatedSong }: { songsFolder: SongsFolder; generatedSong: GeneratedSong }): Promise<OwnSongFolder | null> {
  const { folderPath } = generatedSong;
  const folderName = folderPath[1];
  if (folderPath.length !== 2 || folderName === undefined) return null;
  if ((await getGeneratedSongFolderState({ songsFolder, generatedSong })) !== 'ours') return null;
  const fileEntries = (await songsFolder.listEntries(folderPath)).filter((entry) => !entry.isFolder);
  return { generatedSong, folderPath, folderName, fileEntries };
}

function findSongFile({ ownFolder, fileKind }: { ownFolder: OwnSongFolder; fileKind: LocalBridgeFileKind }): { fileName: string; contentType: string } | null {
  if (fileKind === 'chart') return findNamedFile({ ownFolder, fileName: `${ownFolder.folderName}.ssc`, contentType: CHART_CONTENT_TYPE });
  if (fileKind === 'music') return findFileByExtension({ ownFolder, baseName: 'music', contentTypesByExtension: CONTENT_TYPES_BY_MUSIC_EXTENSION });
  if (fileKind === 'video') return findFileByExtension({ ownFolder, baseName: 'video', contentTypesByExtension: CONTENT_TYPES_BY_VIDEO_EXTENSION });
  return findNamedFile({ ownFolder, fileName: `${fileKind}.png`, contentType: PICTURE_CONTENT_TYPE });
}

function findNamedFile({ ownFolder, fileName, contentType }: { ownFolder: OwnSongFolder; fileName: string; contentType: string }): { fileName: string; contentType: string } | null {
  const entry = ownFolder.fileEntries.find((candidate) => getNameKey(candidate.name) === getNameKey(fileName));
  return entry ? { fileName: entry.name, contentType } : null;
}

function findFileByExtension({ ownFolder, baseName, contentTypesByExtension }: { ownFolder: OwnSongFolder; baseName: string; contentTypesByExtension: Readonly<Record<string, string>> }): { fileName: string; contentType: string } | null {
  for (const entry of ownFolder.fileEntries) {
    const [entryBaseName, extension, ...rest] = getNameKey(entry.name).split('.');
    const contentType = extension === undefined ? undefined : contentTypesByExtension[extension];
    if (entryBaseName === baseName && rest.length === 0 && contentType) return { fileName: entry.name, contentType };
  }
  return null;
}

function buildLocalBridgeSong(ownFolder: OwnSongFolder): LocalBridgeSong {
  const { generatedSong, folderPath } = ownFolder;
  return {
    songKey: generatedSong.songKey,
    title: generatedSong.song.title,
    artist: generatedSong.song.artist,
    generatorName: generatedSong.generatorName,
    difficulties: generatedSong.difficulties.map((difficulty) => ({ difficulty, level: generatedSong.levelsByDifficulty?.[difficulty] ?? null })),
    location: { groupName: folderPath[0] ?? '', folderName: ownFolder.folderName },
    fileKinds: LOCAL_BRIDGE_FILE_KINDS.filter((fileKind) => findSongFile({ ownFolder, fileKind }) !== null),
    generatedAt: generatedSong.generatedAt,
  };
}

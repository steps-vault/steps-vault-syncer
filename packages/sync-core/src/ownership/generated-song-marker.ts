import type { SongsFolder } from '../songs-folder/songs-folder';
import { buildSongsPath, getNameKey } from '../songs-folder/songs-path';
import type { GeneratedSong } from './generated-songs';
import { SONG_FOLDER_MARKER_FILE_NAME } from './song-folder-marker';

/** Not the vault marker's format, so the vault sync never takes a generated song's folder for one of its own. */
const GENERATED_MARKER_FORMAT = 'stepsvault-generated-song';

export interface GeneratedSongFolderMarker {
  format: typeof GENERATED_MARKER_FORMAT;
  version: 1;
  songKey: string;
  installId: string;
}

/**
 * - `ours`: the folder Sync wrote for this song, with its marker.
 * - `missing`: the folder is gone.
 * - `not-ours`: a folder is there, but the player replaced it. Never touch it.
 */
export type GeneratedSongFolderState = 'ours' | 'missing' | 'not-ours';

export function buildGeneratedSongMarkerText(generatedSong: Pick<GeneratedSong, 'songKey' | 'installId'>): string {
  const marker: GeneratedSongFolderMarker = { format: GENERATED_MARKER_FORMAT, version: 1, songKey: generatedSong.songKey, installId: generatedSong.installId };
  return `${JSON.stringify(marker, null, 2)}\n`;
}

export async function getGeneratedSongFolderState({ songsFolder, generatedSong }: { songsFolder: SongsFolder; generatedSong: GeneratedSong }): Promise<GeneratedSongFolderState> {
  const folderName = generatedSong.folderPath.at(-1);
  if (folderName === undefined) return 'missing';
  const siblings = await songsFolder.listEntries(generatedSong.folderPath.slice(0, -1));
  if (!siblings.some((entry) => entry.isFolder && getNameKey(entry.name) === getNameKey(folderName))) return 'missing';
  const markerText = await songsFolder.readText(buildSongsPath(...generatedSong.folderPath, SONG_FOLDER_MARKER_FILE_NAME));
  return markerText !== null && isMarkerOf({ markerText, generatedSong }) ? 'ours' : 'not-ours';
}

function isMarkerOf({ markerText, generatedSong }: { markerText: string; generatedSong: GeneratedSong }): boolean {
  const marker = parseJsonOrNull(markerText);
  if (typeof marker !== 'object' || marker === null) return false;
  const { format, version, songKey, installId } = marker as Record<string, unknown>;
  return format === GENERATED_MARKER_FORMAT && version === 1 && songKey === generatedSong.songKey && installId === generatedSong.installId;
}

function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

import { getFileNameFacts, getSongNameKey } from './song-names';

/** One audio file in the player's music folders. */
export interface MusicFile {
  /** How the platform finds the file again (decode, copy); opaque to the core. */
  sourceId: string;
  fileName: string;
  /** The folders above it, for the screen and as a hint ("…/Sia/This Is Acting/Cheap Thrills.mp3"). */
  folderNames: readonly string[];
  /** From the file's tags when the platform could read them. */
  taggedTitle: string | null;
  taggedArtist: string | null;
}

/**
 * The player's music folders. The website walks directory handles, the app walks the disk; both yield audio files
 * only (by extension) and check `shouldStop` between files so the player can stop a long scan.
 */
export interface MusicLibrary {
  listMusicFiles(options: { shouldStop: () => boolean }): AsyncIterable<MusicFile>;
}

export interface MusicIndex {
  filesByTitleKey: ReadonlyMap<string, readonly MusicFile[]>;
  fileCount: number;
}

export interface ScanProgress {
  scannedFileCount: number;
}

const PROGRESS_EVERY_FILES = 100;

export async function scanMusicLibrary(options: { musicLibrary: MusicLibrary; shouldStop?: () => boolean; onProgress?: (progress: ScanProgress) => void }): Promise<MusicIndex> {
  const shouldStop = options.shouldStop ?? (() => false);
  const filesByTitleKey = new Map<string, MusicFile[]>();
  let fileCount = 0;
  for await (const musicFile of options.musicLibrary.listMusicFiles({ shouldStop })) {
    if (shouldStop()) break;
    const titleKey = getSongNameKey(getMusicFileTitle(musicFile));
    filesByTitleKey.set(titleKey, [...(filesByTitleKey.get(titleKey) ?? []), musicFile]);
    fileCount += 1;
    if (fileCount % PROGRESS_EVERY_FILES === 0) options.onProgress?.({ scannedFileCount: fileCount });
  }
  options.onProgress?.({ scannedFileCount: fileCount });
  return { filesByTitleKey, fileCount };
}

/** Up to `limit` files that may be this song, best first: same title and artist, then same title with no artist known. */
export function findMusicCandidates({ index, title, artist, limit = 5 }: { index: MusicIndex; title: string; artist: string; limit?: number }): MusicFile[] {
  const sameTitle = index.filesByTitleKey.get(getSongNameKey(title)) ?? [];
  const artistKey = getSongNameKey(artist);
  const rankedFiles = [...sameTitle].sort((first, second) => getArtistRank({ musicFile: first, artistKey }) - getArtistRank({ musicFile: second, artistKey }));
  return rankedFiles.filter((musicFile) => getArtistRank({ musicFile, artistKey }) < OTHER_ARTIST_RANK).slice(0, limit);
}

const SAME_ARTIST_RANK = 0;
const ARTIST_IN_FOLDER_RANK = 1;
const UNKNOWN_ARTIST_RANK = 2;
const OTHER_ARTIST_RANK = 3;

/** A different artist's song with the same title (two "Sorry"s) is never a candidate: the sound check would only waste time. */
function getArtistRank({ musicFile, artistKey }: { musicFile: MusicFile; artistKey: string }): number {
  const fileArtist = getMusicFileArtist(musicFile);
  if (fileArtist !== null) return getSongNameKey(fileArtist) === artistKey ? SAME_ARTIST_RANK : OTHER_ARTIST_RANK;
  if (musicFile.folderNames.some((folderName) => getSongNameKey(folderName) === artistKey)) return ARTIST_IN_FOLDER_RANK;
  return UNKNOWN_ARTIST_RANK;
}

function getMusicFileTitle(musicFile: MusicFile): string {
  return musicFile.taggedTitle ?? getFileNameFacts(musicFile.fileName).title;
}

function getMusicFileArtist(musicFile: MusicFile): string | null {
  return musicFile.taggedArtist ?? getFileNameFacts(musicFile.fileName).artist;
}

import { getMusicFileFacts, type MusicFile, type MusicIndex } from './music-library';
import { getSongNameKey } from './song-names';

const DEFAULT_SEARCH_LIMIT = 20;

/**
 * Files in the player's music folders whose title, artist, name or folders contain every word typed, for picking the
 * music of a new song. Titles that start with the words come first.
 */
export function searchMusicIndex({ index, query, limit = DEFAULT_SEARCH_LIMIT }: { index: MusicIndex; query: string; limit?: number }): MusicFile[] {
  const queryKey = getSongNameKey(query);
  const queryWords = queryKey.split(' ').filter((word) => word !== '');
  if (queryWords.length === 0) return [];
  const matches = [...index.filesByTitleKey.values()].flat().filter((musicFile) => {
    const searchText = getSearchText(musicFile);
    return queryWords.every((word) => searchText.includes(word));
  });
  return matches.sort((first, second) => getTitleRank({ musicFile: first, queryKey }) - getTitleRank({ musicFile: second, queryKey })).slice(0, limit);
}

function getSearchText(musicFile: MusicFile): string {
  const { title, artist } = getMusicFileFacts(musicFile);
  return getSongNameKey([title, artist ?? '', musicFile.fileName, ...musicFile.folderNames].join(' '));
}

function getTitleRank({ musicFile, queryKey }: { musicFile: MusicFile; queryKey: string }): number {
  return getSongNameKey(getMusicFileFacts(musicFile).title).startsWith(queryKey) ? 0 : 1;
}

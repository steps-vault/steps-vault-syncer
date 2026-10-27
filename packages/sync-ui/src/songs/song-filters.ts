import type { SongSyncStatus } from '@stepsvault/sync-core';
import type { SongRowView } from '../sync-ui-types';

export type SongSortOrder = 'recently-added' | 'title' | 'artist';

export interface SongFilters {
  status: SongSyncStatus | null;
  genre: string | null;
  artist: string | null;
  searchText: string;
  sortOrder: SongSortOrder;
}

export const NO_SONG_FILTERS: SongFilters = { status: null, genre: null, artist: null, searchText: '', sortOrder: 'recently-added' };

/** The rows that match every filter, in the chosen order. Filtering happens here, over the rows already loaded. */
export function getVisibleSongRows({ rows, filters }: { rows: readonly SongRowView[]; filters: SongFilters }): SongRowView[] {
  const searchKey = filters.searchText.trim().toLocaleLowerCase();
  const matchingRows = rows.filter((row) =>
    (filters.status === null || row.status === filters.status)
    && (filters.genre === null || row.genre === filters.genre)
    && (filters.artist === null || row.artist === filters.artist)
    && (searchKey === '' || `${row.title} ${row.artist}`.toLocaleLowerCase().includes(searchKey)));
  return matchingRows.sort(getRowComparer(filters.sortOrder));
}

function getRowComparer(sortOrder: SongSortOrder): (first: SongRowView, second: SongRowView) => number {
  if (sortOrder === 'title') return (first, second) => first.title.localeCompare(second.title);
  if (sortOrder === 'artist') return (first, second) => first.artist.localeCompare(second.artist) || first.title.localeCompare(second.title);
  return (first, second) => second.addedAt - first.addedAt;
}

export function hasActiveFilters(filters: SongFilters): boolean {
  return filters.status !== null || filters.genre !== null || filters.artist !== null || filters.searchText.trim() !== '';
}

export function getSongCountsByStatus(rows: readonly SongRowView[]): Map<SongSyncStatus, number> {
  const countsByStatus = new Map<SongSyncStatus, number>();
  for (const row of rows) countsByStatus.set(row.status, (countsByStatus.get(row.status) ?? 0) + 1);
  return countsByStatus;
}

export interface NameCount {
  name: string;
  songCount: number;
}

export function getGenreNames(rows: readonly SongRowView[]): string[] {
  return getGenreNameCounts(rows).map((nameCount) => nameCount.name);
}

export function getArtistNames(rows: readonly SongRowView[]): string[] {
  return getArtistNameCounts(rows).map((nameCount) => nameCount.name);
}

/** Each genre once, A to Z, with how many songs have it. */
export function getGenreNameCounts(rows: readonly SongRowView[]): NameCount[] {
  return getSortedNameCounts(rows.map((row) => row.genre));
}

export function getArtistNameCounts(rows: readonly SongRowView[]): NameCount[] {
  return getSortedNameCounts(rows.map((row) => row.artist));
}

function getSortedNameCounts(names: readonly (string | null)[]): NameCount[] {
  const songCountsByName = new Map<string, number>();
  for (const name of names) {
    if (name === null || name === '') continue;
    songCountsByName.set(name, (songCountsByName.get(name) ?? 0) + 1);
  }
  return [...songCountsByName].map(([name, songCount]) => ({ name, songCount })).sort((first, second) => first.name.localeCompare(second.name));
}

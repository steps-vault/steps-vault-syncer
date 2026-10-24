import { describe, expect, it } from 'vitest';
import { FAKE_SONG_ROWS } from '../fake-data/fake-sync-data';
import { getArtistNames, getGenreNames, getSongCountsByStatus, getVisibleSongRows, hasActiveFilters, NO_SONG_FILTERS } from './song-filters';

function getTitles(filters: Partial<typeof NO_SONG_FILTERS>): string[] {
  return getVisibleSongRows({ rows: FAKE_SONG_ROWS, filters: { ...NO_SONG_FILTERS, ...filters } }).map((row) => row.title);
}

describe('getVisibleSongRows', () => {
  it('shows every song, newest first, with no filters', () => {
    const titles = getTitles({});
    expect(titles).toHaveLength(FAKE_SONG_ROWS.length);
    expect(titles[0]).toBe('Paper Thrills');
    expect(titles.at(-1)).toBe('Slow Motion Comet');
  });

  it('keeps only one status', () => {
    expect(getTitles({ status: 'needs-audio' })).toEqual(['שמש של חצות', 'Pulse Garden']);
  });

  it('keeps only one genre and one artist', () => {
    expect(getTitles({ genre: 'Electronic', artist: 'Kairo Lights' })).toEqual(['Paris', 'Neon Overdrive', 'Pulse Garden', 'Afterimage']);
  });

  it('searches titles and artists without caring about letter case', () => {
    expect(getTitles({ searchText: '  velvet ' })).toEqual(['Sugar You']);
    expect(getTitles({ searchText: 'PULSE' })).toEqual(['Pulse Garden']);
  });

  it('sorts by title, and by artist then title', () => {
    expect(getTitles({ sortOrder: 'title' }).slice(0, 3)).toEqual(['Afterimage', 'Bassline Cathedral', 'Cumbia del Satélite']);
    expect(getTitles({ sortOrder: 'artist', artist: 'Kairo Lights' })).toEqual(['Afterimage', 'Neon Overdrive', 'Paris', 'Pulse Garden']);
  });

  it('never changes the rows it was given', () => {
    const titlesBefore = FAKE_SONG_ROWS.map((row) => row.title);
    getTitles({ sortOrder: 'title' });
    expect(FAKE_SONG_ROWS.map((row) => row.title)).toEqual(titlesBefore);
  });
});

describe('song filter helpers', () => {
  it('counts songs by status', () => {
    const countsByStatus = getSongCountsByStatus(FAKE_SONG_ROWS);
    expect(countsByStatus.get('synced')).toBe(5);
    expect(countsByStatus.get('update-available')).toBe(2);
    expect(countsByStatus.get('syncing')).toBeUndefined();
  });

  it('lists genres and artists once each, sorted', () => {
    expect(getGenreNames(FAKE_SONG_ROWS)).toContain('Drum & Bass');
    expect(getArtistNames(FAKE_SONG_ROWS).filter((name) => name === 'Kairo Lights')).toHaveLength(1);
  });

  it('says when any filter is on, but not for the sort order', () => {
    expect(hasActiveFilters(NO_SONG_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...NO_SONG_FILTERS, sortOrder: 'title' })).toBe(false);
    expect(hasActiveFilters({ ...NO_SONG_FILTERS, searchText: 'x' })).toBe(true);
  });
});

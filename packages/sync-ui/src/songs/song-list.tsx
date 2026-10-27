import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Icon } from '../icons/icon';
import { SITE_NAME } from '../shared/brand-names';
import { joinClassNames } from '../shared/class-names';
import { ComboBox } from '../shared/combo-box';
import { SegmentedControl, type SegmentedOption } from '../shared/small-parts';
import type { SongRowView } from '../sync-ui-types';
import { getArtistNameCounts, getGenreNameCounts, getSongCountsByStatus, getVisibleSongRows, hasActiveFilters, NO_SONG_FILTERS, type SongFilters, type SongSortOrder } from './song-filters';
import { SongRow, type SongActionRequest } from './song-row';
import { StatusCounterTiles } from './status-counter-tiles';

const DEFAULT_PAGE_SIZE = 50;
const SORT_OPTIONS: readonly SegmentedOption<SongSortOrder>[] = [
  { value: 'recently-added', label: 'Recently added' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
];

export interface SongListProps {
  rows: readonly SongRowView[];
  isSyncing: boolean;
  selectedSongId: string | null;
  onOpenSongDetails: (vaultSongId: string) => void;
  onSongAction: (request: SongActionRequest) => void;
  initialFilters?: Partial<SongFilters>;
  pageSize?: number;
  /** The song details drawer, shown next to the list; the list hides its audio and action columns to make room. */
  drawer?: ReactNode;
}

/** The status counters, the filters and the songs. Filters work over the rows given, with no extra loading. */
export function SongList(props: SongListProps): ReactElement {
  const [filters, setFilters] = useState<SongFilters>({ ...NO_SONG_FILTERS, ...props.initialFilters });
  const [isShowingAll, setIsShowingAll] = useState(false);
  const visibleRows = useMemo(() => getVisibleSongRows({ rows: props.rows, filters }), [props.rows, filters]);
  const pageSize = props.pageSize ?? DEFAULT_PAGE_SIZE;
  const shownRows = isShowingAll ? visibleRows : visibleRows.slice(0, pageSize);
  const updateFilters = (change: Partial<SongFilters>): void => { setFilters((current) => ({ ...current, ...change })); };
  const clearFilters = (): void => { setFilters((current) => ({ ...NO_SONG_FILTERS, sortOrder: current.sortOrder })); };
  const hasDrawer = Boolean(props.drawer);
  return (
    <div className={joinClassNames('sv-sync-song-browser', hasDrawer && 'sv-sync-song-browser--compact')}>
      <StatusCounterTiles countsByStatus={getSongCountsByStatus(props.rows)} selectedStatus={filters.status} onSelectStatus={(status) => { updateFilters({ status }); }} />
      <SongFilterBar rows={props.rows} filters={filters} onChange={updateFilters} onClear={clearFilters} />
      <div className={joinClassNames('sv-sync-home-grid', hasDrawer && 'sv-sync-home-grid--with-drawer')}>
        <div className="sv-sync-song-table">
          <SongListHead />
          <ul className="sv-sync-song-list" aria-label={`Your ${SITE_NAME} songs`}>
            {shownRows.map((row) => (
              <SongRow key={row.vaultSongId} row={row} isSelected={row.vaultSongId === props.selectedSongId} isSyncing={props.isSyncing} onOpenDetails={props.onOpenSongDetails} onSongAction={props.onSongAction} />
            ))}
          </ul>
          {visibleRows.length === 0 && (
            <div className="sv-sync-note" role="status">
              <Icon name="info" />
              <span>No songs match these filters. <button className="sv-sync-link-button" type="button" onClick={clearFilters}>Clear filters</button></span>
            </div>
          )}
          <div className="sv-sync-list-footer">
            <span className="sv-sync-tabular" role="status">Showing {shownRows.length} of {props.rows.length} {props.rows.length === 1 ? 'song' : 'songs'}</span>
            {shownRows.length < visibleRows.length && <button className="sv-sync-link-button" type="button" onClick={() => { setIsShowingAll(true); }}>Show all {visibleRows.length}</button>}
          </div>
        </div>
        {props.drawer}
      </div>
    </div>
  );
}

/** Column titles for sighted players; each row already says the same things to screen readers. */
function SongListHead(): ReactElement {
  return (
    <div className="sv-sync-song-list-head" aria-hidden="true">
      <span /><span>Song</span><span>Difficulties</span><span>Status</span><span className="sv-sync-song-column--source">Audio from</span><span className="sv-sync-song-column--actions" />
    </div>
  );
}

interface SongFilterBarProps {
  rows: readonly SongRowView[];
  filters: SongFilters;
  onChange: (change: Partial<SongFilters>) => void;
  onClear: () => void;
}

function SongFilterBar({ rows, filters, onChange, onClear }: SongFilterBarProps): ReactElement {
  return (
    <div className="sv-sync-filters">
      <label className="sv-sync-field-label">
        Search
        <span className="sv-sync-search-box">
          <Icon name="search" />
          <input className="sv-sync-field" type="search" placeholder="Title or artist" value={filters.searchText} onChange={(event) => { onChange({ searchText: event.target.value }); }} />
        </span>
      </label>
      <NameFilter label="Genre" anyLabel="All genres" noun="genre" nameCounts={getGenreNameCounts(rows)} selectedName={filters.genre} onSelect={(genre) => { onChange({ genre }); }} />
      <NameFilter label="Artist" anyLabel="All artists" noun="artist" nameCounts={getArtistNameCounts(rows)} selectedName={filters.artist} onSelect={(artist) => { onChange({ artist }); }} />
      <div className="sv-sync-field-label">
        Sort
        <SegmentedControl label="Sort" options={SORT_OPTIONS} selectedValue={filters.sortOrder} onSelect={(sortOrder) => { onChange({ sortOrder }); }} />
      </div>
      {hasActiveFilters(filters) && <button className="sv-sync-link-button sv-sync-clear-filters" type="button" onClick={onClear}>Clear filters</button>}
    </div>
  );
}

interface NameFilterProps {
  label: string;
  anyLabel: string;
  noun: string;
  nameCounts: readonly { name: string; songCount: number }[];
  selectedName: string | null;
  onSelect: (name: string | null) => void;
}

/** The empty value means "any", since no genre or artist is called "". */
function NameFilter({ label, anyLabel, noun, nameCounts, selectedName, onSelect }: NameFilterProps): ReactElement {
  return (
    <div className="sv-sync-name-filter">
      <ComboBox label={label} anyLabel={anyLabel} noun={noun} options={nameCounts.map(({ name, songCount }) => ({ value: name, label: name, count: songCount }))} value={selectedName ?? ''} onChange={(value) => { onSelect(value === '' ? null : value); }} />
    </div>
  );
}

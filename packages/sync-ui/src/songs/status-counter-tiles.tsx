import type { SongSyncStatus } from '@stepsvault/sync-core';
import type { ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { joinClassNames } from '../shared/class-names';
import { COUNTED_SONG_STATUSES, getStatusToneClassName, SONG_STATUS_DISPLAYS } from '../status/song-status';

export interface StatusCounterTilesProps {
  countsByStatus: ReadonlyMap<SongSyncStatus, number>;
  selectedStatus: SongSyncStatus | null;
  onSelectStatus: (status: SongSyncStatus | null) => void;
}

/** One counter per status; pressing one shows only those songs, pressing it again shows all. */
export function StatusCounterTiles({ countsByStatus, selectedStatus, onSelectStatus }: StatusCounterTilesProps): ReactElement {
  return (
    <div className="sv-sync-counter-tiles" role="group" aria-label="Filter by status">
      {COUNTED_SONG_STATUSES.map((status) => {
        const isSelected = status === selectedStatus;
        const display = SONG_STATUS_DISPLAYS[status];
        return (
          <button key={status} className={joinClassNames('sv-sync-counter-tile', getStatusToneClassName(status))} type="button" aria-pressed={isSelected} onClick={() => { onSelectStatus(isSelected ? null : status); }}>
            <span className="sv-sync-counter-number">{countsByStatus.get(status) ?? 0}</span>
            <span className="sv-sync-counter-label">
              <Icon name={display.iconName} size={14} strokeWidth={2.4} />
              {display.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

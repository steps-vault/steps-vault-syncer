import type { ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { LifeBar } from '../shared/life-bar';
import type { SyncPlatform } from '../sync-ui-types';

export interface SyncProgressBarProps {
  platform: SyncPlatform;
  /** The song being worked on now, counting from 1. */
  currentSongNumber: number;
  totalSongCount: number;
  /** For example "Lining up the steps · Cheap Thrills". */
  currentStepText: string;
}

export function SyncProgressBar({ platform, currentSongNumber, totalSongCount, currentStepText }: SyncProgressBarProps): ReactElement {
  const progressText = `Syncing ${String(currentSongNumber)} of ${String(totalSongCount)}`;
  return (
    <section className="sv-sync-panel sv-sync-progress" aria-label="Sync progress">
      <div className="sv-sync-progress-head" aria-live="polite">
        <span className="sv-sync-display sv-sync-progress-title">{progressText}</span>
        <span className="sv-sync-small sv-sync-muted">{currentStepText}</span>
      </div>
      <LifeBar label="Sync progress" value={currentSongNumber} maximum={totalSongCount} valueText={progressText} />
      {platform === 'website' && (
        <div className="sv-sync-small sv-sync-keep-tab-open">
          <Icon name="info" size={14} />
          Keep this tab open until it finishes. Other tabs are fine.
        </div>
      )}
    </section>
  );
}

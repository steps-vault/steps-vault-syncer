import { useRef, type ReactElement, type ReactNode } from 'react';
import { JudgmentFlash } from '../progress/judgment-flash';
import { SyncProgressBar } from '../progress/sync-progress-bar';
import { ReceptorLoader } from '../shared/receptor-loader';
import { SyncTopBar, type SyncTopBarProps } from '../shell/sync-top-bar';
import { NeedsAudioBanner, type NeedsAudioBannerProps } from '../states/empty-and-error-states';
import type { SongDetailsView, SongRowView, SyncPlatform } from '../sync-ui-types';
import { SongDetailsDrawer } from './song-details-drawer';
import { SongList } from './song-list';
import type { SongActionRequest } from './song-row';

export interface SyncRunView {
  currentSongNumber: number;
  totalSongCount: number;
  currentStepText: string;
}

export interface FinishedSyncView {
  syncedCount: number;
  needsYouCount: number;
}

export interface SyncHomeScreenProps {
  platform: SyncPlatform;
  topBar: Omit<SyncTopBarProps, 'platform' | 'isSyncing'>;
  /** The sync running now, or null. */
  syncRun: SyncRunView | null;
  /** The sync that just ended, until the player presses Done. */
  finishedSync: FinishedSyncView | null;
  onSeeActivity: () => void;
  onDismissFinishedSync: () => void;
  needsAudioBanner?: NeedsAudioBannerProps | null;
  songs: readonly SongRowView[];
  /** Shown instead of the list when there are no songs, for example EmptyVaultState. */
  emptyState?: ReactNode;
  selectedSongDetails: SongDetailsView | null;
  onOpenSongDetails: (vaultSongId: string) => void;
  onCloseSongDetails: () => void;
  onSongAction: (request: SongActionRequest) => void;
  /** True while Sync reads the songs for the first time: the screen shows only the loader. */
  isLoading?: boolean;
}

/** Screen 2: the top bar, the sync progress or result, the counters, the song list and the details drawer. */
export function SyncHomeScreen(props: SyncHomeScreenProps): ReactElement {
  const detailsOpenerRef = useRef<HTMLElement | null>(null);
  const isSyncing = props.syncRun !== null;
  const handleOpenDetails = (vaultSongId: string): void => {
    if (document.activeElement instanceof HTMLElement) detailsOpenerRef.current = document.activeElement;
    props.onOpenSongDetails(vaultSongId);
  };
  const handleCloseDetails = (): void => {
    props.onCloseSongDetails();
    const opener = detailsOpenerRef.current;
    if (opener?.isConnected) opener.focus();
  };
  if (props.isLoading === true) return <SyncLoadingPanel />;
  return (
    <div className="sv-sync-screen">
      <SyncTopBar {...props.topBar} platform={props.platform} isSyncing={isSyncing} />
      {props.syncRun && <SyncProgressBar platform={props.platform} {...props.syncRun} />}
      {!isSyncing && props.finishedSync && <JudgmentFlash {...props.finishedSync} onSeeActivity={props.onSeeActivity} onDismiss={props.onDismissFinishedSync} />}
      {props.needsAudioBanner && <NeedsAudioBanner {...props.needsAudioBanner} />}
      {props.songs.length === 0 && props.emptyState}
      {props.songs.length > 0 && (
        <SongList
          rows={props.songs}
          isSyncing={isSyncing}
          selectedSongId={props.selectedSongDetails?.song.vaultSongId ?? null}
          onOpenSongDetails={handleOpenDetails}
          onSongAction={props.onSongAction}
          drawer={props.selectedSongDetails && <SongDetailsDrawer details={props.selectedSongDetails} onClose={handleCloseDetails} onSongAction={props.onSongAction} />}
        />
      )}
    </div>
  );
}

/** Sync is starting: reading the game folder and the library. */
export function SyncLoadingPanel(): ReactElement {
  return (
    <section className="sv-sync-panel sv-sync-loading-panel">
      <ReceptorLoader label="Loading your songs…" />
    </section>
  );
}

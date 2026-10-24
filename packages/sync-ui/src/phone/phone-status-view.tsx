import type { SongSyncStatus } from '@stepsvault/sync-core';
import type { ReactElement } from 'react';
import { ArrowReceptor } from '../icons/arrow-receptor';
import { Icon } from '../icons/icon';
import { joinClassNames } from '../shared/class-names';
import { CoverArt } from '../shared/cover-art';
import { getStatusToneClassName } from '../status/song-status';
import { StatusChip } from '../status/status-chip';

export interface PhoneSongView {
  vaultSongId: string;
  title: string;
  coverArtUrl: string | null;
  status: SongSyncStatus;
}

export interface PhoneStatusViewProps {
  computerName: string;
  gameName: string;
  overallStatus: SongSyncStatus;
  lastSyncText: string;
  syncedCount: number;
  needsAudioCount: number;
  updateCount: number;
  songs: readonly PhoneSongView[];
}

/** Phones can check, not sync: the same chips and counters, no Sync button and no folder choices. */
export function PhoneStatusView(props: PhoneStatusViewProps): ReactElement {
  return (
    <div className="sv-sync-root sv-sync-phone">
      <div className="sv-sync-phone-head">
        <ArrowReceptor direction="up" size={28} className="sv-sync-receptor--logo" />
        <h2 className="sv-sync-display sv-sync-phone-title">Sync to my game</h2>
      </div>
      <div className="sv-sync-phone-body">
        <div className="sv-sync-panel sv-sync-phone-summary">
          <span className="sv-sync-small sv-sync-muted">{props.computerName} · {props.gameName}</span>
          <span className="sv-sync-row"><StatusChip status={props.overallStatus} /><span className="sv-sync-small">{props.lastSyncText}</span></span>
        </div>
        <div className="sv-sync-phone-tiles">
          <PhoneTile status="synced" count={props.syncedCount} label="Synced" />
          <PhoneTile status="needs-audio" count={props.needsAudioCount} label="Needs audio" />
          <PhoneTile status="update-available" count={props.updateCount} label="Updates" />
        </div>
        <div className="sv-sync-note sv-sync-small">
          <Icon name="computer" />
          <span>Syncing needs a computer. Open StepsVault Sync on {props.computerName}, or stepsvault.com in Chrome or Edge.</span>
        </div>
        <ul className="sv-sync-phone-songs" aria-label="Your StepsVault songs">
          {props.songs.map((song) => (
            <li key={song.vaultSongId} className="sv-sync-phone-song">
              <CoverArt coverArtUrl={song.coverArtUrl} className="sv-sync-cover--small" />
              <div className="sv-sync-stack-tiny sv-sync-min-width-0">
                <span className="sv-sync-phone-song-title" dir="auto">{song.title}</span>
                <StatusChip status={song.status} isSmall />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PhoneTile({ status, count, label }: { status: SongSyncStatus; count: number; label: string }): ReactElement {
  return (
    <div className={joinClassNames('sv-sync-phone-tile', getStatusToneClassName(status))}>
      <b>{count}</b>{label}
    </div>
  );
}

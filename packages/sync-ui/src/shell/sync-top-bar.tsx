import type { ReactElement } from 'react';
import { ArrowReceptor } from '../icons/arrow-receptor';
import { joinClassNames } from '../shared/class-names';
import { ToggleSwitch } from '../shared/small-parts';
import type { ConnectedGameView, SyncPlatform } from '../sync-ui-types';

export interface AudioSourcesSummaryView {
  sourceNames: readonly string[];
}

export interface LastSyncView {
  /** For example "Today, 18:42". */
  timeText: string;
  /** For example "2 hours ago". */
  noteText: string;
}

export interface BackgroundSyncView {
  isOn: boolean;
  onToggle: (isOn: boolean) => void;
}

export interface SyncTopBarProps {
  platform: SyncPlatform;
  game: ConnectedGameView;
  audioSources: AudioSourcesSummaryView;
  lastSync: LastSyncView | null;
  isSyncing: boolean;
  onSyncNow: () => void;
  onChangeGame: () => void;
  onManageAudioSources: () => void;
  /** Desktop only. */
  backgroundSync?: BackgroundSyncView;
}

export function SyncTopBar(props: SyncTopBarProps): ReactElement {
  const sourceCount = props.audioSources.sourceNames.length;
  return (
    <section className={joinClassNames('sv-sync-panel sv-sync-top-bar', props.platform === 'desktop' && 'sv-sync-top-bar--desktop')} aria-label="Sync status">
      <div className="sv-sync-top-bar-block">
        <span className="sv-sync-label">Game</span>
        <span className="sv-sync-row">
          <ArrowReceptor direction="up" size={22} className="sv-sync-receptor--arrow" />
          <b>{props.game.gameName}</b>
          <button className="sv-sync-link-button sv-sync-link-button--small" type="button" onClick={props.onChangeGame} aria-label={`Change game (${props.game.gameName})`}>Change</button>
        </span>
        <span className="sv-sync-mono sv-sync-ellipsis" title={props.game.songsFolderPath}>{props.game.songsFolderPath}</span>
      </div>
      <div className="sv-sync-top-bar-block">
        <span className="sv-sync-label">Audio</span>
        <span className="sv-sync-row">
          <b>{sourceCount === 1 ? '1 source' : `${String(sourceCount)} sources`}</b>
          <button className="sv-sync-link-button sv-sync-link-button--small" type="button" onClick={props.onManageAudioSources} aria-label="Manage audio sources">Manage</button>
        </span>
        <span className="sv-sync-ellipsis">{props.audioSources.sourceNames.join(' · ')}</span>
      </div>
      <div className="sv-sync-top-bar-block">
        <span className="sv-sync-label">Last sync</span>
        <b className="sv-sync-tabular">{props.isSyncing ? 'Now' : (props.lastSync?.timeText ?? 'Never')}</b>
        <span>{props.isSyncing ? 'Syncing…' : (props.lastSync?.noteText ?? 'Press Sync now to start')}</span>
      </div>
      {props.backgroundSync && <BackgroundSyncRow backgroundSync={props.backgroundSync} />}
      <SyncNowButton isSyncing={props.isSyncing} onSyncNow={props.onSyncNow} />
    </section>
  );
}

function BackgroundSyncRow({ backgroundSync }: { backgroundSync: BackgroundSyncView }): ReactElement {
  return (
    <div className="sv-sync-top-bar-block sv-sync-background-sync">
      <ToggleSwitch isOn={backgroundSync.isOn} onToggle={backgroundSync.onToggle} labelledById="sv-sync-background-sync-label" />
      <b id="sv-sync-background-sync-label">Background sync: {backgroundSync.isOn ? 'On' : 'Off'}</b>
      <span>Keeps syncing from the tray when this window is closed.</span>
    </div>
  );
}

/** The big arrow-receptor button; it stays in place while syncing so the layout never jumps. */
export function SyncNowButton({ isSyncing, onSyncNow }: { isSyncing: boolean; onSyncNow: () => void }): ReactElement {
  return (
    <button className="sv-sync-now-button" type="button" onClick={onSyncNow} disabled={isSyncing}>
      <span className="sv-sync-now-receptor">
        <span className={isSyncing ? 'sv-sync-spin sv-sync-spin-box' : 'sv-sync-spin-box'}>
          <ArrowReceptor direction="up" size={34} />
        </span>
      </span>
      {isSyncing ? 'SYNCING…' : 'SYNC NOW'}
    </button>
  );
}

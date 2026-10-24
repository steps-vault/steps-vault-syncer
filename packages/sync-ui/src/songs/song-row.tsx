import type { ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { joinClassNames } from '../shared/class-names';
import { CoverArt } from '../shared/cover-art';
import { DifficultyLevelBadges } from '../shared/difficulty-levels';
import { getSongStatusActions, SONG_ACTION_LABELS } from '../status/song-status';
import { StatusChip } from '../status/status-chip';
import type { SongAction, SongRowView, SongSyncProgress, SongSyncStep } from '../sync-ui-types';
import { SongAudioSourceLabel } from './song-audio-source';

export const SONG_SYNC_STEP_LABELS: Readonly<Record<SongSyncStep, string>> = {
  'finding-audio': 'Finding audio',
  'checking-edit': 'Checking it’s the same edit',
  'lining-up': 'Lining up the steps',
  'writing-to-game': 'Writing to your game',
};
const SONG_SYNC_STEPS: readonly SongSyncStep[] = ['finding-audio', 'checking-edit', 'lining-up', 'writing-to-game'];

export interface SongActionRequest {
  vaultSongId: string;
  action: SongAction;
}

export interface SongRowProps {
  row: SongRowView;
  isSelected: boolean;
  isSyncing: boolean;
  onOpenDetails: (vaultSongId: string) => void;
  onSongAction: (request: SongActionRequest) => void;
}

export function SongRow({ row, isSelected, isSyncing, onOpenDetails, onSongAction }: SongRowProps): ReactElement {
  const handleAction = (action: SongAction): void => { onSongAction({ vaultSongId: row.vaultSongId, action }); };
  return (
    <li className={joinClassNames('sv-sync-song-row', isSelected && 'sv-sync-song-row--selected', row.status === 'removed-from-vault' && 'sv-sync-song-row--gone')}>
      <CoverArt coverArtUrl={row.coverArtUrl} />
      <div className="sv-sync-song-title-block">
        <button className="sv-sync-song-title" type="button" dir="auto" aria-label={`${row.title} — details`} aria-expanded={isSelected} onClick={() => { onOpenDetails(row.vaultSongId); }}>{row.title}</button>
        <span className="sv-sync-song-artist" dir="auto">{[row.artist, row.genre].filter(Boolean).join(' · ')}</span>
      </div>
      <DifficultyLevelBadges levels={row.levels} />
      <div className="sv-sync-song-status">
        {row.progress ? <SongProgress progress={row.progress} /> : <SongStatus row={row} isSyncing={isSyncing} onAction={handleAction} />}
      </div>
      <SongAudioSourceLabel audioSource={row.audioSource} className="sv-sync-song-column--source" />
      <div className="sv-sync-song-hover-actions sv-sync-song-column--actions">
        <button className="sv-sync-icon-button" type="button" onClick={() => { handleAction('sync'); }} aria-label={`Sync ${row.title}`} disabled={isSyncing}>
          <Icon name="spin" size={14} />Sync
        </button>
        <button className="sv-sync-icon-button" type="button" onClick={() => { handleAction('choose-audio'); }} aria-label={`Choose audio for ${row.title}`}>Choose audio…</button>
        <button className="sv-sync-icon-button" type="button" onClick={() => { onOpenDetails(row.vaultSongId); }} aria-label={`Details for ${row.title}`}>
          Details<Icon name="chevron" size={14} />
        </button>
      </div>
    </li>
  );
}

function SongStatus({ row, isSyncing, onAction }: { row: SongRowView; isSyncing: boolean; onAction: (action: SongAction) => void }): ReactElement {
  const actions = isSyncing ? [] : (row.statusActions ?? getSongStatusActions(row.status));
  return (
    <>
      <StatusChip status={row.status} />
      {actions.length > 0 && (
        <span className="sv-sync-status-actions">
          {actions.map((action) => (
            <button key={action} className="sv-sync-link-button sv-sync-link-button--tiny" type="button" onClick={() => { onAction(action); }}>{SONG_ACTION_LABELS[action]}</button>
          ))}
        </span>
      )}
      {row.note && <span className="sv-sync-small sv-sync-muted">{row.note}</span>}
    </>
  );
}

function SongProgress({ progress }: { progress: SongSyncProgress }): ReactElement {
  if (progress.kind === 'waiting-in-line') {
    return (
      <span className="sv-sync-waiting">
        <Icon name="clock" size={14} />In line
      </span>
    );
  }
  const stepIndex = SONG_SYNC_STEPS.indexOf(progress.step);
  return (
    <div className="sv-sync-song-step">
      <span className="sv-sync-row">
        <Icon name="spin" size={14} className="sv-sync-spin" />
        {SONG_SYNC_STEP_LABELS[progress.step]}…
      </span>
      <span className="sv-sync-step-dots" aria-hidden="true">
        {SONG_SYNC_STEPS.map((step, index) => <i key={step} className={index <= stepIndex ? 'sv-sync-step-dot--on' : undefined} />)}
      </span>
    </div>
  );
}

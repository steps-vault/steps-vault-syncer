import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { joinClassNames } from '../shared/class-names';
import { CoverArt } from '../shared/cover-art';
import { DifficultyPanels } from '../shared/difficulty-levels';
import { StatusChip } from '../status/status-chip';
import type { AudioMatchView, SongAction, SongDetailsView } from '../sync-ui-types';
import { SongAudioSourceLabel } from './song-audio-source';
import type { SongActionRequest } from './song-row';

const CONFIDENCE_BLOCK_COUNT = 10;
const LOW_CONFIDENCE_BELOW = 6;

export interface SongDetailsDrawerProps {
  details: SongDetailsView;
  onClose: () => void;
  onSongAction: (request: SongActionRequest) => void;
}

/** A side panel next to the song list. It takes focus when it opens and closes on Escape. */
export function SongDetailsDrawer({ details, onClose, onSongAction }: SongDetailsDrawerProps): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const song = details.song;
  const handleAction = (action: SongAction): void => { onSongAction({ vaultSongId: song.vaultSongId, action }); };
  useEffect(() => { headingRef.current?.focus(); }, [song.vaultSongId]);
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };
  return (
    <aside className="sv-sync-drawer" aria-label={`Song details: ${song.title}`} onKeyDown={handleKeyDown}>
      <div className="sv-sync-drawer-head">
        {song.coverArtUrl && <img className="sv-sync-drawer-backdrop" src={song.coverArtUrl} alt="" />}
        <button className="sv-sync-drawer-close" type="button" onClick={onClose} aria-label="Close details">
          <Icon name="close" strokeWidth={2.6} />
        </button>
        <div className="sv-sync-drawer-head-content">
          <CoverArt coverArtUrl={song.coverArtUrl} className="sv-sync-cover--large" />
          <div className="sv-sync-drawer-facts">
            <h2 ref={headingRef} tabIndex={-1} className="sv-sync-display sv-sync-drawer-title" dir="auto">{song.title}</h2>
            <span className="sv-sync-drawer-artist" dir="auto">{song.artist}</span>
            <span className="sv-sync-small">{[details.album, song.genre].filter(Boolean).join(' · ')}</span>
            <span className="sv-sync-small sv-sync-tabular">{details.bpmText} · {details.lengthText}</span>
          </div>
        </div>
      </div>
      <div className="sv-sync-drawer-body">
        <div className="sv-sync-row sv-sync-wrap">
          <StatusChip status={song.status} />
          {details.statusNote && <span className="sv-sync-small sv-sync-muted">{details.statusNote}</span>}
        </div>
        <section className="sv-sync-drawer-section" aria-labelledby="sv-sync-drawer-difficulties">
          <h3 id="sv-sync-drawer-difficulties">Difficulties</h3>
          <DifficultyPanels levels={song.levels} />
        </section>
        <AudioMatchSection details={details} onAction={handleAction} />
        <InYourGameSection details={details} onAction={handleAction} />
        <DangerZoneSection details={details} onAction={handleAction} />
      </div>
    </aside>
  );
}

function AudioMatchSection({ details, onAction }: { details: SongDetailsView; onAction: (action: SongAction) => void }): ReactElement {
  const match = details.audioMatch;
  const hasAudio = details.song.audioSource.kind !== 'none';
  return (
    <section className="sv-sync-drawer-section" aria-labelledby="sv-sync-drawer-audio">
      <h3 id="sv-sync-drawer-audio">Audio match</h3>
      <dl className="sv-sync-facts">
        <dt>Audio from</dt><dd><SongAudioSourceLabel audioSource={details.song.audioSource} /></dd>
        <dt>File</dt><dd className="sv-sync-mono sv-sync-break-all">{match.fileName ?? '—'}</dd>
        <dt>Version</dt><dd className={getEditClassName(match)}>{getEditText(match)}</dd>
        <dt>Timing</dt><dd>{match.timingText}</dd>
        <dt>How sure</dt><dd className="sv-sync-row"><ConfidenceMeter confidence={match.confidence} /><span className="sv-sync-small">{getConfidenceText(match.confidence)}</span></dd>
      </dl>
      <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small sv-sync-align-start" type="button" onClick={() => { onAction(hasAudio ? 'use-different-file' : 'choose-audio'); }}>
        <Icon name="file" size={14} />
        {hasAudio ? 'Use a different file…' : 'Choose audio…'}
      </button>
    </section>
  );
}

function InYourGameSection({ details, onAction }: { details: SongDetailsView; onAction: (action: SongAction) => void }): ReactElement {
  return (
    <section className="sv-sync-drawer-section" aria-labelledby="sv-sync-drawer-game">
      <h3 id="sv-sync-drawer-game">In your game</h3>
      <dl className="sv-sync-facts">
        <dt>Folder</dt><dd className="sv-sync-row"><Icon name="folder" size={15} /><span className="sv-sync-mono" dir="auto">{details.gameFolderPath ?? 'Not in your game yet'}</span></dd>
        <dt>Chart</dt><dd className="sv-sync-tabular">{details.chartVersionText}</dd>
      </dl>
      {details.song.status === 'update-available' && (
        <>
          <div className="sv-sync-update-note">
            <Icon name="up" strokeWidth={2.6} />
            <span><b>Update available.</b> {details.updateNote}</span>
          </div>
          <button className="sv-sync-button sv-sync-button--small sv-sync-align-start" type="button" onClick={() => { onAction('update'); }}>Update this song</button>
        </>
      )}
    </section>
  );
}

function DangerZoneSection({ details, onAction }: { details: SongDetailsView; onAction: (action: SongAction) => void }): ReactElement {
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (isConfirming) confirmRef.current?.querySelector('button')?.focus(); }, [isConfirming]);
  useEffect(() => { setIsConfirming(false); }, [details.song.vaultSongId]);
  return (
    <section className="sv-sync-drawer-section sv-sync-danger-zone" aria-labelledby="sv-sync-drawer-danger">
      <h3 id="sv-sync-drawer-danger">Danger zone</h3>
      {!isConfirming && (
        <>
          <span className="sv-sync-small">Removes only this song&apos;s folder from your game. Your audio file stays where it is.</span>
          <button className="sv-sync-button sv-sync-button--danger sv-sync-button--small sv-sync-align-start" type="button" disabled={details.gameFolderPath === null} onClick={() => { setIsConfirming(true); }}>
            <Icon name="trash" size={14} />Remove from my game
          </button>
        </>
      )}
      {isConfirming && (
        <div ref={confirmRef} className="sv-sync-confirm" role="alertdialog" aria-labelledby="sv-sync-remove-question" aria-describedby="sv-sync-remove-explanation">
          <b id="sv-sync-remove-question">Remove {details.song.title} from your game?</b>
          <span id="sv-sync-remove-explanation">We delete only <span className="sv-sync-mono">{details.gameFolderPath}</span>. Your audio file and your other songs are not touched.</span>
          <div className="sv-sync-row">
            <button className="sv-sync-button sv-sync-button--danger sv-sync-button--small" type="button" onClick={() => { setIsConfirming(false); onAction('remove-from-game'); }}>Remove</button>
            <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={() => { setIsConfirming(false); }}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

function ConfidenceMeter({ confidence }: { confidence: number }): ReactElement {
  return (
    <span className={joinClassNames('sv-sync-confidence', confidence < LOW_CONFIDENCE_BELOW && 'sv-sync-confidence--low')} aria-hidden="true">
      {Array.from({ length: CONFIDENCE_BLOCK_COUNT }, (_, index) => <i key={index} className={index < confidence ? 'sv-sync-confidence-block--on' : undefined} />)}
    </span>
  );
}

export function getConfidenceText(confidence: number): string {
  if (confidence >= 9) return 'Very sure';
  if (confidence >= 7) return 'Sure';
  if (confidence >= 4) return 'Not sure';
  if (confidence > 0) return 'Probably not the same';
  return 'Nothing to check yet';
}

function getEditText(match: AudioMatchView): string {
  if (match.edit === 'same') return 'Same edit ✓';
  if (match.edit === 'different') return 'Different edit ✗';
  return 'No audio yet';
}

function getEditClassName(match: AudioMatchView): string {
  if (match.edit === 'same') return 'sv-sync-good-text';
  if (match.edit === 'different') return 'sv-sync-bad-text';
  return 'sv-sync-muted';
}

import type { ReactElement, ReactNode } from 'react';
import { ArrowReceptor } from '../icons/arrow-receptor';
import { Icon, type IconName } from '../icons/icon';
import { joinClassNames } from '../shared/class-names';
import { SITE_NAME } from '../shared/brand-names';

type StateTone = 'calm' | 'warning' | 'error';

interface StateCardProps {
  label: string;
  tone: StateTone;
  picture: ReactNode;
  title: string;
  isCentered?: boolean;
  children: ReactNode;
  action: ReactNode;
}

/** Every empty or error state says what happened and what to do next; none of them is a dead end. */
function StateCard({ label, tone, picture, title, isCentered = false, children, action }: StateCardProps): ReactElement {
  return (
    <section className={joinClassNames('sv-sync-state-card', `sv-sync-state-card--${tone}`, isCentered && 'sv-sync-state-card--centered')} aria-label={label} role={tone === 'calm' ? undefined : 'alert'}>
      {picture}
      <h3>{title}</h3>
      <p className="sv-sync-text sv-sync-small">{children}</p>
      {action}
    </section>
  );
}

function StateButton({ iconName, label, isGhost = false, onClick }: { iconName: IconName; label: string; isGhost?: boolean; onClick: () => void }): ReactElement {
  return (
    <button className={joinClassNames('sv-sync-button', isGhost && 'sv-sync-button--ghost')} type="button" onClick={onClick}>
      <Icon name={iconName} />{label}
    </button>
  );
}

export function EmptyVaultState({ vaultHref }: { vaultHref: string }): ReactElement {
  const picture = (
    <div className="sv-sync-empty-receptors" aria-hidden="true">
      <ArrowReceptor direction="left" size={40} /><ArrowReceptor direction="down" size={40} /><ArrowReceptor direction="up" size={40} /><ArrowReceptor direction="right" size={40} />
    </div>
  );
  return (
    <StateCard label="Empty library" tone="calm" picture={picture} title="Your library is empty" isCentered action={<a className="sv-sync-button" href={vaultHref}><Icon name="external" />Browse the library</a>}>
      Make or add songs on {SITE_NAME}. They show up here and sync to your game.
    </StateCard>
  );
}

/** Website only: browsers forget folder permission when they close. */
export function PermissionLostState({ onReconnect }: { onReconnect: () => void }): ReactElement {
  return (
    <StateCard label="Permission lost" tone="warning" picture={<ArrowReceptor size={48} className="sv-sync-receptor--warning" />} title="Permission needed" action={<StateButton iconName="spin" label="Reconnect" onClick={onReconnect} />}>
      Browsers forget the folder when you close them. Reconnect, then click <b>Allow</b>.
    </StateCard>
  );
}

export function SongsFolderMissingState({ previousSongsFolderPath, onChooseFolder }: { previousSongsFolderPath: string; onChooseFolder: () => void }): ReactElement {
  return (
    <StateCard label="Game folder moved or missing" tone="error" picture={<Icon name="folder" size={40} className="sv-sync-error-icon" />} title="Songs folder not found" action={<StateButton iconName="folder" label="Choose folder" onClick={onChooseFolder} />}>
      It used to be <span className="sv-sync-mono sv-sync-strong">{previousSongsFolderPath}</span>. Maybe it moved or a drive is unplugged.
    </StateCard>
  );
}

export interface DiskFullStateProps {
  neededSpaceText: string;
  songCount: number;
  driveName: string;
  onTryAgain: () => void;
}

export function DiskFullState({ neededSpaceText, songCount, driveName, onTryAgain }: DiskFullStateProps): ReactElement {
  return (
    <StateCard label="Disk full" tone="error" picture={<Icon name="disk" size={40} className="sv-sync-error-icon" />} title="Disk full" action={<StateButton iconName="spin" label="Try again" isGhost onClick={onTryAgain} />}>
      We need about <b>{neededSpaceText}</b> for {songCount === 1 ? '1 song' : `${String(songCount)} songs`}. Free up space on {driveName}, then try again. Nothing was half-written.
    </StateCard>
  );
}

export function SongFolderLockedState({ songTitle, onTryAgain }: { songTitle: string; onTryAgain: () => void }): ReactElement {
  return (
    <StateCard label="Song folder locked by the game" tone="warning" picture={<ArrowReceptor direction="up" size={44} />} title="StepMania is open" action={<StateButton iconName="spin" label="Try again" isGhost onClick={onTryAgain} />}>
      Close it to update <b>{songTitle}</b>.
    </StateCard>
  );
}

export interface NeedsAudioBannerProps {
  songCount: number;
  onAddMusicFolder: () => void;
  onDismiss: () => void;
}

/** Many songs without audio get one helpful banner instead of a wall of yellow chips. */
export function NeedsAudioBanner({ songCount, onAddMusicFolder, onDismiss }: NeedsAudioBannerProps): ReactElement {
  return (
    <section className="sv-sync-needs-audio-banner" role="status">
      <span className="sv-sync-needs-audio-count sv-sync-tabular">{songCount}</span>
      <div className="sv-sync-grow">
        <b>songs need audio</b>
        <div className="sv-sync-small sv-sync-warning-text">Add your music folder. Sync checks it and lines them up. Your music stays on your computer.</div>
      </div>
      <button className="sv-sync-button" type="button" onClick={onAddMusicFolder}><Icon name="folder" />Add music folder</button>
      <button className="sv-sync-link-button" type="button" onClick={onDismiss}>Not now</button>
    </section>
  );
}

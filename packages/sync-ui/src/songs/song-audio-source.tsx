import type { ReactElement } from 'react';
import { Icon, type IconName } from '../icons/icon';
import { joinClassNames } from '../shared/class-names';
import type { SongAudioSource } from '../sync-ui-types';

interface AudioSourceDisplay {
  label: string;
  iconName: IconName;
  className: string;
}

export function getAudioSourceDisplay(audioSource: SongAudioSource): AudioSourceDisplay {
  if (audioSource.kind === 'music-folder') return { label: 'My music folder', iconName: 'folder', className: 'sv-sync-source--folder' };
  if (audioSource.kind === 'picked-file') return { label: 'Picked file', iconName: 'file', className: 'sv-sync-source--file' };
  if (audioSource.kind === 'addon') return { label: audioSource.addonName, iconName: 'plug', className: 'sv-sync-source--addon' };
  return { label: 'No audio yet', iconName: 'none', className: 'sv-sync-source--none' };
}

/** Every song says where its audio came from: the player's own copy is the whole idea of Sync. */
export function SongAudioSourceLabel({ audioSource, className }: { audioSource: SongAudioSource; className?: string }): ReactElement {
  const display = getAudioSourceDisplay(audioSource);
  return (
    <span className={joinClassNames('sv-sync-source', display.className, className)}>
      <Icon name={display.iconName} />
      <span>{display.label}</span>
    </span>
  );
}

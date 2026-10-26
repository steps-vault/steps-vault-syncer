import { CLASH_PREFIX } from '@stepsvault/sync-core';
import type { ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { SITE_NAME } from '../shared/brand-names';
import { LockedBadge, Note, SetupSteps } from '../shared/small-parts';
import type { PlayerGroupView } from '../sync-ui-types';

export interface SongsFolderPreviewProps {
  songsFolderPath: string;
  playerGroups: readonly PlayerGroupView[];
  /** For example "by genre". */
  layoutText: string;
  onChangeLayout: () => void;
  onChooseAnotherFolder: () => void;
  onContinue: () => void;
}

const NUMBER_FORMAT = new Intl.NumberFormat('en-US');

/** Step 2 of the first run: the player's own groups, each locked, so they see we won't touch them. */
export function SongsFolderPreview(props: SongsFolderPreviewProps): ReactElement {
  const totalSongCount = props.playerGroups.reduce((total, group) => total + group.songCount, 0);
  return (
    <div className="sv-sync-narrow">
      <SetupSteps currentStepIndex={1} />
      <div className="sv-sync-stack-small">
        <h2 className="sv-sync-heading-1">Here&apos;s your Songs folder</h2>
        <p className="sv-sync-text sv-sync-text--large">{getFolderSummary({ songCount: totalSongCount, groupCount: props.playerGroups.length })}</p>
      </div>
      <div className="sv-sync-row">
        <Icon name="folder" size={18} />
        <span className="sv-sync-mono sv-sync-strong">{props.songsFolderPath}</span>
        <button className="sv-sync-link-button sv-sync-link-button--small" type="button" onClick={props.onChooseAnotherFolder}>Change</button>
      </div>
      <ul className="sv-sync-folder-tree" aria-label="Groups in your Songs folder">
        {props.playerGroups.length === 0 && <li className="sv-sync-folder-tree-none">No songs here yet. Ours go in their own groups.</li>}
        {props.playerGroups.map((group) => (
          <li key={group.groupName}>
            <Icon name="folder" size={18} className="sv-sync-subtle" />
            <span dir="auto">{group.groupName}</span>
            <span className="sv-sync-folder-count">{NUMBER_FORMAT.format(group.songCount)} songs</span>
            <LockedBadge />
          </li>
        ))}
        <li className="sv-sync-folder-tree-ours">
          <Icon name="plus" size={18} strokeWidth={2.6} />
          <span>New {SITE_NAME} groups go here, next to yours</span>
          <span className="sv-sync-folder-count">{props.layoutText}</span>
          <button className="sv-sync-link-button sv-sync-link-button--small" type="button" onClick={props.onChangeLayout}>Change layout</button>
        </li>
      </ul>
      {props.playerGroups.length > 0 && <Note iconName="lock">Already have a group like <b className="sv-sync-strong">Pop</b>? Ours is named <b className="sv-sync-strong">{CLASH_PREFIX}Pop</b>, so the two never mix.</Note>}
      <div className="sv-sync-row sv-sync-space-between sv-sync-wrap">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={props.onChooseAnotherFolder}>Choose another folder</button>
        <button className="sv-sync-button sv-sync-button--go sv-sync-button--large" type="button" onClick={props.onContinue}>Continue<Icon name="chevron" strokeWidth={2.6} /></button>
      </div>
    </div>
  );
}

function getFolderSummary({ songCount, groupCount }: { songCount: number; groupCount: number }): string {
  if (groupCount === 0) return '0 songs in this folder.';
  return `${NUMBER_FORMAT.format(songCount)} ${songCount === 1 ? 'song' : 'songs'} in ${String(groupCount)} ${groupCount === 1 ? 'group' : 'groups'}. We never touch them.`;
}

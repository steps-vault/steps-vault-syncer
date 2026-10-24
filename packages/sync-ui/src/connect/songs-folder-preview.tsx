import type { ReactElement } from 'react';
import { Icon } from '../icons/icon';
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
          <span>StepsVault songs go here, as their own groups next to yours</span>
          <span className="sv-sync-folder-count">{props.layoutText}</span>
          <button className="sv-sync-link-button sv-sync-link-button--small" type="button" onClick={props.onChangeLayout}>Change layout</button>
        </li>
      </ul>
      <Note iconName="lock">StepsVault only adds, updates, moves or removes the songs it added itself. If you already have a group with the same name — like your <b className="sv-sync-strong">Pop</b> — ours is called <b className="sv-sync-strong">StepsVault · Pop</b>, so the two never mix.</Note>
      <div className="sv-sync-row sv-sync-space-between sv-sync-wrap">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={props.onChooseAnotherFolder}>Choose another folder</button>
        <button className="sv-sync-button sv-sync-button--go sv-sync-button--large" type="button" onClick={props.onContinue}>Looks good — continue<Icon name="chevron" strokeWidth={2.6} /></button>
      </div>
    </div>
  );
}

function getFolderSummary({ songCount, groupCount }: { songCount: number; groupCount: number }): string {
  if (groupCount === 0) return 'No songs here yet. StepsVault songs will be the first.';
  return `${NUMBER_FORMAT.format(songCount)} songs in ${String(groupCount)} ${groupCount === 1 ? 'group' : 'groups'} — all yours. We'll never touch them.`;
}

import type { ReactElement } from 'react';
import { Icon } from '../icons/icon';
import type { LayoutPreview } from '../sync-ui-types';

export interface FolderTreePreviewProps {
  /** A few of the player's own groups, shown locked above ours. */
  playerGroupNames: readonly string[];
  morePlayerGroupCount: number;
  preview: LayoutPreview;
}

/** A small folder tree: the player's groups locked, then where our songs would go. It repeats nearby text, so screen readers skip it. */
export function FolderTreePreview({ playerGroupNames, morePlayerGroupCount, preview }: FolderTreePreviewProps): ReactElement {
  return (
    <ul className="sv-sync-mini-tree" aria-hidden="true">
      {playerGroupNames.map((groupName) => (
        <li key={`player-${groupName}`} className="sv-sync-mini-tree-group sv-sync-mini-tree--theirs">
          <Icon name="folder" size={14} /><span>{groupName}</span>
          <span className="sv-sync-mini-tree-lock"><Icon name="lock" size={11} strokeWidth={2.6} />Yours</span>
        </li>
      ))}
      {morePlayerGroupCount > 0 && <li className="sv-sync-mini-tree-group sv-sync-mini-tree-more">+ {morePlayerGroupCount} more of yours</li>}
      {preview.groups.map((group) => (
        <FolderTreeGroup key={`ours-${group.groupName}`} group={group} />
      ))}
      {preview.moreGroupsText !== undefined && <li className="sv-sync-mini-tree-group sv-sync-mini-tree-more">{preview.moreGroupsText}</li>}
    </ul>
  );
}

function FolderTreeGroup({ group }: { group: LayoutPreview['groups'][number] }): ReactElement {
  return (
    <>
      <li className="sv-sync-mini-tree-group sv-sync-mini-tree--ours">
        <Icon name="folder" size={14} /><span>{group.groupName}</span>
        {group.tagText !== undefined && <span className="sv-sync-mini-tree-tag">{group.tagText}</span>}
      </li>
      {group.songTitles.map((songTitle) => (
        <li key={songTitle} className="sv-sync-mini-tree-song"><Icon name="note" size={12} /><span dir="auto">{songTitle}</span></li>
      ))}
      {group.moreSongCount !== undefined && group.moreSongCount > 0 && <li className="sv-sync-mini-tree-song sv-sync-mini-tree-more">+ {group.moreSongCount} more</li>}
    </>
  );
}

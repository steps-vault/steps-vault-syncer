import type { ReactElement } from 'react';
import { Icon } from '../icons/icon';
import type { PartyFolderView } from '../sync-ui-types';

export interface PartyFolderListProps {
  partyFolders: readonly PartyFolderView[];
  /** The site's list of the player's party lists (My library › Party lists). */
  partyListsHref?: string;
}

/** The party lists' folders on the Songs screen: copies, so these songs may be in the list below as well. */
export function PartyFolderList({ partyFolders, partyListsHref }: PartyFolderListProps): ReactElement | null {
  if (partyFolders.length === 0) return null;
  return (
    <section className="sv-sync-panel sv-sync-party-folders" aria-labelledby="sv-sync-party-folders-title">
      <div className="sv-sync-party-folders-top">
        <h2 id="sv-sync-party-folders-title" className="sv-sync-heading-2 sv-sync-heading-2--small">Party lists</h2>
        <span className="sv-sync-small sv-sync-muted">Each list is a folder of copies, whatever your folder layout.</span>
        {partyListsHref !== undefined && <a className="sv-sync-small sv-sync-link sv-sync-party-folders-link" href={partyListsHref}>See your party lists</a>}
      </div>
      <ul className="sv-sync-party-folder-rows">
        {partyFolders.map((partyFolder) => (
          <li key={partyFolder.partyListId} className="sv-sync-party-folder-row">
            <Icon name="folder" size={16} />
            <span className="sv-sync-party-folder-name">
              <b className="sv-sync-strong" dir="auto">{partyFolder.listName}</b>
              <span className="sv-sync-small sv-sync-muted">{partyFolder.folderText}</span>
            </span>
            <span className="sv-sync-party-folder-meta">
              <span className="sv-sync-small sv-sync-text">
                {partyFolder.isLeaving ? 'The list is gone · removing its folder' : partyFolder.songCountText}
                {!partyFolder.isLeaving && partyFolder.needsYouText !== null && <span className="sv-sync-party-folder-needs-you"> · {partyFolder.needsYouText}</span>}
              </span>
              {partyFolder.endsText !== null && <span className="sv-sync-party-folder-ends">{partyFolder.endsText}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

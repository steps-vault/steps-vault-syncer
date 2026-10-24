import type { ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { joinClassNames } from './class-names';

/** Cover art is decoration next to the title, so it has no text of its own. */
export function CoverArt({ coverArtUrl, className }: { coverArtUrl: string | null; className?: string }): ReactElement {
  if (coverArtUrl === null) {
    return (
      <span className={joinClassNames('sv-sync-cover sv-sync-cover--empty', className)} aria-hidden="true">
        <Icon name="note" size={20} />
      </span>
    );
  }
  return <img className={joinClassNames('sv-sync-cover', className)} src={coverArtUrl} alt="" />;
}

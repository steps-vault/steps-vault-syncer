import type { ReactElement } from 'react';
import { ArrowReceptor } from '../icons/arrow-receptor';
import { APP_NAME } from '../shared/brand-names';

export interface UpdateBannerProps {
  /** For example "1.3". */
  version: string;
  onRestart: () => void;
  onLater: () => void;
}

/** Desktop only: sits on top of every screen until the player restarts or chooses Later. */
export function UpdateBanner({ version, onRestart, onLater }: UpdateBannerProps): ReactElement {
  return (
    <div className="sv-sync-update-banner" role="status">
      <ArrowReceptor direction="up" size={22} className="sv-sync-receptor--light-blue" />
      <span className="sv-sync-grow"><b>{APP_NAME} {version} is ready.</b> <span className="sv-sync-muted">Restarts after the current sync.</span></span>
      <button className="sv-sync-button sv-sync-button--small" type="button" onClick={onRestart}>Restart to update</button>
      <button className="sv-sync-link-button" type="button" onClick={onLater}>Later</button>
    </div>
  );
}

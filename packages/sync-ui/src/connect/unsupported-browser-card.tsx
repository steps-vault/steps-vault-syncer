import { useState, type ReactElement } from 'react';
import { ArrowReceptor } from '../icons/arrow-receptor';
import { Icon } from '../icons/icon';
import { SITE_NAME } from '../shared/brand-names';

export const SYNC_ADDRESS = `${SITE_NAME}/sync`;

export interface UnsupportedBrowserCardProps {
  desktopAppHref: string;
  onCopySyncAddress: () => void;
}

/** Firefox and Safari can't open folders for a web page, so we point to Edge (on every Windows PC) or the app. */
export function UnsupportedBrowserCard({ desktopAppHref, onCopySyncAddress }: UnsupportedBrowserCardProps): ReactElement {
  const [isShowingEdgeSteps, setIsShowingEdgeSteps] = useState(false);
  return (
    <section className="sv-sync-panel sv-sync-blocking-card" role="alert" aria-labelledby="sv-sync-unsupported-heading">
      <ArrowReceptor size={64} className="sv-sync-receptor--warning" />
      <h2 id="sv-sync-unsupported-heading" className="sv-sync-heading-1 sv-sync-heading-1--medium">Sync needs Chrome or Edge on a computer</h2>
      <p className="sv-sync-text sv-sync-text--medium">This browser can&apos;t open folders. Edge is already on every Windows PC, or get the desktop app.</p>
      <div className="sv-sync-row sv-sync-wrap sv-sync-center">
        <button className="sv-sync-button" type="button" aria-expanded={isShowingEdgeSteps} aria-controls="sv-sync-edge-steps" onClick={() => { setIsShowingEdgeSteps(!isShowingEdgeSteps); }}>
          <Icon name="external" />Open in Edge
        </button>
        <a className="sv-sync-button sv-sync-button--ghost" href={desktopAppHref}><Icon name="download" />Get the desktop app</a>
      </div>
      {isShowingEdgeSteps && (
        <div id="sv-sync-edge-steps" className="sv-sync-note sv-sync-align-text-start">
          <Icon name="info" />
          <div className="sv-sync-stack-small">
            <b className="sv-sync-strong">How to open this page in Edge</b>
            <ol className="sv-sync-numbered-steps sv-sync-numbered-steps--small">
              <li><span>Copy this address: <span className="sv-sync-mono sv-sync-strong">{SYNC_ADDRESS}</span> <button className="sv-sync-link-button sv-sync-link-button--small" type="button" onClick={onCopySyncAddress}><Icon name="copy" size={14} />Copy</button></span></li>
              <li><span>Open <b className="sv-sync-strong">Microsoft Edge</b> from the Start menu.</span></li>
              <li><span>Paste it in the address bar and press Enter. Sign in if it asks.</span></li>
            </ol>
          </div>
        </div>
      )}
      <span className="sv-sync-small sv-sync-muted">Phones and tablets show sync status only. Syncing needs a computer.</span>
    </section>
  );
}

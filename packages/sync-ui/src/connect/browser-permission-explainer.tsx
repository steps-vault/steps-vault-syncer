import type { ReactElement } from 'react';
import { ArrowReceptor } from '../icons/arrow-receptor';
import { Icon } from '../icons/icon';
import { SITE_NAME } from '../shared/brand-names';

/** Website only: the browser asks before letting the page edit the Songs folder, so we show that prompt first. */
export function BrowserPermissionExplainer({ desktopAppHref }: { desktopAppHref: string }): ReactElement {
  return (
    <section className="sv-sync-permission-explainer" aria-labelledby="sv-sync-permission-heading">
      <div className="sv-sync-stack">
        <h3 id="sv-sync-permission-heading" className="sv-sync-heading-2 sv-sync-heading-2--small">Then click Allow</h3>
        <p className="sv-sync-text sv-sync-text--medium">Your browser asks again after a restart.</p>
        <span className="sv-sync-text sv-sync-text--medium"><a className="sv-sync-link" href={desktopAppHref}>Get the desktop app</a> to sync in the background.</span>
      </div>
      <div className="sv-sync-browser-prompt-frame" role="img" aria-label="Example of the browser asking for permission, with the Allow button highlighted">
        <div className="sv-sync-browser-prompt" aria-hidden="true">
          <div className="sv-sync-browser-prompt-bar"><Icon name="lock" size={11} strokeWidth={2.4} />{SITE_NAME}</div>
          <div className="sv-sync-browser-prompt-title"><span className="sv-sync-browser-prompt-logo"><ArrowReceptor size={16} /></span>Let {SITE_NAME} edit files?</div>
          <div className="sv-sync-browser-prompt-body">{SITE_NAME} will be able to edit files in <b>Songs</b> until you close all tabs for this site.</div>
          <div className="sv-sync-browser-prompt-buttons"><span>Cancel</span><span className="sv-sync-browser-prompt-allow">Allow</span></div>
          <span className="sv-sync-browser-prompt-pointer"><ArrowReceptor direction="up" size={24} />CLICK ALLOW</span>
        </div>
      </div>
    </section>
  );
}

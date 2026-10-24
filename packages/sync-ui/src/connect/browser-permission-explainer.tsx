import type { ReactElement } from 'react';
import { ArrowReceptor } from '../icons/arrow-receptor';
import { Icon } from '../icons/icon';
import { Note } from '../shared/small-parts';

/** Website only: the browser asks before letting the page edit the Songs folder, so we show that prompt first. */
export function BrowserPermissionExplainer({ desktopAppHref }: { desktopAppHref: string }): ReactElement {
  return (
    <section className="sv-sync-permission-explainer" aria-labelledby="sv-sync-permission-heading">
      <div className="sv-sync-stack">
        <h3 id="sv-sync-permission-heading" className="sv-sync-heading-2">Your browser will ask first</h3>
        <ol className="sv-sync-numbered-steps">
          <li><span>Click <b className="sv-sync-strong">Choose my Songs folder</b> and pick the Songs folder.</span></li>
          <li><span>Your browser asks if stepsvault.com may edit files there. Click <b className="sv-sync-good-text">Allow</b>.</span></li>
          <li><span>That&apos;s it. We only add, update or remove the songs StepsVault added.</span></li>
        </ol>
        <Note>Your browser will ask again if you close it — click <b className="sv-sync-strong">Allow</b>.</Note>
        <span className="sv-sync-small sv-sync-muted">Rather not keep a tab open? <a className="sv-sync-link" href={desktopAppHref}>Get the desktop app</a> — it can sync in the background.</span>
      </div>
      <div className="sv-sync-browser-prompt-frame" role="img" aria-label="Example of the browser asking for permission, with the Allow button highlighted">
        <div className="sv-sync-browser-prompt" aria-hidden="true">
          <div className="sv-sync-browser-prompt-bar"><Icon name="lock" size={11} strokeWidth={2.4} />stepsvault.com</div>
          <div className="sv-sync-browser-prompt-title"><span className="sv-sync-browser-prompt-logo"><ArrowReceptor size={16} /></span>Let stepsvault.com edit files?</div>
          <div className="sv-sync-browser-prompt-body">stepsvault.com will be able to edit files in <b>Songs</b> until you close all tabs for this site.</div>
          <div className="sv-sync-browser-prompt-buttons"><span>Cancel</span><span className="sv-sync-browser-prompt-allow">Allow</span></div>
          <span className="sv-sync-browser-prompt-pointer"><ArrowReceptor direction="up" size={24} />CLICK ALLOW</span>
        </div>
      </div>
    </section>
  );
}

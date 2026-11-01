import type { ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { APP_NAME, SITE_NAME } from '../shared/brand-names';
import { Note } from '../shared/small-parts';
import type { BrowserPairingView } from '../sync-ui-types';

export interface PlayOnWebsiteProps {
  pairing: BrowserPairingView;
  /** The website's Play page, where the player types the code. */
  playPageHref: string;
  onStartPairing: () => void;
  onForgetPairedBrowsers: () => void;
}

/** Desktop only: pair a browser once, then the website plays the songs the player's generators made, from this computer. */
export function PlayOnWebsite({ pairing, playPageHref, onStartPairing, onForgetPairedBrowsers }: PlayOnWebsiteProps): ReactElement {
  return (
    <section className="sv-sync-stack" aria-labelledby="sv-sync-play-on-website-heading">
      <div className="sv-sync-stack-tiny">
        <h2 id="sv-sync-play-on-website-heading" className="sv-sync-heading-2">Play on the website</h2>
        <span className="sv-sync-text sv-sync-small">
          Play the songs your generators made on {SITE_NAME}, in a browser on this computer. They stay here: the website reads them from {APP_NAME} while it runs, and never uploads them.
        </span>
      </div>
      {pairing.bridgeAddress === null ? <BridgeClosedNote /> : <PairingStep pairing={pairing} playPageHref={playPageHref} onStartPairing={onStartPairing} />}
      {pairing.pairedBrowserCount > 0 && (
        <div className="sv-sync-row sv-sync-wrap">
          <span className="sv-sync-small sv-sync-muted">{pairing.pairedBrowserCount === 1 ? '1 browser is paired.' : `${String(pairing.pairedBrowserCount)} browsers are paired.`}</span>
          <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={onForgetPairedBrowsers}>Forget paired browsers</button>
        </div>
      )}
    </section>
  );
}

function BridgeClosedNote(): ReactElement {
  return <Note iconName="warning">{APP_NAME} couldn&apos;t open its address for the website: other programs use ports 47821 to 47823. Close them, then restart {APP_NAME}.</Note>;
}

function PairingStep({ pairing, playPageHref, onStartPairing }: { pairing: BrowserPairingView; playPageHref: string; onStartPairing: () => void }): ReactElement {
  const playPageLink = <a href={playPageHref} target="_blank" rel="noreferrer">the Play page</a>;
  if (pairing.code === null) {
    return (
      <div className="sv-sync-row sv-sync-wrap">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={onStartPairing}><Icon name="globe" />Pair a browser</button>
        <span className="sv-sync-small sv-sync-muted">You get a code to type on {playPageLink}, under “Your songs on this PC”.</span>
      </div>
    );
  }
  return (
    <div className="sv-sync-stack-small" role="status">
      <span className="sv-sync-text sv-sync-small">Type this code on {playPageLink}, under “Your songs on this PC”. It works once, for 5 minutes.</span>
      <div className="sv-sync-big-code sv-sync-tabular" aria-label={`Pairing code ${pairing.code.replace('-', '').split('').join(' ')}`}>{pairing.code}</div>
      <button className="sv-sync-link-button" type="button" onClick={onStartPairing}>Get a new code</button>
    </div>
  );
}

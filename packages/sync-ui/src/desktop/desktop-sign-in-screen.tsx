import type { ReactElement } from 'react';
import { ArrowReceptor } from '../icons/arrow-receptor';
import { Icon } from '../icons/icon';
import { SITE_NAME } from '../shared/brand-names';
import { JudgmentText } from '../progress/judgment-flash';
import type { SignInState } from '../sync-ui-types';

const LINK_PAGE_ADDRESS = `${SITE_NAME}/link`;

export interface DesktopSignInScreenProps {
  signIn: SignInState;
  onOpenLinkPage: () => void;
  onGetNewCode: () => void;
  onConnectGame: () => void;
}

/** "K7Q4ZP" reads as "K7Q·4ZP", the way the six boxes on the website are grouped. */
export function formatLinkCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)}·${code.slice(3)}` : code;
}

/** Screen 7: the app shows a short code; the player types it on the website, and the app signs in by itself. */
export function DesktopSignInScreen({ signIn, onOpenLinkPage, onGetNewCode, onConnectGame }: DesktopSignInScreenProps): ReactElement {
  if (signIn.kind === 'signed-in') {
    return (
      <section className="sv-sync-sign-in" aria-labelledby="sv-sync-sign-in-heading">
        <JudgmentText word="GREAT" />
        <h2 id="sv-sync-sign-in-heading" className="sv-sync-heading-2">You&apos;re signed in as {signIn.playerName}</h2>
        <p className="sv-sync-text sv-sync-small">{signIn.computerName} is linked. Next: connect your game.</p>
        <button className="sv-sync-button sv-sync-button--go" type="button" onClick={onConnectGame}>Connect your game<Icon name="chevron" strokeWidth={2.6} /></button>
      </section>
    );
  }
  return (
    <section className="sv-sync-sign-in" aria-labelledby="sv-sync-sign-in-heading">
      <ArrowReceptor direction="up" size={64} className="sv-sync-receptor--logo" />
      <h2 id="sv-sync-sign-in-heading" className="sv-sync-heading-2">Sign in to your library</h2>
      <p className="sv-sync-text sv-sync-small">Type this code on <b className="sv-sync-strong">{LINK_PAGE_ADDRESS}</b></p>
      <div className="sv-sync-big-code sv-sync-tabular" aria-label={`Code ${signIn.code.split('').join(' ')}`}>{formatLinkCode(signIn.code)}</div>
      <div className="sv-sync-small sv-sync-tabular sv-sync-warning-text">Expires in {signIn.expiresInText}</div>
      <button className="sv-sync-button" type="button" onClick={onOpenLinkPage}><Icon name="external" />Open {LINK_PAGE_ADDRESS}</button>
      <div className="sv-sync-waiting-line" role="status"><span className="sv-sync-spin sv-sync-spin-box"><ArrowReceptor direction="up" size={18} /></span>Waiting for the code…</div>
      <div className="sv-sync-computer-box">This computer: <b className="sv-sync-strong">{signIn.computerName}</b> · {signIn.systemName}<br />No password is stored on this computer.</div>
      <button className="sv-sync-link-button" type="button" onClick={onGetNewCode}>Get a new code</button>
    </section>
  );
}

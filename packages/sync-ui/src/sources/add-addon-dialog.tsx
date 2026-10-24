import { useState, type FormEvent, type ReactElement } from 'react';
import { SyncDialog } from '../dialog/sync-dialog';
import { Icon } from '../icons/icon';
import { Note } from '../shared/small-parts';
import type { AddonInstallPreview, AddonLookupResult } from '../sync-ui-types';
import { getAddonInitials } from './addon-card';

/** The only song facts an addon ever receives (plan.md, "Addons see song facts only"). */
export const ADDON_VISIBLE_SONG_FACTS = 'title, artist, album, genre, length, and the song’s YouTube link.';
export const ADDON_NEVER_SEES = 'your account, or anything else on your computer.';
const TRUST_NOTE = 'Addons are made by other people, not StepsVault. Only install ones you trust.';
const ADDON_ADDRESS_PATTERN = /^https:\/\/\S+\.\S+/;
const LOOKUP_FAILED_MESSAGE = 'We couldn’t reach that addon. Check the address with whoever made it, then try again.';

export function isAddonAddress(address: string): boolean {
  return ADDON_ADDRESS_PATTERN.test(address.trim());
}

export interface AddAddonDialogProps {
  /** Reads the addon's own description from its address. The dialog only shows the answer. */
  onLookUpAddon: (address: string) => Promise<AddonLookupResult>;
  onInstall: (addon: AddonInstallPreview) => void;
  onClose: () => void;
}

type DialogStep = { kind: 'address' } | { kind: 'consent'; addon: AddonInstallPreview };

/** Step 1: the address. Step 2: exactly what the addon will see, before anything is installed. */
export function AddAddonDialog({ onLookUpAddon, onInstall, onClose }: AddAddonDialogProps): ReactElement {
  const [step, setStep] = useState<DialogStep>({ kind: 'address' });
  return (
    <SyncDialog titleId="sv-sync-add-addon-title" onClose={onClose} focusKey={step.kind}>
      {step.kind === 'address'
        ? <AddressStep onLookUpAddon={onLookUpAddon} onFound={(addon) => { setStep({ kind: 'consent', addon }); }} onCancel={onClose} />
        : <ConsentStep addon={step.addon} onInstall={() => { onInstall(step.addon); }} onCancel={onClose} />}
    </SyncDialog>
  );
}

interface AddressStepProps {
  onLookUpAddon: (address: string) => Promise<AddonLookupResult>;
  onFound: (addon: AddonInstallPreview) => void;
  onCancel: () => void;
}

function AddressStep({ onLookUpAddon, onFound, onCancel }: AddressStepProps): ReactElement {
  const [address, setAddress] = useState('https://');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const lookUp = async (): Promise<void> => {
    if (!isAddonAddress(address)) {
      setErrorMessage('That doesn’t look like a web address. It should start with https://');
      return;
    }
    setIsLookingUp(true);
    const result = await onLookUpAddon(address.trim()).catch((): AddonLookupResult => ({ kind: 'failed', message: LOOKUP_FAILED_MESSAGE }));
    setIsLookingUp(false);
    if (result.kind === 'failed') setErrorMessage(result.message);
    else onFound(result.addon);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void lookUp();
  };
  return (
    <form className="sv-sync-dialog-form" onSubmit={handleSubmit} noValidate>
      <div className="sv-sync-eyebrow">Add addon · step 1 of 2</div>
      <h2 id="sv-sync-add-addon-title" className="sv-sync-heading-2">Add an addon</h2>
      <p className="sv-sync-text sv-sync-small">Paste the addon&apos;s address. Whoever made it can give it to you.</p>
      <label className="sv-sync-field-label">
        Addon address (URL)
        <input className="sv-sync-field sv-sync-mono" type="url" value={address} placeholder="https://" data-autofocus aria-invalid={errorMessage !== null} aria-describedby={errorMessage === null ? undefined : 'sv-sync-addon-address-error'} onChange={(event) => { setAddress(event.target.value); setErrorMessage(null); }} />
      </label>
      {errorMessage !== null && <div id="sv-sync-addon-address-error" className="sv-sync-small sv-sync-error-text sv-sync-row" role="alert"><Icon name="warning" size={14} />{errorMessage}</div>}
      <Note className="sv-sync-small">{TRUST_NOTE}</Note>
      <div className="sv-sync-dialog-buttons">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={onCancel}>Cancel</button>
        <button className="sv-sync-button" type="submit" disabled={isLookingUp}>{isLookingUp ? 'Checking…' : 'Continue'}</button>
      </div>
    </form>
  );
}

function ConsentStep({ addon, onInstall, onCancel }: { addon: AddonInstallPreview; onInstall: () => void; onCancel: () => void }): ReactElement {
  return (
    <>
      <div className="sv-sync-eyebrow">Add addon · step 2 of 2</div>
      <h2 id="sv-sync-add-addon-title" className="sv-sync-heading-2">Install “{addon.name}”?</h2>
      <div className="sv-sync-addon-who">
        <span className="sv-sync-addon-icon" aria-hidden="true">{getAddonInitials(addon.name)}</span>
        <div>
          <b className="sv-sync-strong">{addon.name}</b> <span className="sv-sync-small sv-sync-muted">v{addon.version}</span>
          <div className="sv-sync-small sv-sync-muted">by {addon.author} · <span className="sv-sync-mono">{addon.address}</span></div>
        </div>
      </div>
      <div className="sv-sync-consent" role="group" aria-label="What this addon will see">
        <b>This addon will see, for the songs you sync:</b>
        <ul><li className="sv-sync-consent-yes"><Icon name="check" strokeWidth={2.8} /><span>{ADDON_VISIBLE_SONG_FACTS}</span></li></ul>
        <b>It never sees:</b>
        <ul><li className="sv-sync-consent-no"><Icon name="close" strokeWidth={2.8} /><span>{ADDON_NEVER_SEES}</span></li></ul>
      </div>
      <Note className="sv-sync-small">{TRUST_NOTE}</Note>
      <div className="sv-sync-dialog-buttons">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={onCancel}>Cancel</button>
        <button className="sv-sync-button sv-sync-button--go" type="button" onClick={onInstall}>Install</button>
      </div>
    </>
  );
}

import { useState, type FormEvent, type ReactElement } from 'react';
import { SyncDialog } from '../dialog/sync-dialog';
import { DialogHeading } from '../dialog/dialog-heading';
import { Icon } from '../icons/icon';
import { SITE_NAME } from '../shared/brand-names';
import { Note } from '../shared/small-parts';
import type { AddonInstallPreview, AddonLookupResult, AddonOptionView, ServiceLookupRequest } from '../sync-ui-types';
import { getAddonInitials } from './addon-card';
import { AddonOptionFields } from './addon-option-fields';
import { AddressError, EMPTY_SERVICE_ADDRESS_DRAFT, getStartCommandOrNull, isServiceAddress, isThisComputerAddress, StartCommandField, StartCommandNote, type ServiceAddressDraft } from './start-command-field';

/** The only song facts an addon ever receives (plan.md, "Addons see song facts only"). */
export const ADDON_VISIBLE_SONG_FACTS = 'title, artist, album, genre, length, and the song’s YouTube link.';
export const ADDON_NEVER_SEES = 'your account, or anything else on your computer.';
/** What a song source also sees (addons.md, "Song sources"). */
export const SONG_SOURCE_SEES = 'what you type in its tab in Make a song.';
export const ADDON_TRUST_NOTE = `Made by other people, not ${SITE_NAME}. Only install ones you trust.`;
const LOOKUP_FAILED_MESSAGE = 'We couldn’t reach that addon. Check the address with whoever made it, then try again.';

/** https, or http://127.0.0.1 and http://localhost for an addon on this computer. */
export function isAddonAddress(address: string): boolean {
  return isServiceAddress(address);
}

export interface AddAddonDialogProps {
  /** Reads the addon's own description from its address. The dialog only shows the answer. */
  onLookUpAddon: (request: ServiceLookupRequest) => Promise<AddonLookupResult>;
  /** Desktop only: offer a start command for an addon on this computer. */
  canUseStartCommand?: boolean;
  /** Gets the preview with the options the player picked on the consent step. */
  onInstall: (addon: AddonInstallPreview) => void;
  onClose: () => void;
}

type DialogStep = { kind: 'address' } | { kind: 'consent'; addon: AddonInstallPreview };

/** Step 1: the address. Step 2: exactly what the addon will see, before anything is installed. */
export function AddAddonDialog({ onLookUpAddon, canUseStartCommand = false, onInstall, onClose }: AddAddonDialogProps): ReactElement {
  const [step, setStep] = useState<DialogStep>({ kind: 'address' });
  const [draft, setDraft] = useState<ServiceAddressDraft>(EMPTY_SERVICE_ADDRESS_DRAFT);
  return (
    <SyncDialog titleId="sv-sync-add-addon-title" onClose={onClose} focusKey={step.kind}>
      {step.kind === 'address'
        ? <AddressStep onLookUpAddon={onLookUpAddon} canUseStartCommand={canUseStartCommand} draft={draft} onChangeDraft={setDraft} onFound={(addon) => { setStep({ kind: 'consent', addon }); }} onCancel={onClose} />
        : <ConsentStep addon={step.addon} onInstall={onInstall} onBack={() => { setStep({ kind: 'address' }); }} />}
    </SyncDialog>
  );
}

interface AddressStepProps {
  onLookUpAddon: (request: ServiceLookupRequest) => Promise<AddonLookupResult>;
  canUseStartCommand: boolean;
  onFound: (addon: AddonInstallPreview) => void;
  draft: ServiceAddressDraft;
  onChangeDraft: (draft: ServiceAddressDraft) => void;
  onCancel: () => void;
}

function AddressStep({ onLookUpAddon, canUseStartCommand, draft, onChangeDraft, onFound, onCancel }: AddressStepProps): ReactElement {
  const { address, startCommandText } = draft;
  const setAddress = (nextAddress: string): void => { onChangeDraft({ ...draft, address: nextAddress }); };
  const setStartCommandText = (nextText: string): void => { onChangeDraft({ ...draft, startCommandText: nextText }); };
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const isOnThisComputer = canUseStartCommand && isThisComputerAddress(address);
  const lookUp = async (): Promise<void> => {
    if (!isAddonAddress(address)) {
      setErrorMessage(canUseStartCommand ? 'Enter an address that starts with https:// or http://localhost' : 'Enter an address that starts with https://');
      return;
    }
    setIsLookingUp(true);
    const request = { address: address.trim(), startCommand: isOnThisComputer ? getStartCommandOrNull(startCommandText) : null };
    const result = await onLookUpAddon(request).catch((): AddonLookupResult => ({ kind: 'failed', message: LOOKUP_FAILED_MESSAGE }));
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
      <DialogHeading titleId="sv-sync-add-addon-title" title="Add an addon" stepText="Step 1 of 2" />
      <label className="sv-sync-field-label">
        Addon address
        <input className="sv-sync-field sv-sync-mono" type="url" value={address} placeholder={canUseStartCommand ? 'https:// or http://localhost' : 'https://'} data-autofocus aria-invalid={errorMessage !== null} aria-describedby={errorMessage === null ? undefined : 'sv-sync-addon-address-error'} onChange={(event) => { setAddress(event.target.value); setErrorMessage(null); }} />
      </label>
      {errorMessage !== null && <AddressError id="sv-sync-addon-address-error" message={errorMessage} />}
      {isOnThisComputer && <StartCommandField serviceName="addon" value={startCommandText} onChange={setStartCommandText} />}
      <Note className="sv-sync-small">{ADDON_TRUST_NOTE}</Note>
      <div className="sv-sync-dialog-buttons">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={onCancel}>Cancel</button>
        <button className="sv-sync-button" type="submit" disabled={isLookingUp}>{isLookingUp ? 'Checking…' : 'Continue'}</button>
      </div>
    </form>
  );
}

function ConsentStep({ addon, onInstall, onBack }: { addon: AddonInstallPreview; onInstall: (addon: AddonInstallPreview) => void; onBack: () => void }): ReactElement {
  const [options, setOptions] = useState<readonly AddonOptionView[]>(addon.options);
  const handleOptionChange = ({ optionId, value }: { optionId: string; value: string }): void => {
    setOptions((current) => current.map((option) => (option.optionId === optionId ? { ...option, value } : option)));
  };
  return (
    <>
      <DialogHeading titleId="sv-sync-add-addon-title" title={`Install “${addon.name}”?`} stepText="Step 2 of 2" />
      <div className="sv-sync-addon-who">
        <span className="sv-sync-addon-icon" aria-hidden="true">{getAddonInitials(addon.name)}</span>
        <div>
          <b className="sv-sync-strong">{addon.name}</b> <span className="sv-sync-small sv-sync-muted">v{addon.version} · by {addon.author}</span>
          <div className="sv-sync-row sv-sync-wrap">
            {addon.providesText !== undefined && addon.providesText !== '' && <span className="sv-sync-addon-provides">{addon.providesText}</span>}
            <span className="sv-sync-mono sv-sync-small sv-sync-break-all">{addon.address}</span>
          </div>
        </div>
      </div>
      <div className="sv-sync-consent" role="group" aria-label="What this addon will see">
        <b>This addon will see, for the songs you sync:</b>
        <ul>
          <li className="sv-sync-consent-yes"><Icon name="check" strokeWidth={2.8} /><span>{ADDON_VISIBLE_SONG_FACTS}</span></li>
          {addon.seesWhatYouType === true && <li className="sv-sync-consent-yes"><Icon name="check" strokeWidth={2.8} /><span>{SONG_SOURCE_SEES}</span></li>}
        </ul>
        <b>It never sees:</b>
        <ul><li className="sv-sync-consent-no"><Icon name="close" strokeWidth={2.8} /><span>{ADDON_NEVER_SEES}</span></li></ul>
      </div>
      {options.length > 0 && (
        <div className="sv-sync-addon-setup">
          <b>Choose how it works</b>
          <AddonOptionFields addonName={addon.name} options={options} onChange={handleOptionChange} />
        </div>
      )}
      {addon.startCommand && <StartCommandNote startCommand={addon.startCommand} />}
      <Note className="sv-sync-small">Only install addons you trust.</Note>
      <div className="sv-sync-dialog-buttons">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={onBack} data-autofocus>Back</button>
        <button className="sv-sync-button sv-sync-button--go" type="button" onClick={() => { onInstall({ ...addon, options }); }}>Install</button>
      </div>
    </>
  );
}

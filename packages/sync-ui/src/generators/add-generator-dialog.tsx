import { useState, type SubmitEvent, type ReactElement } from 'react';
import { SyncDialog } from '../dialog/sync-dialog';
import { DialogHeading } from '../dialog/dialog-heading';
import { Icon } from '../icons/icon';
import { SITE_NAME } from '../shared/brand-names';
import { Note } from '../shared/small-parts';
import { getAddonInitials } from '../sources/addon-card';
import { AddonOptionFields } from '../sources/addon-option-fields';
import { AddressError, EMPTY_SERVICE_ADDRESS_DRAFT, getStartCommandOrNull, isServiceAddress, isThisComputerAddress, StartCommandField, StartCommandNote, type ServiceAddressDraft } from '../sources/start-command-field';
import type { AddonOptionView, GeneratorInstallPreview, GeneratorLookupResult, ServiceLookupRequest } from '../sync-ui-types';
import { ServiceLocation } from './generator-card';

/** Everything a generator ever gets, for each song (generators.md, "What a generator gets"). */
export const GENERATOR_GETS = ['the music file you pick.', 'the song’s facts: title, artist, album, genre, length and YouTube link.', 'the difficulties you pick.'] as const;
export const GENERATOR_NEVER_GETS = 'your account, your tokens, or anything else on your computer.';
export const GENERATOR_TRUST_NOTE = `Made by other people, not ${SITE_NAME}. Only add ones you trust.`;
const LOOKUP_FAILED_MESSAGE = 'We couldn’t reach that generator. Check the address with whoever made it, then try again.';

/** The sentence the player agrees to before their music goes over the internet. */
export function MusicUploadWarning({ address }: { address: string }): ReactElement {
  return <div className="sv-sync-warning-box" role="note"><Icon name="warning" size={18} /><span>Your music file will be sent to <b className="sv-sync-mono">{address}</b>.</span></div>;
}

export interface AddGeneratorDialogProps {
  /** Reads the generator's own description from its address. The dialog only shows the answer. */
  onLookUpGenerator: (request: ServiceLookupRequest) => Promise<GeneratorLookupResult>;
  /** Desktop only: offer a start command for a generator on this computer. */
  canUseStartCommand: boolean;
  /** Gets the preview with the options the player picked; for an internet address, adding it is agreeing to send the music. */
  onAdd: (generator: GeneratorInstallPreview) => void;
  onClose: () => void;
}

type DialogStep = { kind: 'address' } | { kind: 'confirm'; generator: GeneratorInstallPreview };

/** Step 1: the address. Step 2: exactly what the generator gets, and where the music goes, before anything is added. */
export function AddGeneratorDialog({ onLookUpGenerator, canUseStartCommand, onAdd, onClose }: AddGeneratorDialogProps): ReactElement {
  const [step, setStep] = useState<DialogStep>({ kind: 'address' });
  const [draft, setDraft] = useState<ServiceAddressDraft>(EMPTY_SERVICE_ADDRESS_DRAFT);
  return (
    <SyncDialog titleId="sv-sync-add-generator-title" onClose={onClose} focusKey={step.kind}>
      {step.kind === 'address'
        ? <AddressStep onLookUpGenerator={onLookUpGenerator} canUseStartCommand={canUseStartCommand} draft={draft} onChangeDraft={setDraft} onFound={(generator) => { setStep({ kind: 'confirm', generator }); }} onCancel={onClose} />
        : <ConfirmStep generator={step.generator} onAdd={onAdd} onBack={() => { setStep({ kind: 'address' }); }} />}
    </SyncDialog>
  );
}

interface AddressStepProps {
  onLookUpGenerator: (request: ServiceLookupRequest) => Promise<GeneratorLookupResult>;
  canUseStartCommand: boolean;
  onFound: (generator: GeneratorInstallPreview) => void;
  draft: ServiceAddressDraft;
  onChangeDraft: (draft: ServiceAddressDraft) => void;
  onCancel: () => void;
}

function AddressStep({ onLookUpGenerator, canUseStartCommand, draft, onChangeDraft, onFound, onCancel }: AddressStepProps): ReactElement {
  const { address, startCommandText } = draft;
  const setAddress = (nextAddress: string): void => { onChangeDraft({ ...draft, address: nextAddress }); };
  const setStartCommandText = (nextText: string): void => { onChangeDraft({ ...draft, startCommandText: nextText }); };
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const isOnThisComputer = canUseStartCommand && isThisComputerAddress(address);
  const lookUp = async (): Promise<void> => {
    if (!isServiceAddress(address)) {
      setErrorMessage('Enter an address that starts with https:// or http://localhost');
      return;
    }
    setIsLookingUp(true);
    const request = { address: address.trim(), startCommand: isOnThisComputer ? getStartCommandOrNull(startCommandText) : null };
    const result = await onLookUpGenerator(request).catch((): GeneratorLookupResult => ({ kind: 'failed', message: LOOKUP_FAILED_MESSAGE }));
    setIsLookingUp(false);
    if (result.kind === 'failed') setErrorMessage(result.message);
    else onFound(result.generator);
  };
  const handleSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void lookUp();
  };
  return (
    <form className="sv-sync-dialog-form" onSubmit={handleSubmit} noValidate>
      <DialogHeading titleId="sv-sync-add-generator-title" title="Add a generator" stepText="Step 1 of 2" />
      <label className="sv-sync-field-label">
        Generator address
        <input className="sv-sync-field sv-sync-mono" type="url" value={address} placeholder="https:// or http://localhost" data-autofocus aria-invalid={errorMessage !== null} aria-describedby={errorMessage === null ? undefined : 'sv-sync-generator-address-error'} onChange={(event) => { setAddress(event.target.value); setErrorMessage(null); }} />
      </label>
      {errorMessage !== null && <AddressError id="sv-sync-generator-address-error" message={errorMessage} />}
      {isOnThisComputer && <StartCommandField serviceName="generator" value={startCommandText} onChange={setStartCommandText} />}
      <div className="sv-sync-dialog-buttons">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={onCancel}>Cancel</button>
        <button className="sv-sync-button" type="submit" disabled={isLookingUp}>{isLookingUp ? 'Checking…' : 'Continue'}</button>
      </div>
    </form>
  );
}

function ConfirmStep({ generator, onAdd, onBack }: { generator: GeneratorInstallPreview; onAdd: (generator: GeneratorInstallPreview) => void; onBack: () => void }): ReactElement {
  const [options, setOptions] = useState<readonly AddonOptionView[]>(generator.options);
  const handleOptionChange = ({ optionId, value }: { optionId: string; value: string }): void => {
    setOptions((current) => current.map((option) => (option.optionId === optionId ? { ...option, value } : option)));
  };
  return (
    <>
      <DialogHeading titleId="sv-sync-add-generator-title" title={`Add “${generator.name}”?`} stepText="Step 2 of 2" />
      <div className="sv-sync-addon-who">
        <span className="sv-sync-addon-icon" aria-hidden="true">{getAddonInitials(generator.name)}</span>
        <div className="sv-sync-stack-small sv-sync-min-width-0">
          <div><b className="sv-sync-strong">{generator.name}</b> <span className="sv-sync-small sv-sync-muted">v{generator.version} · by {generator.author}</span></div>
          <ServiceLocation location={generator.location} />
        </div>
      </div>
      <div className="sv-sync-consent" role="group" aria-label="What this generator gets">
        <b>For each song you make with it, it will get:</b>
        <ul>{GENERATOR_GETS.map((item) => <li key={item} className="sv-sync-consent-yes"><Icon name="check" strokeWidth={2.8} /><span>{item}</span></li>)}</ul>
        <b>It never gets:</b>
        <ul><li className="sv-sync-consent-no"><Icon name="close" strokeWidth={2.8} /><span>{GENERATOR_NEVER_GETS}</span></li></ul>
      </div>
      {generator.location.kind === 'internet'
        ? <MusicUploadWarning address={generator.location.address} />
        : <Note iconName="computer">It runs on this computer. Your music file stays here.{generator.startCommand !== null && <> Sync starts it with <b className="sv-sync-mono sv-sync-break-all">{generator.startCommand}</b>, and stops it after 10 minutes without use.</>}</Note>}
      {generator.location.kind === 'internet' && generator.startCommand !== null && <StartCommandNote startCommand={generator.startCommand} />}
      {options.length > 0 && (
        <div className="sv-sync-addon-setup">
          <b>Choose how it works</b>
          <AddonOptionFields addonName={generator.name} options={options} onChange={handleOptionChange} />
        </div>
      )}
      <Note className="sv-sync-small">Songs it makes stay on this computer and never go to the library.</Note>
      <div className="sv-sync-dialog-buttons">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={onBack} data-autofocus>Back</button>
        <button className="sv-sync-button sv-sync-button--go" type="button" onClick={() => { onAdd({ ...generator, options }); }}>Add</button>
      </div>
    </>
  );
}

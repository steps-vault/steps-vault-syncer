import { useState, type FormEvent, type ReactElement } from 'react';
import { SyncDialog } from '../dialog/sync-dialog';
import { Icon } from '../icons/icon';
import { Note } from '../shared/small-parts';
import { getAddonInitials } from '../sources/addon-card';
import { AddonOptionFields } from '../sources/addon-option-fields';
import { AddressError, getStartCommandOrNull, isServiceAddress, isThisComputerAddress, StartCommandField, StartCommandNote } from '../sources/start-command-field';
import type { AddonOptionView, GeneratorInstallPreview, GeneratorLookupResult, ServiceLookupRequest } from '../sync-ui-types';
import { ServiceLocation } from './generator-card';

/** Everything a generator ever gets, for each song (generators.md, "What a generator gets"). */
export const GENERATOR_GETS = ['the music file you pick.', 'the song’s facts: title, artist and length.', 'the difficulties you pick.'] as const;
export const GENERATOR_NEVER_GETS = 'your account, your tokens, or anything else on your computer.';
export const GENERATOR_TRUST_NOTE = 'Generators are made by other people, not StepsVault. Only add ones you trust.';
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
  return (
    <SyncDialog titleId="sv-sync-add-generator-title" onClose={onClose} focusKey={step.kind}>
      {step.kind === 'address'
        ? <AddressStep onLookUpGenerator={onLookUpGenerator} canUseStartCommand={canUseStartCommand} onFound={(generator) => { setStep({ kind: 'confirm', generator }); }} onCancel={onClose} />
        : <ConfirmStep generator={step.generator} onAdd={onAdd} onCancel={onClose} />}
    </SyncDialog>
  );
}

interface AddressStepProps {
  onLookUpGenerator: (request: ServiceLookupRequest) => Promise<GeneratorLookupResult>;
  canUseStartCommand: boolean;
  onFound: (generator: GeneratorInstallPreview) => void;
  onCancel: () => void;
}

function AddressStep({ onLookUpGenerator, canUseStartCommand, onFound, onCancel }: AddressStepProps): ReactElement {
  const [address, setAddress] = useState('https://');
  const [startCommandText, setStartCommandText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const isOnThisComputer = canUseStartCommand && isThisComputerAddress(address);
  const lookUp = async (): Promise<void> => {
    if (!isServiceAddress(address)) {
      setErrorMessage('That doesn’t look like a generator address. It should start with https:// or http://localhost');
      return;
    }
    setIsLookingUp(true);
    const request = { address: address.trim(), startCommand: isOnThisComputer ? getStartCommandOrNull(startCommandText) : null };
    const result = await onLookUpGenerator(request).catch((): GeneratorLookupResult => ({ kind: 'failed', message: LOOKUP_FAILED_MESSAGE }));
    setIsLookingUp(false);
    if (result.kind === 'failed') setErrorMessage(result.message);
    else onFound(result.generator);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void lookUp();
  };
  return (
    <form className="sv-sync-dialog-form" onSubmit={handleSubmit} noValidate>
      <div className="sv-sync-eyebrow">Add a generator · step 1 of 2</div>
      <h2 id="sv-sync-add-generator-title" className="sv-sync-heading-2">Add a generator</h2>
      <p className="sv-sync-text sv-sync-small">Paste the generator&apos;s address. Whoever made it can give it to you.</p>
      <label className="sv-sync-field-label">
        Generator address
        <input className="sv-sync-field sv-sync-mono" type="url" value={address} placeholder="https:// or http://localhost" data-autofocus aria-invalid={errorMessage !== null} aria-describedby={errorMessage === null ? undefined : 'sv-sync-generator-address-error'} onChange={(event) => { setAddress(event.target.value); setErrorMessage(null); }} />
      </label>
      {errorMessage !== null && <AddressError id="sv-sync-generator-address-error" message={errorMessage} />}
      {isOnThisComputer && <StartCommandField serviceName="generator" value={startCommandText} onChange={setStartCommandText} />}
      <Note className="sv-sync-small">{GENERATOR_TRUST_NOTE}</Note>
      <div className="sv-sync-dialog-buttons">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={onCancel}>Cancel</button>
        <button className="sv-sync-button" type="submit" disabled={isLookingUp}>{isLookingUp ? 'Checking…' : 'Continue'}</button>
      </div>
    </form>
  );
}

function ConfirmStep({ generator, onAdd, onCancel }: { generator: GeneratorInstallPreview; onAdd: (generator: GeneratorInstallPreview) => void; onCancel: () => void }): ReactElement {
  const [options, setOptions] = useState<readonly AddonOptionView[]>(generator.options);
  const handleOptionChange = ({ optionId, value }: { optionId: string; value: string }): void => {
    setOptions((current) => current.map((option) => (option.optionId === optionId ? { ...option, value } : option)));
  };
  return (
    <>
      <div className="sv-sync-eyebrow">Add a generator · step 2 of 2</div>
      <h2 id="sv-sync-add-generator-title" className="sv-sync-heading-2">Add “{generator.name}”?</h2>
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
        : <Note iconName="computer">It runs on this computer. Your music file stays here.</Note>}
      {generator.startCommand !== null && <StartCommandNote startCommand={generator.startCommand} />}
      {options.length > 0 && (
        <div className="sv-sync-addon-setup">
          <b>Choose how it works</b>
          <span className="sv-sync-small sv-sync-muted">You can change this any time on the generator&apos;s card.</span>
          <AddonOptionFields addonName={generator.name} options={options} onChange={handleOptionChange} />
        </div>
      )}
      <Note className="sv-sync-small">Songs it makes stay on this computer and never go to the vault.</Note>
      <div className="sv-sync-dialog-buttons">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={onCancel} data-autofocus>Cancel</button>
        <button className="sv-sync-button sv-sync-button--go" type="button" onClick={() => { onAdd({ ...generator, options }); }}>Add</button>
      </div>
    </>
  );
}

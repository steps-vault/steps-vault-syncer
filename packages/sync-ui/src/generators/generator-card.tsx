import type { ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { SegmentedControl } from '../shared/small-parts';
import { getAddonInitials } from '../sources/addon-card';
import type { GeneratorView, ServiceLocationView, StepsVaultGeneratorView } from '../sync-ui-types';

export interface GeneratorCardProps {
  generator: GeneratorView;
  onRemove: (generatorId: string) => void;
  onSetOption: (request: { generatorId: string; optionId: string; value: string }) => void;
}

/** "On this computer" (the music stays here) or "On the internet:" and the address the music is sent to. */
export function ServiceLocation({ location }: { location: ServiceLocationView }): ReactElement {
  if (location.kind === 'this-computer') {
    return <span className="sv-sync-location"><span className="sv-sync-chip sv-sync-tone--synced"><Icon name="computer" size={14} strokeWidth={2.4} />On this computer</span></span>;
  }
  return (
    <span className="sv-sync-location">
      <span className="sv-sync-chip sv-sync-tone--needs-audio"><Icon name="globe" size={14} strokeWidth={2.4} />On the internet:</span>
      <span className="sv-sync-mono sv-sync-break-all">{location.address}</span>
    </span>
  );
}

/** A community generator: who made it, where it runs, and its options as choices. */
export function GeneratorCard({ generator, onRemove, onSetOption }: GeneratorCardProps): ReactElement {
  return (
    <article className="sv-sync-generator-card" aria-label={generator.name}>
      <div className="sv-sync-generator-top">
        <span className="sv-sync-addon-icon" aria-hidden="true">{getAddonInitials(generator.name)}</span>
        <div className="sv-sync-min-width-0">
          <div className="sv-sync-addon-name">
            {generator.name}
            <span className="sv-sync-version">v{generator.version}</span>
            {generator.isNew === true && <span className="sv-sync-badge sv-sync-badge--new">New</span>}
          </div>
          <div className="sv-sync-small sv-sync-subtle">by {generator.author}</div>
          <ServiceLocation location={generator.location} />
          {generator.startCommand !== null && <div className="sv-sync-small sv-sync-muted">Started with <span className="sv-sync-mono sv-sync-break-all">{generator.startCommand}</span></div>}
        </div>
        <button className="sv-sync-button sv-sync-button--danger sv-sync-button--small" type="button" onClick={() => { onRemove(generator.generatorId); }} aria-label={`Remove ${generator.name}`}>Remove</button>
      </div>
      {generator.options.length > 0 && (
        <div className="sv-sync-generator-options">
          {generator.options.map((option) => (
            <div key={option.optionId} className="sv-sync-stack-small">
              <span className="sv-sync-label sv-sync-label--plain">{option.label}</span>
              <SegmentedControl label={`${option.label} for ${generator.name}`} options={option.choices} selectedValue={option.value} onSelect={(value) => { onSetOption({ generatorId: generator.generatorId, optionId: option.optionId, value }); }} />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

/** StepsVault's own generator, always first: its songs go to the vault for everyone, for a token each. */
export function StepsVaultGeneratorCard({ generator }: { generator: StepsVaultGeneratorView }): ReactElement {
  return (
    <section className="sv-sync-panel sv-sync-generator-main" aria-labelledby="sv-sync-stepsvault-generator-heading">
      <span className="sv-sync-source-icon" aria-hidden="true"><Icon name="sparkle" size={24} /></span>
      <div className="sv-sync-stack-small sv-sync-min-width-0">
        <div className="sv-sync-addon-name">
          <h2 id="sv-sync-stepsvault-generator-heading" className="sv-sync-heading-2 sv-sync-heading-2--small">StepsVault generator</h2>
          <span className="sv-sync-badge sv-sync-badge--default">Default</span>
        </div>
        <p className="sv-sync-text">Songs go to the vault for everyone. Each song uses 1 token.</p>
        <span className="sv-sync-small sv-sync-subtle">by StepsVault · used when you don&apos;t pick another one</span>
        {generator.difficulties === null && <span className="sv-sync-small sv-sync-warning-text">StepsVault can&apos;t be reached right now. Check your internet connection.</span>}
      </div>
      <div className="sv-sync-tokens">
        {generator.tokenCount !== null && <span className="sv-sync-token-count" aria-label={`You have ${String(generator.tokenCount)} tokens`}><b>{generator.tokenCount}</b><small>TOKENS</small></span>}
        <a className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" href={generator.tokensHref} target="_blank" rel="noreferrer">Buy tokens</a>
      </div>
    </section>
  );
}

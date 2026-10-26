import type { ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { joinClassNames } from '../shared/class-names';
import { ToggleSwitch } from '../shared/small-parts';
import type { AddonView } from '../sync-ui-types';
import { AddonOptionFields } from './addon-option-fields';

export interface AddonCardProps {
  addon: AddonView;
  onToggle: (request: { addonId: string; isEnabled: boolean }) => void;
  onRemove: (addonId: string) => void;
  onSetOption: (request: { addonId: string; optionId: string; value: string }) => void;
}

export function getAddonInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word.slice(0, 1).toUpperCase()).join('');
}

/** An offline addon shows here as a calm note: songs keep their audio and only new ones wait. */
export function AddonCard({ addon, onToggle, onRemove, onSetOption }: AddonCardProps): ReactElement {
  const isNotAnswering = addon.isEnabled && addon.health.kind === 'not-answering';
  return (
    <article className={joinClassNames('sv-sync-addon-card', !addon.isEnabled && 'sv-sync-addon-card--off', isNotAnswering && 'sv-sync-addon-card--not-answering')} aria-label={addon.name}>
      <span className="sv-sync-addon-icon" aria-hidden="true">{getAddonInitials(addon.name)}</span>
      <div className="sv-sync-min-width-0">
        <div className="sv-sync-addon-name">
          {addon.name}
          <span className="sv-sync-version">v{addon.version}</span>
          <span className="sv-sync-addon-provides">{addon.providesText}</span>
          {addon.isNew === true && <span className="sv-sync-badge sv-sync-badge--new">New</span>}
        </div>
        <div className="sv-sync-small sv-sync-subtle">by {addon.author}</div>
        <AddonState addon={addon} />
        <AddonOptionFields addonName={addon.name} options={addon.options} onChange={({ optionId, value }) => { onSetOption({ addonId: addon.addonId, optionId, value }); }} />
      </div>
      <div className="sv-sync-addon-controls">
        <span className="sv-sync-row sv-sync-small">
          <ToggleSwitch isOn={addon.isEnabled} label={`Use ${addon.name}`} onToggle={(isEnabled) => { onToggle({ addonId: addon.addonId, isEnabled }); }} />
          {addon.isEnabled ? 'On' : 'Off'}
        </span>
        <button className="sv-sync-button sv-sync-button--danger sv-sync-button--small" type="button" onClick={() => { onRemove(addon.addonId); }} aria-label={`Remove ${addon.name}`}>Remove</button>
      </div>
    </article>
  );
}

function AddonState({ addon }: { addon: AddonView }): ReactElement {
  if (!addon.isEnabled) {
    return <div className="sv-sync-addon-state sv-sync-subtle"><Icon name="none" size={14} strokeWidth={2.4} />Off · songs keep their audio</div>;
  }
  if (addon.isAudioSource === false) {
    return <div className="sv-sync-addon-state sv-sync-subtle"><Icon name="sparkle" size={14} strokeWidth={2.4} />Not an audio source. It suggests new songs to make.</div>;
  }
  if (addon.health.kind === 'not-answering') {
    return <div className="sv-sync-addon-state sv-sync-warning-text"><Icon name="note" size={14} strokeWidth={2.4} />{addon.health.note}</div>;
  }
  return <div className="sv-sync-addon-state sv-sync-good-text"><Icon name="check" size={14} strokeWidth={2.4} />{addon.health.note}</div>;
}

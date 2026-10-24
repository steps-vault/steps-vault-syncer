import type { ReactElement } from 'react';
import type { AddonOptionView } from '../sync-ui-types';

export interface AddonOptionFieldsProps {
  addonName: string;
  options: readonly AddonOptionView[];
  onChange: (request: { optionId: string; value: string }) => void;
}

/** An addon's options as plain labelled selects: the same on the consent step and on the addon's card. */
export function AddonOptionFields({ addonName, options, onChange }: AddonOptionFieldsProps): ReactElement | null {
  if (options.length === 0) return null;
  return (
    <div className="sv-sync-addon-options" role="group" aria-label={`${addonName} options`}>
      {options.map((option) => (
        <label key={option.optionId} className="sv-sync-addon-option">
          {option.label}
          <select className="sv-sync-field" value={option.value} onChange={(event) => { onChange({ optionId: option.optionId, value: event.target.value }); }}>
            {option.choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

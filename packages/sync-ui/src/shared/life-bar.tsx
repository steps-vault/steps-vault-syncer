import type { ReactElement } from 'react';

export interface LifeBarProps {
  label: string;
  value: number;
  maximum: number;
  valueText?: string;
}

/** A progress bar drawn like the game's life bar. */
export function LifeBar({ label, value, maximum, valueText }: LifeBarProps): ReactElement {
  const percent = maximum > 0 ? Math.min(100, Math.max(0, (value / maximum) * 100)) : 0;
  return (
    <div className="sv-sync-life-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={value} aria-valuetext={valueText}>
      <span style={{ width: `${String(percent)}%` }} />
    </div>
  );
}

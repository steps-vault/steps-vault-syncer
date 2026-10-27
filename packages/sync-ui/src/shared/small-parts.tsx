import type { ReactElement, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/icon';
import { joinClassNames } from './class-names';

/** Says calmly, every time, that Sync never touches the player's own folders. */
export function LockedBadge(): ReactElement {
  return (
    <span className="sv-sync-lock" title="Yours — never touched">
      <Icon name="lock" size={12} strokeWidth={2.6} />
      <span className="sv-sync-visually-hidden">Yours — never touched</span>
    </span>
  );
}

export interface InfoToggleButtonProps {
  /** Says what the hidden text is about, for example "How matching works". */
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  controlsId: string;
}

/** The small "?" next to a heading: details stay one press away instead of filling the screen. */
export function InfoToggleButton({ label, isOpen, onToggle, controlsId }: InfoToggleButtonProps): ReactElement {
  return (
    <button className="sv-sync-info-button" type="button" aria-expanded={isOpen} aria-controls={controlsId} aria-label={label} title={label} onClick={onToggle}>
      <Icon name="info" size={14} strokeWidth={2.4} />
    </button>
  );
}

/** The text an InfoToggleButton opens. */
export function InfoPanel({ id, children }: { id: string; children: ReactNode }): ReactElement {
  return <p id={id} className="sv-sync-info-panel">{children}</p>;
}

export function Note({ iconName = 'info', className, children }: { iconName?: IconName; className?: string; children: ReactNode }): ReactElement {
  return (
    <div className={joinClassNames('sv-sync-note', className)}>
      <Icon name={iconName} />
      <span>{children}</span>
    </div>
  );
}

export interface ToggleSwitchProps {
  isOn: boolean;
  onToggle: (isOn: boolean) => void;
  label?: string;
  labelledById?: string;
}

export function ToggleSwitch({ isOn, onToggle, label, labelledById }: ToggleSwitchProps): ReactElement {
  return <button className="sv-sync-switch" type="button" role="switch" aria-checked={isOn} aria-label={label} aria-labelledby={labelledById} onClick={() => { onToggle(!isOn); }} />;
}

export interface SegmentedOption<Value extends string> {
  value: Value;
  label: string;
}

export interface SegmentedControlProps<Value extends string> {
  label: string;
  options: readonly SegmentedOption<Value>[];
  selectedValue: Value;
  onSelect: (value: Value) => void;
}

/** A row of toggle buttons where exactly one is pressed, like the game's option rows. */
export function SegmentedControl<Value extends string>({ label, options, selectedValue, onSelect }: SegmentedControlProps<Value>): ReactElement {
  return (
    <div className="sv-sync-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === selectedValue} onClick={() => { onSelect(option.value); }}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

const SETUP_STEP_NAMES = ['Connect your game', 'Check the folder', 'Sync'] as const;

/** The three first-run steps; earlier steps show as done. */
export function SetupSteps({ currentStepIndex }: { currentStepIndex: number }): ReactElement {
  return (
    <ol className="sv-sync-setup-steps" aria-label="Setup steps">
      {SETUP_STEP_NAMES.map((stepName, index) => (
        <li key={stepName} className={joinClassNames(index === currentStepIndex && 'sv-sync-setup-step--current', index < currentStepIndex && 'sv-sync-setup-step--done')} aria-current={index === currentStepIndex ? 'step' : undefined}>
          <i aria-hidden="true">{index + 1}</i>
          {stepName}
        </li>
      ))}
    </ol>
  );
}

import type { ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { Note } from '../shared/small-parts';

const WEB_ADDRESS_PATTERN = /^https:\/\/\S+\.\S+/;
const THIS_COMPUTER_ADDRESS_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?(\/\S*)?$/;

/** An addon or generator address: https, or http on this computer (the protocol's only exception). */
export function isServiceAddress(address: string): boolean {
  const trimmedAddress = address.trim();
  return WEB_ADDRESS_PATTERN.test(trimmedAddress) || isThisComputerAddress(trimmedAddress);
}

/** A program on the player's own computer, which the desktop app can start with the player's command. */
export function isThisComputerAddress(address: string): boolean {
  return THIS_COMPUTER_ADDRESS_PATTERN.test(address.trim());
}

/** The command typed, or null when the field is empty, so an empty field never means "run nothing". */
export function getStartCommandOrNull(text: string): string | null {
  const command = text.trim();
  return command === '' ? null : command;
}

export interface StartCommandFieldProps {
  serviceName: 'addon' | 'generator';
  value: string;
  onChange: (value: string) => void;
}

/** Desktop only, for an address on this computer: the program's start command, run exactly as typed. */
export function StartCommandField({ serviceName, value, onChange }: StartCommandFieldProps): ReactElement {
  return (
    <div className="sv-sync-stack-tiny">
      <label className="sv-sync-field-label">
        Start command (optional)
        <input className="sv-sync-field sv-sync-mono" type="text" value={value} placeholder="C:/addons/my-program/start.cmd" spellCheck={false} onChange={(event) => { onChange(event.target.value); }} />
      </label>
      <span className="sv-sync-small sv-sync-muted">
        For a program on this computer: Sync starts the {serviceName} when needed and stops it after 10 idle minutes. It runs exactly what you type.
      </span>
    </div>
  );
}

/** The confirm step's reminder of the command Sync will run. */
export function StartCommandNote({ startCommand }: { startCommand: string }): ReactElement {
  return (
    <Note iconName="computer" className="sv-sync-small">
      Sync starts it when needed with <b className="sv-sync-mono sv-sync-break-all">{startCommand}</b>, and stops it after 10 minutes without use.
    </Note>
  );
}

export function AddressError({ id, message }: { id: string; message: string }): ReactElement {
  return <div id={id} className="sv-sync-small sv-sync-error-text sv-sync-row" role="alert"><Icon name="warning" size={14} />{message}</div>;
}

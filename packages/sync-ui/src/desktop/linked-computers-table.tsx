import { useState, type ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { joinClassNames } from '../shared/class-names';
import type { LinkedComputerView } from '../sync-ui-types';

export interface LinkedComputersTableProps {
  computers: readonly LinkedComputerView[];
  /** Signs that computer out; its songs stay in its game. */
  onRemoveComputer: (computerId: string) => void;
}

/** Account settings on the website: every computer linked by code, each removable after a short confirm. */
export function LinkedComputersTable({ computers, onRemoveComputer }: LinkedComputersTableProps): ReactElement {
  const [confirmingComputerId, setConfirmingComputerId] = useState<string | null>(null);
  return (
    <div className="sv-sync-stack">
      <div className="sv-sync-panel sv-sync-table-panel">
        <table className="sv-sync-table">
          <caption className="sv-sync-visually-hidden">Your linked computers</caption>
          <thead>
            <tr><th scope="col">Computer</th><th scope="col">Status</th><th scope="col">Last sync</th><th scope="col">Game</th><th scope="col"><span className="sv-sync-visually-hidden">Actions</span></th></tr>
          </thead>
          <tbody>
            {computers.map((computer) => (
              <tr key={computer.computerId}>
                <td>
                  <div className="sv-sync-row">
                    <Icon name="computer" size={20} className="sv-sync-link-colour" />
                    <div><div className="sv-sync-strong sv-sync-semibold">{computer.computerName}</div><div className="sv-sync-small sv-sync-muted">{computer.systemText}</div></div>
                  </div>
                </td>
                <td><span className={joinClassNames('sv-sync-online', computer.isOnline && 'sv-sync-online--on')}><i aria-hidden="true" />{computer.isOnline ? 'Online' : 'Offline'}</span></td>
                <td className="sv-sync-tabular">{computer.lastSyncText}</td>
                <td className="sv-sync-small">{computer.gameName}</td>
                <td className="sv-sync-align-text-end">
                  {confirmingComputerId === computer.computerId
                    ? <RemoveConfirm computerName={computer.computerName} onRemove={() => { setConfirmingComputerId(null); onRemoveComputer(computer.computerId); }} onCancel={() => { setConfirmingComputerId(null); }} />
                    : <button className="sv-sync-button sv-sync-button--danger sv-sync-button--small" type="button" aria-label={`Remove ${computer.computerName}`} onClick={() => { setConfirmingComputerId(computer.computerId); }}>Remove</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="sv-sync-small sv-sync-muted">Removing a computer signs it out. Songs already in its game stay there.</span>
    </div>
  );
}

function RemoveConfirm({ computerName, onRemove, onCancel }: { computerName: string; onRemove: () => void; onCancel: () => void }): ReactElement {
  return (
    <span className="sv-sync-inline-confirm" role="group" aria-label={`Sign ${computerName} out?`}>
      <span className="sv-sync-small sv-sync-danger-text">Sign {computerName} out?</span>
      <button className="sv-sync-button sv-sync-button--danger sv-sync-button--small" type="button" ref={(element) => { element?.focus(); }} onClick={onRemove}>Remove</button>
      <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={onCancel}>Cancel</button>
    </span>
  );
}

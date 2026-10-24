import type { FolderLayout } from '@stepsvault/sync-core';
import type { ReactElement } from 'react';
import { SyncDialog } from '../dialog/sync-dialog';
import { Note } from '../shared/small-parts';

export const FOLDER_LAYOUT_NAMES: Readonly<Record<FolderLayout, string>> = { 'one-group': 'One group', 'by-genre': 'By genre', 'by-artist': 'By artist' };

export interface LayoutChangeDialogProps {
  nextLayout: FolderLayout;
  /** How many StepsVault songs move, and so start with fresh scores. */
  movingSongCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/** StepMania keeps scores by folder, so moving songs resets their scores; the player agrees before anything moves. */
export function LayoutChangeDialog({ nextLayout, movingSongCount, onConfirm, onCancel }: LayoutChangeDialogProps): ReactElement {
  const songsText = movingSongCount === 1 ? '1 StepsVault song' : `${String(movingSongCount)} StepsVault songs`;
  return (
    <SyncDialog titleId="sv-sync-layout-question" descriptionId="sv-sync-layout-explanation" role="alertdialog" onClose={onCancel}>
      <div className="sv-sync-eyebrow">Change layout to “{FOLDER_LAYOUT_NAMES[nextLayout]}”</div>
      <h2 id="sv-sync-layout-question" className="sv-sync-heading-2">Move {songsText} into the new layout?</h2>
      <p id="sv-sync-layout-explanation" className="sv-sync-text">StepMania keeps scores by folder, so {movingSongCount === 1 ? 'this song’s score' : 'these songs’ scores'} will start fresh. Your own songs are not touched.</p>
      <Note iconName="lock" className="sv-sync-small">Only folders StepsVault added will move. Close StepMania first if it&apos;s running.</Note>
      <div className="sv-sync-dialog-buttons">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={onCancel} data-autofocus>Keep current layout</button>
        <button className="sv-sync-button" type="button" onClick={onConfirm}>Move songs</button>
      </div>
    </SyncDialog>
  );
}

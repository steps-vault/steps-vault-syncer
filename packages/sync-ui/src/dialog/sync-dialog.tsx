import { useRef, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from './focus-trap';

export interface SyncDialogProps {
  titleId: string;
  descriptionId?: string;
  /** "alertdialog" for a question that needs an answer before anything happens. */
  role?: 'dialog' | 'alertdialog';
  onClose: () => void;
  focusKey?: string;
  children: ReactNode;
}

/**
 * A modal dialog over the whole page. It is placed at the end of the page so no parent can clip it, and it repeats
 * the root class so it keeps the Sync colours there.
 */
export function SyncDialog({ titleId, descriptionId, role = 'dialog', onClose, focusKey, children }: SyncDialogProps): ReactElement {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef: dialogRef, onEscape: onClose, focusKey });
  return createPortal(
    <div className="sv-sync-root sv-sync-dialog-backdrop">
      <div ref={dialogRef} className="sv-sync-dialog" role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

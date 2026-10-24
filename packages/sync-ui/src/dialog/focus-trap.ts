import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
}

/** Focuses the element marked data-autofocus, else the first thing you can use. */
export function focusFirstElement(container: HTMLElement): void {
  const preferredElement = container.querySelector<HTMLElement>('[data-autofocus]');
  const target = preferredElement ?? getFocusableElements(container)[0] ?? container;
  target.focus();
}

function keepFocusInside({ container, event }: { container: HTMLElement; event: KeyboardEvent }): void {
  const focusableElements = getFocusableElements(container);
  const firstElement = focusableElements[0];
  const lastElement = focusableElements.at(-1);
  if (!firstElement || !lastElement) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
    return;
  }
  if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

export interface FocusTrapOptions {
  containerRef: RefObject<HTMLElement | null>;
  onEscape: () => void;
  /** Change it to move focus to the start again, for example when a dialog goes to its next step. */
  focusKey?: string;
}

/**
 * Keeps Tab inside a dialog, closes it on Escape, and gives focus back to whatever had it before, so a keyboard
 * player never gets lost behind the dialog.
 */
export function useFocusTrap({ containerRef, onEscape, focusKey }: FocusTrapOptions): void {
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key === 'Tab') keepFocusInside({ container, event });
    };
    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocusedElement?.isConnected) previouslyFocusedElement.focus();
    };
  }, [containerRef]);

  useEffect(() => {
    if (containerRef.current) focusFirstElement(containerRef.current);
  }, [containerRef, focusKey]);
}

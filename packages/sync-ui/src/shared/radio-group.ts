import type { KeyboardEvent } from 'react';

/** Arrow keys move the choice inside a radio group, as screen reader users expect. */
export function getNextRadioIndex({ key, currentIndex, optionCount }: { key: string; currentIndex: number; optionCount: number }): number | null {
  if (optionCount === 0) return null;
  if (key === 'ArrowDown' || key === 'ArrowRight') return (currentIndex + 1) % optionCount;
  if (key === 'ArrowUp' || key === 'ArrowLeft') return (currentIndex - 1 + optionCount) % optionCount;
  return null;
}

export interface RadioKeyDownOptions<Value> {
  event: KeyboardEvent<HTMLElement>;
  values: readonly Value[];
  currentIndex: number;
  onSelect: (value: Value) => void;
}

/** Selects the next option and moves focus to it, so only the chosen option sits in the Tab order. */
export function handleRadioKeyDown<Value>({ event, values, currentIndex, onSelect }: RadioKeyDownOptions<Value>): void {
  const nextIndex = getNextRadioIndex({ key: event.key, currentIndex: Math.max(0, currentIndex), optionCount: values.length });
  if (nextIndex === null) return;
  const nextValue = values[nextIndex];
  if (nextValue === undefined) return;
  event.preventDefault();
  onSelect(nextValue);
  event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[nextIndex]?.focus();
}

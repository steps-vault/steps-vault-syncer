import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { joinClassNames } from './class-names';

export interface ComboBoxOption {
  value: string;
  label: string;
  /** How many songs have it, shown at the end of the row. */
  count?: number;
}

export interface ComboBoxProps {
  label: string;
  /** The first row and the placeholder, meaning "no filter", for example "All genres". */
  anyLabel: string;
  /** For "No genre matches …". */
  noun: string;
  options: readonly ComboBoxOption[];
  /** '' when nothing is picked. */
  value: string;
  onChange: (value: string) => void;
}

const ANY_VALUE = '';

/** Accents and case don't matter when typing, so "beyonce" finds "Beyoncé". */
function getSearchKey(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}

/** The rows that match what was typed, those that start with it first; with nothing typed, "any" and every option. */
export function getMatchingComboBoxOptions({ options, anyLabel, query }: { options: readonly ComboBoxOption[]; anyLabel: string; query: string }): ComboBoxOption[] {
  const searchKey = getSearchKey(query.trim());
  if (searchKey === '') return [{ value: ANY_VALUE, label: anyLabel }, ...options];
  const matchingOptions = options.filter((option) => getSearchKey(option.label).includes(searchKey));
  const startsWithQuery = (option: ComboBoxOption): number => (getSearchKey(option.label).startsWith(searchKey) ? 0 : 1);
  return matchingOptions.sort((first, second) => startsWithQuery(first) - startsWithQuery(second));
}

/** A filter field you can type into: the list narrows as you type, and ↑ ↓ Enter Esc work like a select. */
export function ComboBox({ label, anyLabel, noun, options, value, onChange }: ComboBoxProps): ReactElement {
  const idPrefix = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  // null while the player is not typing: the field then shows the picked option.
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const visibleOptions = getMatchingComboBoxOptions({ options, anyLabel, query: query ?? '' });
  const shownActiveIndex = Math.min(activeIndex, Math.max(0, visibleOptions.length - 1));
  const pickedLabel = options.find((option) => option.value === value)?.label ?? '';
  const getOptionId = (index: number): string => `${idPrefix}-option-${String(index)}`;
  const close = (): void => {
    setIsOpen(false);
    setQuery(null);
  };
  const pick = (pickedValue: string): void => {
    onChange(pickedValue);
    close();
    setActiveIndex(0);
  };
  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setIsOpen(false);
      setQuery(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => { document.removeEventListener('pointerdown', handlePointerDown); };
  }, [isOpen]);
  useEffect(() => {
    const activeRow = isOpen ? listRef.current?.children[shownActiveIndex] : undefined;
    // jsdom has no scrollIntoView, and the list works without it.
    if (activeRow && 'scrollIntoView' in activeRow) activeRow.scrollIntoView({ block: 'nearest' });
  }, [isOpen, shownActiveIndex]);
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      if (visibleOptions.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((shownActiveIndex + step + visibleOptions.length) % visibleOptions.length);
      return;
    }
    const activeOption = visibleOptions[shownActiveIndex];
    if (event.key === 'Enter' && isOpen && activeOption) {
      event.preventDefault();
      pick(activeOption.value);
      return;
    }
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Tab') close();
  };
  const clear = (): void => {
    onChange(ANY_VALUE);
    setQuery(null);
    setActiveIndex(0);
    inputRef.current?.focus();
  };
  const toggle = (): void => {
    setIsOpen(!isOpen);
    setQuery(null);
    setActiveIndex(0);
    inputRef.current?.focus();
  };
  return (
    <div ref={rootRef} className={joinClassNames('sv-sync-combo', isOpen && 'sv-sync-combo--open', value !== ANY_VALUE && 'sv-sync-combo--picked')}>
      <label className="sv-sync-field-label" htmlFor={`${idPrefix}-input`}>{label}</label>
      <div className="sv-sync-combo-field">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          id={`${idPrefix}-input`}
          className="sv-sync-field sv-sync-combo-input"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={`${idPrefix}-list`}
          aria-activedescendant={isOpen && visibleOptions.length > 0 ? getOptionId(shownActiveIndex) : undefined}
          placeholder={anyLabel}
          value={query ?? pickedLabel}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
            setActiveIndex(0);
          }}
          onFocus={(event) => {
            setIsOpen(true);
            event.target.select();
          }}
          onKeyDown={handleKeyDown}
        />
        <span className="sv-sync-combo-buttons">
          {(value !== ANY_VALUE || (query ?? '') !== '') && (
            <button className="sv-sync-combo-button" type="button" aria-label={`Clear ${label}`} onClick={clear}><Icon name="close" size={12} strokeWidth={3} /></button>
          )}
          <button className="sv-sync-combo-button sv-sync-combo-toggle" type="button" tabIndex={-1} aria-label={`Show all ${label} options`} onClick={toggle}><Icon name="chevron-down" size={14} strokeWidth={2.8} /></button>
        </span>
      </div>
      {isOpen && (
        <div className="sv-sync-combo-popup">
          <ul ref={listRef} className="sv-sync-combo-list" role="listbox" id={`${idPrefix}-list`} aria-label={label}>
            {visibleOptions.map((option, index) => (
              <li
                key={option.value}
                id={getOptionId(index)}
                className={joinClassNames('sv-sync-combo-option', option.value === value && 'sv-sync-combo-option--picked', index === shownActiveIndex && 'sv-sync-combo-option--active', option.value === ANY_VALUE && 'sv-sync-combo-option--any')}
                role="option"
                aria-selected={option.value === value}
                // mousedown, not click: a click would blur the field and close the list before the pick lands.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(option.value);
                }}
                onMouseEnter={() => { setActiveIndex(index); }}
              >
                <span className="sv-sync-combo-check" aria-hidden="true">{option.value === value && <Icon name="check" size={14} strokeWidth={3} />}</span>
                <span className="sv-sync-combo-name" dir="auto"><HighlightedText text={option.label} query={query ?? ''} /></span>
                {option.count !== undefined && <span className="sv-sync-combo-count sv-sync-tabular">{option.count}</span>}
              </li>
            ))}
          </ul>
          {visibleOptions.length === 0 && <div className="sv-sync-combo-empty" role="status">No {noun} matches “{query}”.</div>}
          <div className="sv-sync-combo-hint" aria-hidden="true">
            <span><kbd>↑</kbd> <kbd>↓</kbd> move</span>
            <span><kbd>Enter</kbd> pick</span>
            <span><kbd>Esc</kbd> close</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Marks the typed part of a name, when the name has no accents that would shift the match. */
function HighlightedText({ text, query }: { text: string; query: string }): ReactElement {
  const searchKey = getSearchKey(query.trim());
  const matchIndex = searchKey === '' ? -1 : getSearchKey(text).indexOf(searchKey);
  if (matchIndex < 0 || getSearchKey(text).length !== text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, matchIndex)}
      <mark>{text.slice(matchIndex, matchIndex + searchKey.length)}</mark>
      {text.slice(matchIndex + searchKey.length)}
    </>
  );
}

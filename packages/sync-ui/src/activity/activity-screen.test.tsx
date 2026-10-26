import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_ACTIVITY_ENTRIES } from '../fake-data/fake-sync-data';
import { ActivityScreen } from './activity-screen';

function getEntryButtons(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Sync activity' })).getAllByRole('button');
}

describe('ActivityScreen', () => {
  it('renders every entry from fake data, newest first, grouped by day', () => {
    render(<ActivityScreen entries={FAKE_ACTIVITY_ENTRIES} wasCopied={false} onCopyDetails={vi.fn()} hasOlderEntries onShowOlder={vi.fn()} />);
    expect(getEntryButtons()).toHaveLength(FAKE_ACTIVITY_ENTRIES.length);
    expect(getEntryButtons()[0]?.textContent).toContain('Sync finished');
    expect(screen.getAllByText('Yesterday')).toHaveLength(1);
  });

  it('opens an entry to its details', () => {
    render(<ActivityScreen entries={FAKE_ACTIVITY_ENTRIES} wasCopied={false} onCopyDetails={vi.fn()} hasOlderEntries={false} onShowOlder={vi.fn()} />);
    const entry = screen.getByRole('button', { name: /Removed Paris/ });
    expect(entry.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(entry);
    expect(entry.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Your audio file and all your other songs')).toBeDefined();
  });

  it('shows only skipped entries when asked', () => {
    render(<ActivityScreen entries={FAKE_ACTIVITY_ENTRIES} wasCopied={false} onCopyDetails={vi.fn()} hasOlderEntries={false} onShowOlder={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skipped' }));
    expect(getEntryButtons().map((button) => button.textContent)).toEqual([
      expect.stringContaining('Sugar You'), expect.stringContaining('שמש של חצות'), expect.stringContaining('Neon Overdrive'), expect.stringContaining('Indie Tapes'),
    ]);
  });

  it('copies the details for support and says so', () => {
    const onCopyDetails = vi.fn();
    const { rerender } = render(<ActivityScreen entries={FAKE_ACTIVITY_ENTRIES} wasCopied={false} onCopyDetails={onCopyDetails} hasOlderEntries={false} onShowOlder={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy log for support' }));
    expect(onCopyDetails).toHaveBeenCalledOnce();
    rerender(<ActivityScreen entries={FAKE_ACTIVITY_ENTRIES} wasCopied onCopyDetails={onCopyDetails} hasOlderEntries={false} onShowOlder={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('Copied');
  });
});

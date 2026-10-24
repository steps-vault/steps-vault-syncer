import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_LAYOUT_PREVIEWS, FAKE_MOVING_SONG_COUNTS, FAKE_PLAYER_GROUPS } from '../fake-data/fake-sync-data';
import { FolderLayoutScreen, type FolderLayoutScreenProps } from './folder-layout-screen';

function renderFolderLayout(overrides: Partial<FolderLayoutScreenProps> = {}): FolderLayoutScreenProps {
  const props: FolderLayoutScreenProps = {
    currentLayout: 'by-genre',
    previewsByLayout: FAKE_LAYOUT_PREVIEWS,
    movingSongCountsByLayout: FAKE_MOVING_SONG_COUNTS,
    playerGroupNames: FAKE_PLAYER_GROUPS.map((group) => group.groupName),
    onChangeLayout: vi.fn(),
    ...overrides,
  };
  render(<FolderLayoutScreen {...props} />);
  return props;
}

describe('FolderLayoutScreen', () => {
  it('renders the three layouts with the current one chosen', () => {
    renderFolderLayout();
    const options = within(screen.getByRole('radiogroup', { name: 'Folder layout' })).getAllByRole('radio');
    expect(options.map((option) => option.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(options[1]?.textContent).toContain('Current');
    expect(screen.getByText(/StepsVault uses/).textContent).toContain('StepsVault - Pop');
  });

  it('asks first, with the number of songs whose scores start fresh', () => {
    const props = renderFolderLayout();
    fireEvent.click(screen.getByRole('radio', { name: /By artist/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Move 11 StepsVault songs into the new layout?' });
    expect(within(dialog).getByText(/scores will start fresh/)).toBeDefined();
    expect(props.onChangeLayout).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Keep current layout' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move songs' }));
    expect(props.onChangeLayout).toHaveBeenCalledWith('by-artist');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('keeps the layout when the player says no or presses Escape', () => {
    const props = renderFolderLayout();
    fireEvent.click(screen.getByRole('radio', { name: /One group/ }));
    expect(screen.getByRole('alertdialog').textContent).toContain('Move 12 StepsVault songs');
    fireEvent.click(screen.getByRole('button', { name: 'Keep current layout' }));
    fireEvent.click(screen.getByRole('radio', { name: /One group/ }));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(props.onChangeLayout).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /By genre/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('changes straight away when no song would move', () => {
    const props = renderFolderLayout({ currentLayout: 'one-group' });
    fireEvent.click(screen.getByRole('radio', { name: /By genre/ }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(props.onChangeLayout).toHaveBeenCalledWith('by-genre');
  });

  it('moves the choice with the arrow keys', () => {
    renderFolderLayout();
    fireEvent.keyDown(screen.getByRole('radio', { name: /By genre/ }), { key: 'ArrowRight' });
    expect(screen.getByRole('alertdialog').textContent).toContain('Change layout to “By artist”');
  });

  it('says GREAT after a move', () => {
    renderFolderLayout({ lastMove: { layout: 'by-artist', movedSongCount: 11 } });
    expect(screen.getByRole('status').textContent).toContain('Moved 11 StepsVault songs into “By artist”.');
  });
});

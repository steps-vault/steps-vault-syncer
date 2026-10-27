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
  it('renders the four layouts with the current one chosen', () => {
    renderFolderLayout();
    const options = within(screen.getByRole('radiogroup', { name: 'Folder layout' })).getAllByRole('radio');
    expect(options.map((option) => option.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false']);
    expect(options[1]?.textContent).toContain('Current');
    expect(screen.getByText(/Ours is named/).textContent).toContain('dancedance.studio - Pop');
  });

  it('asks first, with the number of songs whose scores start fresh', () => {
    const props = renderFolderLayout();
    fireEvent.click(screen.getByRole('radio', { name: /By artist/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Switch to “By artist” and move 11 songs?' });
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
    expect(screen.getByRole('alertdialog').textContent).toContain('move 12 songs');
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
    expect(screen.getByRole('alertdialog').textContent).toContain('Switch to “By artist”');
  });

  it('marks My groups NEW, previews the player’s groups and Ungrouped, and links to where groups are made', () => {
    renderFolderLayout({ editGroupsHref: 'https://dancedance.studio/library?tab=groups' });
    const myGroups = screen.getByRole('radio', { name: /My groups/ });
    expect(within(myGroups).getByText('NEW')).toBeDefined();
    expect(within(myGroups).getByText('Warm-up')).toBeDefined();
    expect(within(myGroups).getByText('Ungrouped')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Edit my groups' }).getAttribute('href')).toBe('https://dancedance.studio/library?tab=groups');
  });

  it('shows My groups as current, without NEW', () => {
    renderFolderLayout({ currentLayout: 'my-groups' });
    const myGroups = screen.getByRole('radio', { name: /My groups/ });
    expect(myGroups.getAttribute('aria-checked')).toBe('true');
    expect(myGroups.textContent).toContain('Current');
    expect(within(myGroups).queryByText('NEW')).toBeNull();
  });

  it('asks before switching to My groups', () => {
    const props = renderFolderLayout();
    fireEvent.click(screen.getByRole('radio', { name: /My groups/ }));
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Switch to “My groups” and move 12 songs?' })).getByRole('button', { name: 'Move songs' }));
    expect(props.onChangeLayout).toHaveBeenCalledWith('my-groups');
  });

  it('says GREAT after a move', () => {
    renderFolderLayout({ lastMove: { layout: 'by-artist', movedSongCount: 11 } });
    expect(screen.getByRole('status').textContent).toContain('Moved 11 dancedance.studio songs into “By artist”.');
  });
});

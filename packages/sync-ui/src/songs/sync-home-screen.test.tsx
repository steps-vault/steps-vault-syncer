import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_GAME, FAKE_SONG_ROWS, getFakeSongDetails } from '../fake-data/fake-sync-data';
import { SyncHomeScreen, type SyncHomeScreenProps } from './sync-home-screen';

function renderHomeScreen(overrides: Partial<SyncHomeScreenProps> = {}): SyncHomeScreenProps {
  const props: SyncHomeScreenProps = {
    platform: 'website',
    topBar: { game: FAKE_GAME, audioSources: { sourceNames: ['My music folder', 'Open Audio Links'] }, lastSync: { timeText: 'Today, 18:42', noteText: '2 hours ago' }, onSyncNow: vi.fn(), onChangeGame: vi.fn(), onManageAudioSources: vi.fn() },
    syncRun: null,
    finishedSync: null,
    onSeeActivity: vi.fn(),
    onDismissFinishedSync: vi.fn(),
    songs: FAKE_SONG_ROWS,
    selectedSongDetails: null,
    onOpenSongDetails: vi.fn(),
    onCloseSongDetails: vi.fn(),
    onSongAction: vi.fn(),
    ...overrides,
  };
  render(<SyncHomeScreen {...props} />);
  return props;
}

function getVisibleTitles(): string[] {
  const list = screen.getByRole('list', { name: 'Your dancedance.studio songs' });
  return within(list).getAllByRole('button', { name: /— details$/ }).map((button) => button.textContent);
}

/** Holds the selected song like the website or the app would, so the drawer really opens and closes. */
function HomeScreenWithDrawer(): ReactElement {
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  return (
    <SyncHomeScreen
      platform="desktop"
      topBar={{ game: FAKE_GAME, audioSources: { sourceNames: ['My music folder'] }, lastSync: null, onSyncNow: vi.fn(), onChangeGame: vi.fn(), onManageAudioSources: vi.fn(), backgroundSync: { isOn: true, onToggle: vi.fn() } }}
      syncRun={null}
      finishedSync={null}
      onSeeActivity={vi.fn()}
      onDismissFinishedSync={vi.fn()}
      songs={FAKE_SONG_ROWS}
      selectedSongDetails={selectedSongId === null ? null : getFakeSongDetails(selectedSongId)}
      onOpenSongDetails={setSelectedSongId}
      onCloseSongDetails={() => { setSelectedSongId(null); }}
      onSongAction={vi.fn()}
    />
  );
}

describe('SyncHomeScreen', () => {
  it('renders the top bar, the counters and every song from fake data', () => {
    renderHomeScreen();
    expect(screen.getByText('StepMania 5 LTEK Edition')).toBeDefined();
    expect(screen.getByRole('button', { name: /SYNC NOW/ })).toBeDefined();
    expect(getVisibleTitles()).toHaveLength(FAKE_SONG_ROWS.length);
    expect(screen.getByRole('button', { name: /5\s*Synced/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Showing 12 of 12 songs')).toBeDefined();
  });

  it('filters by a status counter, and pressing it again shows every song', () => {
    renderHomeScreen();
    const needsAudioTile = screen.getByRole('button', { name: /2\s*Needs audio/ });
    fireEvent.click(needsAudioTile);
    expect(needsAudioTile.getAttribute('aria-pressed')).toBe('true');
    expect(getVisibleTitles()).toEqual(['שמש של חצות', 'Pulse Garden']);
    fireEvent.click(needsAudioTile);
    expect(getVisibleTitles()).toHaveLength(FAKE_SONG_ROWS.length);
  });

  it('filters by search, genre and artist, and clears them all at once', () => {
    renderHomeScreen();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'kairo' } });
    expect(getVisibleTitles()).toEqual(['Paris', 'Neon Overdrive', 'Pulse Garden', 'Afterimage']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Genre' }), { target: { value: 'Electronic' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Artist' }), { target: { value: 'Kairo Lights' } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'garden' } });
    expect(getVisibleTitles()).toEqual(['Pulse Garden']);
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0] as HTMLElement);
    expect(getVisibleTitles()).toHaveLength(FAKE_SONG_ROWS.length);
  });

  it('says so when no song matches', () => {
    renderHomeScreen();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no such song' } });
    expect(screen.getByText(/No songs match these filters/)).toBeDefined();
  });

  it('sorts by title', () => {
    renderHomeScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Title' }));
    expect(getVisibleTitles().slice(0, 2)).toEqual(['Afterimage', 'Bassline Cathedral']);
  });

  it('passes the status choices of a row to the caller', () => {
    const props = renderHomeScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Use library version' }));
    expect(props.onSongAction).toHaveBeenCalledWith({ vaultSongId: 'neon-overdrive', action: 'replace-with-stepsvault' });
  });

  it('shows the life bar and each row’s step while syncing, and hides the status choices', () => {
    const rows = FAKE_SONG_ROWS.map((row, index) => ({ ...row, progress: index === 0 ? { kind: 'working' as const, step: 'lining-up' as const } : { kind: 'waiting-in-line' as const } }));
    renderHomeScreen({ songs: rows, syncRun: { currentSongNumber: 7, totalSongCount: 23, currentStepText: 'Lining up the steps · Paper Thrills' } });
    const progressBar = screen.getByRole('progressbar', { name: 'Sync progress' });
    expect(progressBar.getAttribute('aria-valuenow')).toBe('7');
    expect(screen.getByText('Syncing 7 of 23').closest('[aria-live]')).not.toBeNull();
    expect(screen.getByText('Lining up the steps…')).toBeDefined();
    expect(screen.getAllByText('In line')).toHaveLength(FAKE_SONG_ROWS.length - 1);
    expect(screen.getByRole('button', { name: /SYNCING…/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Keep this tab open/)).toBeDefined();
  });

  it('flashes FLAWLESS!! when every song synced and PERFECT! when some need the player', () => {
    renderHomeScreen({ finishedSync: { syncedCount: 23, needsYouCount: 0 } });
    expect(screen.getByText('FLAWLESS!!')).toBeDefined();
    expect(screen.getByText('All 23 songs synced')).toBeDefined();
  });

  it('opens the details drawer, closes it on Escape and gives focus back to the song', () => {
    render(<HomeScreenWithDrawer />);
    const titleButton = screen.getByRole('button', { name: 'Watch Me Glow — details' });
    titleButton.focus();
    fireEvent.click(titleButton);
    const drawer = screen.getByRole('complementary', { name: 'Song details: Watch Me Glow' });
    expect(document.activeElement).toBe(within(drawer).getByRole('heading', { name: 'Watch Me Glow' }));
    expect(within(drawer).getByText(/Chart v3 adds a Challenge chart/)).toBeDefined();
    expect(within(drawer).getByRole('img', { name: 'Challenge, not in this chart' })).toBeDefined();
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Watch Me Glow — details' }));
  });

  it('asks before removing a song from the game', () => {
    const onSongAction = vi.fn();
    renderHomeScreen({ selectedSongDetails: getFakeSongDetails('paper-thrills'), onSongAction });
    fireEvent.click(screen.getByRole('button', { name: 'Remove from my game' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Remove Paper Thrills from your game?' });
    expect(within(confirm).getByText('Songs/dancedance.studio - Pop/Paper Thrills')).toBeDefined();
    expect(onSongAction).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    expect(onSongAction).toHaveBeenCalledWith({ vaultSongId: 'paper-thrills', action: 'remove-from-game' });
  });

  it('shows the background sync switch on the desktop only', () => {
    render(<HomeScreenWithDrawer />);
    expect(screen.getByRole('switch', { name: 'Background sync: On' }).getAttribute('aria-checked')).toBe('true');
  });

  it('shows the empty state when the vault has no songs', () => {
    renderHomeScreen({ songs: [], emptyState: <p>Your vault is empty</p> });
    expect(screen.getByText('Your vault is empty')).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

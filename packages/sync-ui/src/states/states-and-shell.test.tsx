import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_GAME, FAKE_SONG_ROWS } from '../fake-data/fake-sync-data';
import { PhoneStatusView } from '../phone/phone-status-view';
import { SyncShell } from '../shell/sync-shell';
import { SyncLoadingPanel } from '../songs/sync-home-screen';
import { DiskFullState, EmptyVaultState, NeedsAudioBanner, PermissionLostState, SongFolderLockedState, SongsFolderMissingState } from './empty-and-error-states';

describe('empty and error states', () => {
  it('each says what happened and offers the next step', () => {
    const onAction = vi.fn();
    render(
      <>
        <EmptyVaultState vaultHref="https://stepsvault.example/vault" />
        <PermissionLostState onReconnect={onAction} />
        <SongsFolderMissingState previousSongsFolderPath={FAKE_GAME.songsFolderPath} onChooseFolder={onAction} />
        <DiskFullState neededSpaceText="48 MB" songCount={3} driveName="C:" onTryAgain={onAction} />
        <SongFolderLockedState songTitle="Watch Me Glow" onTryAgain={onAction} />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Browse the library' }).getAttribute('href')).toBe('https://stepsvault.example/vault');
    expect(screen.getByRole('heading', { name: 'Permission needed' })).toBeDefined();
    expect(screen.getByText(FAKE_GAME.songsFolderPath)).toBeDefined();
    expect(screen.getByText(/Nothing was half-written/).textContent).toContain('3 songs');
    expect(screen.getByText(/Close it to update/)).toBeDefined();
    for (const button of screen.getAllByRole('button')) fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(4);
  });

  it('gathers many songs without audio into one banner', () => {
    const onAddMusicFolder = vi.fn();
    render(<NeedsAudioBanner songCount={17} onAddMusicFolder={onAddMusicFolder} onDismiss={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('17songs need audio');
    fireEvent.click(screen.getByRole('button', { name: 'Add music folder' }));
    expect(onAddMusicFolder).toHaveBeenCalledOnce();
  });
});

describe('PhoneStatusView', () => {
  it('shows status and counters but no Sync button', () => {
    render(<PhoneStatusView computerName="LIVING-ROOM-PC" gameName="StepMania 5 LTEK" overallStatus="synced" lastSyncText="2 hours ago" syncedCount={14} needsAudioCount={3} updateCount={2} songs={FAKE_SONG_ROWS.slice(0, 3)} />);
    expect(screen.getByText('Syncing needs a computer.', { exact: false })).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('SyncShell', () => {
  it('on the website, shows the Sync menu without Account', () => {
    const onNavigate = vi.fn();
    render(<SyncShell platform="website" currentScreen="songs" onNavigate={onNavigate}><p>screen</p></SyncShell>);
    const navigation = screen.getByRole('navigation', { name: 'Sync' });
    expect(navigation.textContent).toBe('SongsAudio sourcesFolder layoutActivity');
    expect(screen.getByRole('link', { name: 'Songs' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('link', { name: 'Activity' }));
    expect(onNavigate).toHaveBeenCalledWith('activity');
  });

  it('in the desktop app, adds Account, the banner and the tray status', () => {
    render(
      <SyncShell platform="desktop" currentScreen="account" onNavigate={vi.fn()} banner={<div>banner here</div>} desktopSidebar={{ game: FAKE_GAME, trayStatus: 'needs-attention', playerName: 'Noa' }}>
        <p>screen</p>
      </SyncShell>,
    );
    expect(screen.getByRole('link', { name: 'Account' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('banner here')).toBeDefined();
    expect(screen.getByText('Needs attention')).toBeDefined();
  });
});

describe('website Generators and loading', () => {
  it('shows Generators on the website only when the website can make songs', () => {
    render(<SyncShell platform="website" currentScreen="generators" onNavigate={vi.fn()} hasWebsiteGenerators><p>screen</p></SyncShell>);
    expect(screen.getByRole('navigation', { name: 'Sync' }).textContent).toBe('SongsAudio sourcesGeneratorsFolder layoutActivity');
  });

  it('shows the receptor loader while Sync reads the songs', () => {
    render(<SyncLoadingPanel />);
    expect(screen.getByRole('status').textContent).toBe('Loading your songs…');
  });
});

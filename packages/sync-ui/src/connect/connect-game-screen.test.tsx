import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_FOUND_GAMES, FAKE_PLAYER_GROUPS } from '../fake-data/fake-sync-data';
import { ConnectGameScreen } from './connect-game-screen';
import { SongsFolderPreview } from './songs-folder-preview';

describe('ConnectGameScreen', () => {
  it('on the website, offers one folder button and explains the browser prompt', () => {
    const onChooseSongsFolder = vi.fn();
    render(<ConnectGameScreen platform="website" isBrowserSupported onChooseSongsFolder={onChooseSongsFolder} desktopAppHref="#app" onCopySyncAddress={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /CHOOSE MY SONGS FOLDER/ }));
    expect(onChooseSongsFolder).toHaveBeenCalledOnce();
    expect(screen.getByRole('img', { name: /browser asking for permission/ })).toBeDefined();
    expect(screen.getByText(/Your browser asks again after a restart/)).toBeDefined();
  });

  it('in Firefox or Safari, blocks calmly and explains how to open Edge', () => {
    const onCopySyncAddress = vi.fn();
    render(<ConnectGameScreen platform="website" isBrowserSupported={false} onChooseSongsFolder={vi.fn()} desktopAppHref="#app" onCopySyncAddress={onCopySyncAddress} />);
    expect(screen.getByRole('alert').textContent).toContain('Sync needs Chrome or Edge on a computer');
    const edgeButton = screen.getByRole('button', { name: 'Open in Edge' });
    expect(edgeButton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(edgeButton);
    expect(edgeButton.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(onCopySyncAddress).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Get the desktop app' }).getAttribute('href')).toBe('#app');
  });

  it('in the desktop app, lists the games found as a radio group the arrow keys can move through', () => {
    const onSelectGame = vi.fn();
    const onUseSelectedGame = vi.fn();
    render(<ConnectGameScreen platform="desktop" foundGames={FAKE_FOUND_GAMES} selectedGameId="ltek" searchedPlacesText="checked C:\ and D:\" onSelectGame={onSelectGame} onUseSelectedGame={onUseSelectedGame} onChooseAnotherFolder={vi.fn()} />);
    const radios = within(screen.getByRole('radiogroup', { name: 'Games found' })).getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true');
    expect(radios[1]?.getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(radios[0] as HTMLElement, { key: 'ArrowDown' });
    expect(onSelectGame).toHaveBeenCalledWith('stepmania-5');
    expect(document.activeElement).toBe(radios[1]);
    fireEvent.keyDown(radios[0] as HTMLElement, { key: 'ArrowUp' });
    expect(onSelectGame).toHaveBeenLastCalledWith('outfox');
    fireEvent.click(screen.getByRole('button', { name: /Use this folder/ }));
    expect(onUseSelectedGame).toHaveBeenCalledOnce();
  });
});

describe('SongsFolderPreview', () => {
  it('shows every group of the player locked, and where StepsVault songs will go', () => {
    render(<SongsFolderPreview songsFolderPath="C:\\Games\\StepMania 5\\Songs" playerGroups={FAKE_PLAYER_GROUPS} layoutText="by genre" onChangeLayout={vi.fn()} onChooseAnotherFolder={vi.fn()} onContinue={vi.fn()} />);
    expect(screen.getByText('1,312 songs in 7 groups. We never touch them.')).toBeDefined();
    const groups = within(screen.getByRole('list', { name: 'Groups in your Songs folder' })).getAllByRole('listitem');
    expect(groups.filter((group) => group.textContent.includes('Yours — never touched'))).toHaveLength(FAKE_PLAYER_GROUPS.length);
    expect(groups.at(-1)?.textContent).toContain('New dancedance.studio groups');
  });
});

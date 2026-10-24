import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_ADDON_PREVIEW, FAKE_ADDONS, FAKE_MUSIC_FOLDERS, FAKE_PICKED_FILES } from '../fake-data/fake-sync-data';
import type { AddonLookupResult } from '../sync-ui-types';
import { ADDON_NEVER_SEES, ADDON_VISIBLE_SONG_FACTS, AddAddonDialog, isAddonAddress } from './add-addon-dialog';
import { AudioSourcesScreen, type AudioSourcesScreenProps } from './audio-sources-screen';

function renderAudioSources(overrides: Partial<AudioSourcesScreenProps> = {}): AudioSourcesScreenProps {
  const props: AudioSourcesScreenProps = {
    musicFolders: FAKE_MUSIC_FOLDERS, scan: { scannedFileCount: 241, percent: 62 }, matchedSongCount: 8, vaultSongCount: 12, pickedFiles: FAKE_PICKED_FILES, addons: FAKE_ADDONS,
    onAddMusicFolder: vi.fn(), onRemoveMusicFolder: vi.fn(), onScanAgain: vi.fn(), onGoToSongs: vi.fn(), onToggleAddon: vi.fn(), onRemoveAddon: vi.fn(), onSetAddonOption: vi.fn(),
    onLookUpAddon: vi.fn(() => Promise.resolve<AddonLookupResult>({ kind: 'found', addon: FAKE_ADDON_PREVIEW })), onInstallAddon: vi.fn(),
    ...overrides,
  };
  render(<AudioSourcesScreen {...props} />);
  return props;
}

async function goToConsentStep(): Promise<HTMLElement> {
  const dialog = screen.getByRole('dialog', { name: 'Add an addon' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Addon address (URL)' }), { target: { value: FAKE_ADDON_PREVIEW.address } });
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' })); await Promise.resolve(); });
  return screen.getByRole('dialog', { name: 'Install “Bandcamp Bridge”?' });
}

describe('AudioSourcesScreen', () => {
  it('renders the music folders, the scan, picked files and addons from fake data', () => {
    renderAudioSources();
    expect(screen.getByText('C:\\Users\\Noa\\Music')).toBeDefined();
    expect(screen.getByRole('progressbar', { name: 'Scanning music folder' }).getAttribute('aria-valuenow')).toBe('62');
    expect(screen.getByText('sugar_you_radio_edit.mp3')).toBeDefined();
    expect(screen.getByRole('article', { name: 'Indie Tapes' }).textContent).toContain('Not answering since 14:02');
    expect(screen.getByRole('switch', { name: 'Use Home Server Music' }).getAttribute('aria-checked')).toBe('false');
  });

  it('turns an addon on or off and removes it through callbacks', () => {
    const props = renderAudioSources();
    fireEvent.click(screen.getByRole('switch', { name: 'Use Home Server Music' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Indie Tapes' }));
    expect(props.onToggleAddon).toHaveBeenCalledWith({ addonId: 'home-server-music', isEnabled: true });
    expect(props.onRemoveAddon).toHaveBeenCalledWith('indie-tapes');
  });

  it('shows an addon’s options as labelled selects the player can change any time', () => {
    const props = renderAudioSources();
    const options = within(screen.getByRole('article', { name: 'Open Audio Links' })).getByRole('group', { name: 'Open Audio Links options' });
    const mediaSelect = within(options).getByRole('combobox', { name: 'What to get' });
    expect((mediaSelect as HTMLSelectElement).value).toBe('audio-and-video');
    expect(within(mediaSelect).getAllByRole('option').map((option) => option.textContent)).toEqual(['Music only', 'Music and video']);
    fireEvent.change(mediaSelect, { target: { value: 'audio' } });
    expect(props.onSetAddonOption).toHaveBeenCalledWith({ addonId: 'open-audio-links', optionId: 'media', value: 'audio' });
    expect(within(screen.getByRole('article', { name: 'Indie Tapes' })).queryByRole('group')).toBeNull();
  });

  it('opens the add addon dialog with focus in the address field, and gives focus back on Escape', () => {
    renderAudioSources();
    const addButton = screen.getByRole('button', { name: 'Add addon' });
    addButton.focus();
    fireEvent.click(addButton);
    const dialog = screen.getByRole('dialog', { name: 'Add an addon' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(within(dialog).getByRole('textbox', { name: 'Addon address (URL)' }));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(addButton);
  });

  it('keeps Tab inside the dialog', () => {
    renderAudioSources();
    fireEvent.click(screen.getByRole('button', { name: 'Add addon' }));
    const dialog = screen.getByRole('dialog', { name: 'Add an addon' });
    const addressField = within(dialog).getByRole('textbox', { name: 'Addon address (URL)' });
    const continueButton = within(dialog).getByRole('button', { name: 'Continue' });
    continueButton.focus();
    fireEvent.keyDown(continueButton, { key: 'Tab' });
    expect(document.activeElement).toBe(addressField);
    fireEvent.keyDown(addressField, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(continueButton);
  });

  it('refuses an address that is not https', async () => {
    const props = renderAudioSources();
    fireEvent.click(screen.getByRole('button', { name: 'Add addon' }));
    const dialog = screen.getByRole('dialog', { name: 'Add an addon' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Addon address (URL)' }), { target: { value: 'http://plain.example' } });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' })); await Promise.resolve(); });
    expect(within(dialog).getByRole('alert').textContent).toContain('It should start with https://');
    expect(props.onLookUpAddon).not.toHaveBeenCalled();
  });

  it('shows exactly what the addon will see before installing it', async () => {
    const props = renderAudioSources();
    fireEvent.click(screen.getByRole('button', { name: 'Add addon' }));
    const consentDialog = await goToConsentStep();
    const consent = within(consentDialog).getByLabelText('What this addon will see');
    const seenItems = within(consent).getAllByRole('listitem').map((item) => item.textContent);
    expect(seenItems).toEqual([ADDON_VISIBLE_SONG_FACTS, ADDON_NEVER_SEES]);
    expect(ADDON_VISIBLE_SONG_FACTS).toBe('title, artist, album, genre, length, and the song’s YouTube link.');
    expect(consentDialog.textContent).toContain('by hyperpad');
    expect(consentDialog.textContent).toContain('Addons are made by other people, not StepsVault.');
    expect(props.onInstallAddon).not.toHaveBeenCalled();
    fireEvent.click(within(consentDialog).getByRole('button', { name: 'Install' }));
    expect(props.onInstallAddon).toHaveBeenCalledWith(FAKE_ADDON_PREVIEW);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lets the player pick the addon’s options before installing, starting at the defaults', async () => {
    const props = renderAudioSources();
    fireEvent.click(screen.getByRole('button', { name: 'Add addon' }));
    const consentDialog = await goToConsentStep();
    const mediaSelect = within(consentDialog).getByRole('combobox', { name: 'What to get' });
    expect((mediaSelect as HTMLSelectElement).value).toBe('audio-and-video');
    fireEvent.change(mediaSelect, { target: { value: 'audio' } });
    fireEvent.click(within(consentDialog).getByRole('button', { name: 'Install' }));
    expect(props.onInstallAddon).toHaveBeenCalledWith({ ...FAKE_ADDON_PREVIEW, options: [{ ...FAKE_ADDON_PREVIEW.options[0], value: 'audio' }] });
  });

  it('moves focus to the start of the consent step', async () => {
    renderAudioSources();
    fireEvent.click(screen.getByRole('button', { name: 'Add addon' }));
    const consentDialog = await goToConsentStep();
    expect(document.activeElement).toBe(within(consentDialog).getByRole('button', { name: 'Cancel' }));
  });

  it('shows the addon’s own error when the address does not answer', async () => {
    render(<AddAddonDialog onLookUpAddon={() => Promise.reject(new Error('offline'))} onInstall={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Add an addon' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'https://offline.example/addon' } });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' })); await Promise.resolve(); });
    expect(within(dialog).getByRole('alert').textContent).toContain('We couldn’t reach that addon');
  });
});

describe('isAddonAddress', () => {
  it.each([
    ['https://bridge.example/stepsvault', true],
    ['  https://bridge.example  ', true],
    ['http://bridge.example', false],
    ['https://', false],
    ['bridge.example', false],
  ])('%j → %j', (address, isValid) => {
    expect(isAddonAddress(address)).toBe(isValid);
  });
});

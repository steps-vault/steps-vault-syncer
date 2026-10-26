import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_FOUND_MUSICS, FAKE_GENERATED_SONGS, FAKE_GENERATOR_JOBS, FAKE_GENERATOR_PREVIEW, FAKE_GENERATORS, FAKE_MUSIC_CHOICES, FAKE_SONG_SOURCE_TABS, FAKE_STEPSVAULT_GENERATOR } from '../fake-data/fake-sync-data';
import type { GeneratorJobView, GeneratorLookupResult, MakeSongResult, SongSourceSearchResult } from '../sync-ui-types';
import { STEPSVAULT_GENERATOR_ID } from '../views/build-generator-views';
import { GENERATOR_GETS, GENERATOR_NEVER_GETS } from './add-generator-dialog';
import { GeneratorsScreen, type GeneratorsScreenProps } from './generators-screen';

const PICKED_FILE = { musicId: 'picked-file', title: 'my new song', artist: 'Unknown artist', sourceText: 'my_new_song.mp3', lengthText: '3:05', hasVideo: false };

function renderGenerators(overrides: Partial<GeneratorsScreenProps> = {}): GeneratorsScreenProps {
  const props: GeneratorsScreenProps = {
    stepsVaultGenerator: FAKE_STEPSVAULT_GENERATOR, generators: FAKE_GENERATORS, jobs: [], generatedSongs: FAKE_GENERATED_SONGS, canUseStartCommand: true, songSourceTabs: FAKE_SONG_SOURCE_TABS,
    onLookUpGenerator: vi.fn(() => Promise.resolve<GeneratorLookupResult>({ kind: 'found', generator: FAKE_GENERATOR_PREVIEW })), onAddGenerator: vi.fn(), onRemoveGenerator: vi.fn(), onSetGeneratorOption: vi.fn(),
    onChooseMusicFile: vi.fn(() => Promise.resolve(PICKED_FILE)), onSearchMusic: vi.fn(() => Promise.resolve(FAKE_MUSIC_CHOICES)),
    onFindSong: vi.fn(() => Promise.resolve<SongSourceSearchResult>({ kind: 'found', musics: [{ musicId: 'found', title: 'Low Tide', artist: 'Marla Quinn', sourceText: 'From Tube Songs', lengthText: '4:02', hasVideo: true }] })),
    onStopFindingSong: vi.fn(), onMakeSong: vi.fn(() => Promise.resolve<MakeSongResult>({ kind: 'started', jobKey: 'job-1' })), onCancelJob: vi.fn(), onAnswerVaultChoice: vi.fn(), onDismissJob: vi.fn(), onFetchSongReport: vi.fn(() => Promise.resolve('Made with onsets.')),
    ...overrides,
  };
  render(<GeneratorsScreen {...props} />);
  return props;
}

async function settle(action: () => void): Promise<void> {
  await act(async () => { action(); await Promise.resolve(); await Promise.resolve(); });
}

function lookUpGenerator(address: string): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: 'Add a generator' }));
  const dialog = screen.getByRole('dialog', { name: 'Add a generator' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Generator address' }), { target: { value: address } });
  return dialog;
}

async function goToSetupStep(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Make a song' }));
  await settle(() => { fireEvent.click(screen.getByRole('button', { name: 'Choose a file…' })); });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  return screen.getByRole('dialog', { name: 'Pick the generator and difficulties' });
}

describe('GeneratorsScreen', () => {
  it('shows StepsVault’s generator first, then community generators with where they run and their options', () => {
    const props = renderGenerators();
    expect(screen.getByRole('region', { name: 'dancedance.studio generator' }).textContent).toContain('Songs go to the library for everyone. Each song uses 1 token.');
    expect(screen.getByLabelText('You have 37 tokens')).toBeDefined();
    expect(screen.getByRole('article', { name: 'Tap Forge' }).textContent).toContain('On this computer');
    expect(screen.getByRole('article', { name: 'Groove Lab' }).textContent).toContain('On the internet:https://gen.grooveworks.example');
    fireEvent.click(within(screen.getByRole('group', { name: 'Jumps for Tap Forge' })).getByRole('button', { name: 'Many' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Groove Lab' }));
    expect(props.onSetGeneratorOption).toHaveBeenCalledWith({ generatorId: 'stepcat.tap-forge', optionId: 'jumps', value: 'many' });
    expect(props.onRemoveGenerator).toHaveBeenCalledWith('grooveworks.groove-lab');
  });

  it('shows what an internet generator gets and warns that the music is sent there before adding it', async () => {
    const props = renderGenerators();
    const dialog = lookUpGenerator('https://gen.beatsmith.example');
    expect(within(dialog).queryByRole('textbox', { name: 'Start command' })).toBeNull();
    await settle(() => { fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' })); });
    const confirmDialog = screen.getByRole('dialog', { name: 'Add “Beatsmith”?' });
    const gets = within(within(confirmDialog).getByRole('group', { name: 'What this generator gets' })).getAllByRole('listitem').map((item) => item.textContent);
    expect(gets).toEqual([...GENERATOR_GETS, GENERATOR_NEVER_GETS]);
    expect(within(confirmDialog).getByRole('note').textContent).toBe('Your music file will be sent to https://gen.beatsmith.example.');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Add' }));
    expect(props.onLookUpGenerator).toHaveBeenCalledWith({ address: 'https://gen.beatsmith.example', startCommand: null });
    expect(props.onAddGenerator).toHaveBeenCalledWith(FAKE_GENERATOR_PREVIEW);
  });

  it('offers the start command for a generator on this computer, and passes exactly what was typed', async () => {
    const localPreview = { ...FAKE_GENERATOR_PREVIEW, address: 'http://localhost:7700', location: { kind: 'this-computer' as const }, startCommand: 'C:/gen/start.cmd' };
    const props = renderGenerators({ onLookUpGenerator: vi.fn(() => Promise.resolve<GeneratorLookupResult>({ kind: 'found', generator: localPreview })) });
    const dialog = lookUpGenerator('http://localhost:7700');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Start command' }), { target: { value: '  C:/gen/start.cmd ' } });
    await settle(() => { fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' })); });
    expect(props.onLookUpGenerator).toHaveBeenCalledWith({ address: 'http://localhost:7700', startCommand: 'C:/gen/start.cmd' });
    const confirmDialog = screen.getByRole('dialog', { name: 'Add “Beatsmith”?' });
    expect(confirmDialog.textContent).toContain('It runs on this computer. Your music file stays here.');
    expect(confirmDialog.textContent).toContain('Sync starts it with C:/gen/start.cmd');
  });

  it('shows the section a pasted address belongs in, as the lookup says', async () => {
    renderGenerators({ onLookUpGenerator: () => Promise.resolve({ kind: 'failed', message: 'This is an addon, not a generator. Add it under Addons instead.' }) });
    const dialog = lookUpGenerator('https://addon.example.org');
    await settle(() => { fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' })); });
    expect(within(dialog).getByRole('alert').textContent).toBe('This is an addon, not a generator. Add it under Addons instead.');
  });

  it('makes a song with StepsVault’s generator by default, for a token, asking only for difficulties it makes', async () => {
    const props = renderGenerators({ stepsVaultGenerator: { ...FAKE_STEPSVAULT_GENERATOR, musicUploadWarning: null } });
    const setupDialog = await goToSetupStep();
    expect(within(setupDialog).getByRole('radio', { name: /dancedance.studio generator/ })).toHaveProperty('checked', true);
    expect(within(setupDialog).getAllByRole('checkbox').map((checkbox) => checkbox.parentElement?.textContent)).toEqual(['BBeginner', 'EEasy', 'MMedium', 'HHard', 'CChallenge']);
    fireEvent.click(within(setupDialog).getByRole('checkbox', { name: /Medium/ }));
    await settle(() => { fireEvent.click(within(setupDialog).getByRole('button', { name: 'Make the steps · 1 token' })); });
    expect(props.onMakeSong).toHaveBeenCalledWith({ musicId: 'picked-file', generatorId: STEPSVAULT_GENERATOR_ID, difficulties: ['Easy', 'Hard'], hasAgreedToMusicUpload: false });
    expect(screen.getByRole('dialog', { name: 'Making the steps' })).toBeDefined();
  });

  it('shows the player’s tokens, and with none left, says so and won’t make a StepsVault song', async () => {
    const props = renderGenerators({ stepsVaultGenerator: { ...FAKE_STEPSVAULT_GENERATOR, tokenCount: 0, musicUploadWarning: null } });
    const setupDialog = await goToSetupStep();
    expect(within(setupDialog).getByRole('radio', { name: /dancedance.studio generator/ }).closest('label')?.textContent).toContain('you have 0 tokens');
    expect(within(setupDialog).getByRole('alert').textContent).toContain('You’re out of tokens. Buy tokens, or pick a community generator.');
    expect(within(setupDialog).getByRole('link', { name: 'Buy tokens' }).getAttribute('href')).toBe('#tokens');
    expect(within(setupDialog).getByRole('button', { name: 'Make the steps · 1 token' })).toHaveProperty('disabled', true);
    fireEvent.click(within(setupDialog).getByRole('radio', { name: /Tap Forge/ }));
    expect(within(setupDialog).getByRole('button', { name: 'Make the steps' })).toHaveProperty('disabled', false);
    expect(props.onMakeSong).not.toHaveBeenCalled();
  });

  it('warns before the music goes to a generator on the internet, and keeps only difficulties it makes', async () => {
    const props = renderGenerators();
    const setupDialog = await goToSetupStep();
    fireEvent.click(within(setupDialog).getByRole('radio', { name: /Tap Forge/ }));
    expect(within(setupDialog).getAllByRole('checkbox')).toHaveLength(3);
    expect(within(setupDialog).queryByRole('note')).toBeNull();
    fireEvent.click(within(setupDialog).getByRole('radio', { name: /Groove Lab/ }));
    expect(within(setupDialog).getByRole('note').textContent).toBe('Your music file will be sent to https://gen.grooveworks.example.');
    await settle(() => { fireEvent.click(within(setupDialog).getByRole('button', { name: 'Make the steps' })); });
    expect(props.onMakeSong).toHaveBeenCalledWith({ musicId: 'picked-file', generatorId: 'grooveworks.groove-lab', difficulties: ['Easy', 'Medium', 'Hard'], hasAgreedToMusicUpload: true });
  });

  it('refuses to start without a difficulty, and shows why a song couldn’t start', async () => {
    const props = renderGenerators({ onMakeSong: vi.fn(() => Promise.resolve<MakeSongResult>({ kind: 'failed', message: 'Tap Forge doesn’t take audio/mp4 files. Pick an mp3, ogg or wav file.' })) });
    const setupDialog = await goToSetupStep();
    fireEvent.click(within(setupDialog).getByRole('radio', { name: /Tap Forge/ }));
    for (const checkbox of within(setupDialog).getAllByRole('checkbox')) fireEvent.click(checkbox);
    expect(within(setupDialog).getByRole('alert').textContent).toBe('Pick at least one difficulty.');
    expect(within(setupDialog).getByRole('button', { name: 'Make the steps' })).toHaveProperty('disabled', true);
    fireEvent.click(within(setupDialog).getByRole('checkbox', { name: /Easy/ }));
    await settle(() => { fireEvent.click(within(setupDialog).getByRole('button', { name: 'Make the steps' })); });
    expect(props.onMakeSong).toHaveBeenCalledTimes(1);
    expect(within(setupDialog).getByRole('alert').textContent).toContain('Pick an mp3, ogg or wav file.');
  });

  it('picks music from the music folders by searching them', async () => {
    const props = renderGenerators();
    fireEvent.click(screen.getByRole('button', { name: 'Make a song' }));
    fireEvent.click(screen.getByRole('tab', { name: 'My music folders' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search your music folders' }), { target: { value: 'night' } });
    await settle(() => { fireEvent.click(screen.getByRole('button', { name: 'Search' })); });
    expect(props.onSearchMusic).toHaveBeenCalledWith('night');
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Music in your folders' })).getByRole('radio', { name: /Paper Planes Club/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog', { name: 'Pick the generator and difficulties' }).textContent).toContain('Music: Paper Planes Club — Sora Vega');
  });

  it('draws a song source’s tab from its inputs, checks what the player types, and shows the found song to check', async () => {
    const props = renderGenerators();
    fireEvent.click(screen.getByRole('button', { name: 'Make a song' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Tube Songs' }));
    const linkField = screen.getByRole('textbox', { name: 'YouTube link' });
    fireEvent.change(linkField, { target: { value: 'https://evil-youtube.com/watch' } });
    expect(screen.getByRole('alert').textContent).toBe('Paste a link from youtube.com or youtu.be.');
    fireEvent.change(linkField, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Tube Songs sees what you type here.')).toBeDefined();
    await settle(() => { fireEvent.click(screen.getByRole('button', { name: 'Find the song' })); });
    expect(props.onFindSong).toHaveBeenCalledWith({ addonId: 'tube-songs', valuesByInputId: { link: 'https://youtu.be/dQw4w9WgXcQ' } });
    expect(screen.getByRole('group', { name: 'Is this the song?' }).textContent).toContain('Check it before you make it.');
    expect(screen.getByRole('group', { name: 'Is this the song?' }).textContent).toContain('Low Tide · Marla Quinn');
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, use it' }));
    expect(screen.getByRole('dialog', { name: 'Pick the generator and difficulties' }).textContent).toContain('Low Tide — Marla Quinn');
  });

  it('lets the player pick one of the songs a song source found, check it, or pick another', async () => {
    renderGenerators({ onFindSong: vi.fn(() => Promise.resolve<SongSourceSearchResult>({ kind: 'found', musics: FAKE_FOUND_MUSICS })) });
    fireEvent.click(screen.getByRole('button', { name: 'Make a song' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Tube Songs' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'YouTube link' }), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    await settle(() => { fireEvent.click(screen.getByRole('button', { name: 'Find the song' })); });
    const found = screen.getByRole('radiogroup', { name: 'Music found' });
    expect(within(found).getAllByRole('radio')).toHaveLength(3);
    fireEvent.click(within(found).getByRole('radio', { name: /Night Drive \(Live\)/ }));
    expect(screen.getByRole('group', { name: 'Is this the song?' }).textContent).toContain('Night Drive (Live) · Lumen Park');
    fireEvent.click(screen.getByRole('button', { name: 'Pick another' }));
    expect(within(screen.getByRole('radiogroup', { name: 'Music found' })).getByRole('radio', { name: /Night Drive \(Live\)/ })).toHaveProperty('checked', true);
  });

  it('shows the song source’s own sentence when it finds nothing, under the field it names when the input is refused', async () => {
    renderGenerators({ onFindSong: vi.fn(() => Promise.resolve<SongSourceSearchResult>({ kind: 'invalid-input', inputId: 'search', message: 'Make it shorter: at most 200 characters.' })) });
    fireEvent.click(screen.getByRole('button', { name: 'Make a song' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Tube Songs' }));
    await settle(() => { fireEvent.click(screen.getByRole('button', { name: 'Find the song' })); });
    expect(screen.getByRole('alert').textContent).toBe('Paste a link from youtube.com or youtu.be.');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Or search' }), { target: { value: 'low tide' } });
    await settle(() => { fireEvent.click(screen.getByRole('button', { name: 'Find the song' })); });
    expect(screen.getByRole('searchbox', { name: 'Or search' }).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Make it shorter: at most 200 characters.');
  });

  it('shows a job’s stage and lets the player cancel it, or answer the vault question', () => {
    const props = renderGenerators({ jobs: FAKE_GENERATOR_JOBS });
    const workingJob = screen.getByRole('listitem', { name: 'Night Drive' });
    expect(workingJob.textContent).toContain('Placing the steps');
    expect(within(workingJob).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('45');
    fireEvent.click(within(workingJob).getByRole('button', { name: 'Cancel Night Drive' }));
    const choiceJob = screen.getByRole('listitem', { name: 'Low Tide' });
    fireEvent.click(within(choiceJob).getByRole('button', { name: 'Use generated' }));
    expect(props.onCancelJob).toHaveBeenCalledWith('job-night-drive');
    expect(props.onAnswerVaultChoice).toHaveBeenCalledWith({ jobKey: 'job-low-tide', choice: 'keep-generated-song' });
  });

  it('shows the sentence when the generator can’t stop the job', () => {
    const job: GeneratorJobView = { ...FAKE_GENERATOR_JOBS[0] as GeneratorJobView, message: 'StepsVault generator couldn’t stop this song: it is already being made.' };
    renderGenerators({ jobs: [job] });
    expect(screen.getByRole('listitem', { name: 'Night Drive' }).textContent).toContain('couldn’t stop this song: it is already being made.');
  });

  it('shows how a generated song was made, as plain text', async () => {
    const props = renderGenerators();
    await settle(() => { fireEvent.click(screen.getByRole('button', { name: 'How it was made' })); });
    expect(props.onFetchSongReport).toHaveBeenCalledWith('song:paper planes club');
    expect(screen.getByLabelText('How Paper Planes Club was made').textContent).toBe('Made with onsets.');
  });

  it('says where a finished StepsVault song went', async () => {
    const doneJob: GeneratorJobView = { jobKey: 'job-1', songTitle: 'my new song', songArtist: 'Unknown artist', generatorName: 'StepsVault generator', isStepsVault: true, state: 'done', stageText: 'Done', progressPercent: null, message: null, vaultChoiceQuestion: null, doneText: 'Added to the library. It comes to your game, with your music, on your next sync.' };
    renderGenerators({ jobs: [doneJob], stepsVaultGenerator: { ...FAKE_STEPSVAULT_GENERATOR, musicUploadWarning: null } });
    const setupDialog = await goToSetupStep();
    await settle(() => { fireEvent.click(within(setupDialog).getByRole('button', { name: 'Make the steps · 1 token' })); });
    expect(screen.getByRole('dialog', { name: 'Your song is ready' }).textContent).toContain('Added to the library.');
  });
});

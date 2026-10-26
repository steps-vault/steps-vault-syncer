import { buildInstalledAddon, buildInstalledGenerator, withMusicUploadConsent, type AddonManifest, type GeneratedSong, type GeneratorManifest, type SavedGeneratorJob } from '@stepsvault/sync-core';
import { describe, expect, it } from 'vitest';
import { buildAddonInstallPreview, buildAddonView, buildSongSourceTabs } from './build-addon-views';
import { buildGeneratedSongViews, buildGeneratorInstallPreview, buildGeneratorJobView, buildGeneratorView } from './build-generator-views';
import { buildActivityEntries } from './build-sync-views';

const GENERATOR_MANIFEST: GeneratorManifest = {
  protocol: 1, kind: 'generator', id: 'stepcat.tap-forge', name: 'Tap Forge', version: '1.2.0', author: '@stepcat', description: 'Flowing steps.', difficulties: ['Easy', 'Medium', 'Hard'], musicTypes: ['audio/ogg'], usesVideo: false, maxMusicBytes: 1_000_000,
  options: [{ id: 'jumps', label: 'Jumps', kind: 'choice', choices: [{ value: 'few', label: 'Few' }, { value: 'many', label: 'Many' }], default: 'few' }],
};
const SONG_SOURCE_MANIFEST: AddonManifest = {
  protocol: 1, kind: 'addon', id: 'tube.songs', name: 'Tube Songs', version: '0.2.0', author: '@noa', description: '', provides: ['song-source'], options: [],
  inputs: [{ id: 'link', kind: 'link', label: 'YouTube link', placeholder: null, sites: ['youtube.com'] }],
};
const JOB: SavedGeneratorJob = {
  jobKey: 'job-1', generatorBaseUrl: 'http://127.0.0.1:7700', generatorId: 'stepcat.tap-forge', generatorName: 'Tap Forge', generatorVersion: '1.2.0', isStepsVault: false, jobId: 'a1', song: { title: 'Night Drive', artist: 'Lumen Park', album: null, genre: null, lengthSeconds: 201, youtubeId: null },
  difficulties: ['Easy'], state: 'waiting', progress: 0.456, stage: 'Placing the steps', retryAfterSeconds: 10, message: null, vaultChoice: null, result: null, playerMusicLocation: 'C:\\Music\\a.mp3', playerVideoLocation: null, collectedFilesLocation: null,
  startedAt: '2026-10-25T10:00:00.000Z', updatedAt: '2026-10-25T10:00:00.000Z',
};

describe('generator views', () => {
  it('shows where a generator runs, its options and whether the player still has to agree to send the music', () => {
    const localView = buildGeneratorView({ generator: buildInstalledGenerator({ baseUrl: 'http://127.0.0.1:7700', manifest: GENERATOR_MANIFEST, optionValues: { jumps: 'many' } }), startCommand: 'C:/tap-forge/start.cmd' });
    expect(localView).toMatchObject({ generatorId: 'stepcat.tap-forge', location: { kind: 'this-computer' }, startCommand: 'C:/tap-forge/start.cmd', difficulties: ['Easy', 'Medium', 'Hard'], musicUploadWarning: null, options: [{ optionId: 'jumps', value: 'many' }] });
    const remoteGenerator = buildInstalledGenerator({ baseUrl: 'https://gen.example.org', manifest: GENERATOR_MANIFEST });
    expect(buildGeneratorView({ generator: remoteGenerator })).toMatchObject({ location: { kind: 'internet', address: 'https://gen.example.org' }, startCommand: null, musicUploadWarning: 'Your music file will be sent to https://gen.example.org.' });
    expect(buildGeneratorView({ generator: withMusicUploadConsent({ generator: remoteGenerator, consentedAt: '2026-10-25T10:00:00.000Z' }) }).musicUploadWarning).toBeNull();
  });

  it('starts the confirm step at the defaults', () => {
    const preview = buildGeneratorInstallPreview({ address: 'https://gen.example.org/', baseUrl: 'https://gen.example.org', manifest: GENERATOR_MANIFEST, startCommand: null });
    expect(preview).toMatchObject({ address: 'https://gen.example.org/', location: { kind: 'internet', address: 'https://gen.example.org' }, options: [{ optionId: 'jumps', value: 'few' }] });
  });

  it.each([
    [{ state: 'sending' }, { state: 'working', stageText: 'Sending the music', progressPercent: null }],
    [{}, { state: 'working', stageText: 'Placing the steps', progressPercent: 46 }],
    [{ stage: null, progress: null }, { state: 'working', stageText: 'Waiting for Tap Forge', progressPercent: null }],
    [{ state: 'needs-vault-choice', vaultChoice: { vaultSongId: 'v1', question: 'Which one?' } }, { state: 'needs-vault-choice', vaultChoiceQuestion: 'Which one?' }],
    [{ state: 'done', result: 'written' }, { state: 'done', doneText: 'Added to My generated songs in your game.' }],
    [{ state: 'done', result: 'added-to-vault', isStepsVault: true }, { state: 'done', doneText: 'Added to the library. It comes to your game, with your music, on your next sync.' }],
    [{ state: 'failed', message: 'Tap Forge couldn’t make this song.' }, { state: 'failed', stageText: 'Not made', message: 'Tap Forge couldn’t make this song.' }],
  ] as [Partial<SavedGeneratorJob>, object][])('shows a job %j as %j', (overrides, expected) => {
    expect(buildGeneratorJobView({ ...JOB, ...overrides })).toMatchObject(expected);
  });

  it('lists generated songs newest first, with their folder and whether they say how they were made', () => {
    const generatedSong: GeneratedSong = { songKey: 'song:a', song: JOB.song, generatorId: 'stepcat.tap-forge', generatorVersion: '1.2.0', generatorName: 'Tap Forge', difficulties: ['Easy', 'Medium', 'Hard'], installId: 'i1', folderPath: ['My generated songs', 'Night Drive'], inPlaceOfVaultSongId: null, generatedAt: '2026-10-24T10:00:00.000Z' };
    const newerSong = { ...generatedSong, songKey: 'song:b', song: { ...JOB.song, title: 'Low Tide' }, generatedAt: '2026-10-25T10:00:00.000Z' };
    const views = buildGeneratedSongViews({ generatedSongs: [generatedSong, newerSong], reportSongKeys: new Set(['song:a']) });
    expect(views.map((view) => [view.title, view.hasReport])).toEqual([['Low Tide', false], ['Night Drive', true]]);
    expect(views[1]).toMatchObject({ difficultiesText: 'Easy, Medium, and Hard', folderText: 'Songs/My generated songs/Night Drive' });
  });

  it('tells each step of making a song in the Activity log', () => {
    const entries = buildActivityEntries({ vaultSongs: [], events: [
      { kind: 'generated-song', step: 'started', at: '2026-10-25T10:00:00.000Z', songTitle: 'Night Drive', generatorName: 'Tap Forge', folderPath: [] },
      { kind: 'generated-song', step: 'written', at: '2026-10-25T10:05:00.000Z', songTitle: 'Night Drive', generatorName: 'Tap Forge', folderPath: ['My generated songs', 'Night Drive'] },
      { kind: 'generated-song', step: 'failed', at: '2026-10-25T10:06:00.000Z', songTitle: 'Low Tide', generatorName: 'Tap Forge', folderPath: [], message: 'Tap Forge isn’t answering.' },
      { vaultSongId: 'v1', kind: 'added', at: '2026-10-25T10:07:00.000Z', folderPath: ['dancedance.studio', 'Paris'] },
    ] });
    expect(entries.map((entry) => [entry.kind, `${entry.textBefore}${entry.highlightedText}${entry.textAfter}`, entry.summaryText])).toEqual([
      ['added', 'Added Paris in dancedance.studio', 'Songs/dancedance.studio/Paris'],
      ['generate-failed', 'Couldn’t make Low Tide with Tap Forge', 'Tap Forge isn’t answering.'],
      ['generated', 'Made Night Drive in My generated songs', 'Songs/My generated songs/Night Drive'],
      ['generating', 'Started making Night Drive with Tap Forge', 'With Tap Forge'],
    ]);
  });
});

describe('song-source addon views', () => {
  it('says what a song source brings, never lists it as an audio source, and says it sees what the player types', () => {
    const addon = buildInstalledAddon({ baseUrl: 'http://127.0.0.1:7801', manifest: SONG_SOURCE_MANIFEST, consentedAt: '' });
    expect(buildAddonView(addon)).toMatchObject({ providesText: 'New songs to make', isAudioSource: false });
    expect(buildAddonView(buildInstalledAddon({ baseUrl: 'https://x.example', manifest: { ...SONG_SOURCE_MANIFEST, provides: ['audio-links', 'video-links', 'song-source'] }, consentedAt: '' }))).toMatchObject({ providesText: 'Audio and video links · New songs to make', isAudioSource: true });
    expect(buildAddonInstallPreview({ address: 'http://127.0.0.1:7801', manifest: SONG_SOURCE_MANIFEST, startCommand: 'start.cmd' })).toMatchObject({ seesWhatYouType: true, startCommand: 'start.cmd' });
  });

  it('gives each song source that is on a tab, drawn from its inputs', () => {
    const addon = buildInstalledAddon({ baseUrl: 'http://127.0.0.1:7801', manifest: SONG_SOURCE_MANIFEST, consentedAt: '' });
    expect(buildSongSourceTabs([addon, { ...addon, isEnabled: false }])).toEqual([{ addonId: 'tube.songs', name: 'Tube Songs', inputs: SONG_SOURCE_MANIFEST.inputs }]);
  });
});

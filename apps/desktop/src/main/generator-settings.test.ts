import { describe, expect, it } from 'vitest';
import { HttpRequestError, type HttpClient, type HttpRequest, type HttpResponse } from '@stepsvault/sync-core';
import { STEPSVAULT_GENERATOR_ID, type GeneratorInstallPreview } from '@stepsvault/sync-ui';
import { buildDefaultSettings, type DesktopSettings } from './desktop-settings';
import { GeneratorSettings, type StartCommandConfirmation } from './generator-settings';
import { LocalProgramStarter } from './local-program-starter';

const SITE_URL = 'https://stepsvault.example.com';
const STEPSVAULT_ADDRESS = `${SITE_URL}/api/generator`;
const MANIFEST_ANSWER = { protocol: 1, kind: 'generator', id: 'stepcat.tap-forge', name: 'Tap Forge', version: '1.2.0', author: '@stepcat', description: '', difficulties: ['Easy', 'Medium'], musicTypes: ['audio/ogg'], usesVideo: false, options: [] };

/** Manifests by address; every request is remembered with its headers. */
function buildManifestClient(manifestsByBaseUrl: Record<string, unknown>): { httpClient: HttpClient; requests: HttpRequest[] } {
  const requests: HttpRequest[] = [];
  const httpClient: HttpClient = {
    requestJson: (request) => {
      requests.push(request);
      const manifest = manifestsByBaseUrl[request.url.replace(/\/manifest\.json$/, '')];
      if (manifest === undefined) return Promise.reject(new HttpRequestError({ failure: 'network', message: 'offline' }));
      return Promise.resolve<HttpResponse<unknown>>({ status: 200, body: manifest });
    },
    requestText: () => Promise.reject(new Error('Not used.')),
    requestBytes: () => Promise.reject(new Error('Not used.')),
  };
  return { httpClient, requests };
}

function buildGeneratorSettings({ manifestsByBaseUrl = {}, isCommandAllowed = true, deviceToken = 'device-token-1' }: { manifestsByBaseUrl?: Record<string, unknown>; isCommandAllowed?: boolean; deviceToken?: string | null } = {}) {
  const state: { settings: DesktopSettings; confirmations: StartCommandConfirmation[] } = { settings: buildDefaultSettings(), confirmations: [] };
  const { httpClient, requests } = buildManifestClient(manifestsByBaseUrl);
  const starter = new LocalProgramStarter({ ports: { startProgram: () => ({ stop: () => Promise.resolve(), hasExited: () => false }), isAnswering: () => Promise.resolve(true), getNowMilliseconds: () => 0, waitMilliseconds: () => Promise.resolve() } });
  const generatorSettings = new GeneratorSettings({
    httpClient, starter, siteUrl: SITE_URL, getDeviceToken: () => deviceToken, getSettings: () => state.settings, saveSettings: (settings) => { state.settings = settings; return Promise.resolve(); },
    confirmStartCommand: (confirmation) => { state.confirmations.push(confirmation); return Promise.resolve(isCommandAllowed); }, getNow: () => '2026-10-25T10:00:00.000Z',
  });
  return { state, requests, generatorSettings };
}

async function addGenerator({ generatorSettings, address, startCommand = null }: { generatorSettings: GeneratorSettings; address: string; startCommand?: string | null }): Promise<GeneratorInstallPreview> {
  const result = await generatorSettings.lookUpGenerator({ address, startCommand });
  if (result.kind !== 'found') throw new Error(result.message);
  await generatorSettings.installGenerator(result.generator);
  return result.generator;
}

describe('GeneratorSettings', () => {
  it('signs in to StepsVault’s own generator at the site address, and to no other generator', async () => {
    const { generatorSettings, requests } = buildGeneratorSettings({ manifestsByBaseUrl: { [STEPSVAULT_ADDRESS]: { ...MANIFEST_ANSWER, id: 'stepsvault.generator' }, 'https://gen.example.org': MANIFEST_ANSWER } });
    await generatorSettings.loadStepsVaultGenerator();
    await addGenerator({ generatorSettings, address: 'https://gen.example.org' });
    expect(requests.map((request) => [request.url, request.headers?.Authorization ?? null])).toEqual([[`${STEPSVAULT_ADDRESS}/manifest.json`, 'Bearer device-token-1'], ['https://gen.example.org/manifest.json', null]]);
    expect(generatorSettings.findJobGenerator(STEPSVAULT_ADDRESS)).toMatchObject({ isStepsVault: true, signIn: { siteUrl: SITE_URL, deviceToken: 'device-token-1' }, generator: { manifest: { name: 'StepsVault generator' } } });
    expect(generatorSettings.findJobGenerator('https://gen.example.org')).toMatchObject({ isStepsVault: false, signIn: null });
    expect(generatorSettings.buildStepsVaultGeneratorView()).toMatchObject({ difficulties: ['Easy', 'Medium'], musicUploadWarning: `Your music file will be sent to StepsVault (${STEPSVAULT_ADDRESS}).` });
  });

  it('asks before the first StepsVault song and keeps the player’s agreement', async () => {
    const { generatorSettings, state } = buildGeneratorSettings({ manifestsByBaseUrl: { [STEPSVAULT_ADDRESS]: MANIFEST_ANSWER } });
    await expect(generatorSettings.getGeneratorForNewSong({ generatorId: STEPSVAULT_GENERATOR_ID, hasAgreedToMusicUpload: false })).rejects.toThrow('Agree to send your music to StepsVault first');
    const jobGenerator = await generatorSettings.getGeneratorForNewSong({ generatorId: STEPSVAULT_GENERATOR_ID, hasAgreedToMusicUpload: true });
    expect(state.settings.stepsVaultMusicUploadConsentedAt).toBe('2026-10-25T10:00:00.000Z');
    expect(jobGenerator.generator.musicUploadConsentedAt).toBe('2026-10-25T10:00:00.000Z');
    expect(generatorSettings.buildStepsVaultGeneratorView().musicUploadWarning).toBeNull();
  });

  it('says StepsVault can’t be reached, or that the player must sign in, before making a StepsVault song', async () => {
    await expect(buildGeneratorSettings().generatorSettings.getGeneratorForNewSong({ generatorId: STEPSVAULT_GENERATOR_ID, hasAgreedToMusicUpload: true })).rejects.toThrow('StepsVault can’t be reached right now.');
    await expect(buildGeneratorSettings({ deviceToken: null }).generatorSettings.getGeneratorForNewSong({ generatorId: STEPSVAULT_GENERATOR_ID, hasAgreedToMusicUpload: true })).rejects.toThrow('Sign in to StepsVault first');
  });

  it('keeps the music upload consent of an internet generator from the moment it was added', async () => {
    const { generatorSettings, state } = buildGeneratorSettings({ manifestsByBaseUrl: { 'https://gen.example.org': MANIFEST_ANSWER, 'http://127.0.0.1:7700': { ...MANIFEST_ANSWER, id: 'home.steps' } } });
    await addGenerator({ generatorSettings, address: 'https://gen.example.org' });
    await addGenerator({ generatorSettings, address: 'http://127.0.0.1:7700' });
    expect(state.settings.generators.map((generator) => [generator.manifest.id, generator.musicUploadConsentedAt])).toEqual([['stepcat.tap-forge', '2026-10-25T10:00:00.000Z'], ['home.steps', null]]);
  });

  it('runs a start command only after the player allowed it in the app’s own dialog, and saves it with the generator', async () => {
    const { generatorSettings, state } = buildGeneratorSettings({ manifestsByBaseUrl: { 'http://127.0.0.1:7700': MANIFEST_ANSWER } });
    const preview = await addGenerator({ generatorSettings, address: 'http://127.0.0.1:7700', startCommand: 'C:/gen/start.cmd' });
    expect(state.confirmations).toEqual([{ address: 'http://127.0.0.1:7700', command: 'C:/gen/start.cmd', folder: 'C:/gen' }]);
    expect(preview.startCommand).toBe('C:/gen/start.cmd');
    expect(state.settings.startCommandsByBaseUrl).toEqual({ 'http://127.0.0.1:7700': 'C:/gen/start.cmd' });
    await generatorSettings.removeGenerator('stepcat.tap-forge');
    expect(state.settings.startCommandsByBaseUrl).toEqual({});
  });

  it('refuses a start command the player didn’t allow, or one for an address on the internet', async () => {
    const declined = buildGeneratorSettings({ isCommandAllowed: false, manifestsByBaseUrl: { 'http://127.0.0.1:7700': MANIFEST_ANSWER } });
    expect(await declined.generatorSettings.lookUpGenerator({ address: 'http://127.0.0.1:7700', startCommand: 'C:/gen/start.cmd' })).toEqual({ kind: 'failed', message: 'You didn’t allow Sync to run that command. Start the program yourself, or add it without a start command.' });
    const remote = buildGeneratorSettings({ manifestsByBaseUrl: { 'https://gen.example.org': MANIFEST_ANSWER } });
    expect(await remote.generatorSettings.lookUpGenerator({ address: 'https://gen.example.org', startCommand: 'calc.exe' })).toMatchObject({ kind: 'failed', message: 'A start command is only for a program on this computer, at http://127.0.0.1 or http://localhost.' });
    expect(remote.state.confirmations).toEqual([]);
  });

  it('points an addon’s address to the Addons section', async () => {
    const { generatorSettings } = buildGeneratorSettings({ manifestsByBaseUrl: { 'https://addon.example.org': { protocol: 1, kind: 'addon', id: 'indie.tapes', name: 'Indie Tapes', version: '1', author: 'a', provides: ['audio-links'] } } });
    expect(await generatorSettings.lookUpGenerator({ address: 'https://addon.example.org', startCommand: null })).toEqual({ kind: 'failed', message: 'This is an addon, not a generator. Add it under Addons instead.' });
  });

  it('changes a generator’s option only to a choice it declares', async () => {
    const options = [{ id: 'jumps', label: 'Jumps', kind: 'choice', choices: [{ value: 'few', label: 'Few' }, { value: 'many', label: 'Many' }], default: 'few' }];
    const { generatorSettings, state } = buildGeneratorSettings({ manifestsByBaseUrl: { 'http://127.0.0.1:7700': { ...MANIFEST_ANSWER, options } } });
    await addGenerator({ generatorSettings, address: 'http://127.0.0.1:7700' });
    await generatorSettings.setGeneratorOption({ generatorId: 'stepcat.tap-forge', optionId: 'jumps', value: 'many' });
    await generatorSettings.setGeneratorOption({ generatorId: 'stepcat.tap-forge', optionId: 'jumps', value: 'all-of-them' });
    expect(state.settings.generators[0]?.optionValues).toEqual({ jumps: 'many' });
  });
});

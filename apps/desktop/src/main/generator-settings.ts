import {
  buildInstalledGenerator,
  fetchGeneratorManifest,
  getAddonOptionValues,
  getMusicUploadWarningOrNull,
  getServiceBaseUrl,
  GENERATOR_DIFFICULTIES,
  isGeneratorOnThisComputer,
  isOnThisComputer,
  MAX_GENERATOR_MUSIC_BYTES,
  withAddonOptionValue,
  withMusicUploadConsent,
  type GeneratorManifest,
  type GeneratorSignIn,
  type HttpClient,
  type InstalledGenerator,
} from '@stepsvault/sync-core';
import { buildGeneratorInstallPreview, getAddonOptionValuesFromViews, STEPSVAULT_GENERATOR_ID, type GeneratorInstallPreview, type GeneratorLookupResult, type ServiceLookupRequest, type StepsVaultGeneratorView } from '@stepsvault/sync-ui';
import type { DesktopSettings } from './desktop-settings';
import type { JobGenerator } from './generator-job-runner';
import { getStartCommandFolder, type LocalProgramStarter } from './local-program-starter';

const STEPSVAULT_GENERATOR_PATH = '/api/generator';
const STEPSVAULT_GENERATOR_NAME = 'StepsVault generator';

/** What the player sees in the app's own dialog before Sync may run a command. */
export interface StartCommandConfirmation {
  address: string;
  command: string;
  folder: string;
}

export interface GeneratorSettingsOptions {
  httpClient: HttpClient;
  starter: LocalProgramStarter;
  siteUrl: string;
  getDeviceToken(): string | null;
  getSettings(): DesktopSettings;
  saveSettings(settings: DesktopSettings): Promise<void>;
  confirmStartCommand(confirmation: StartCommandConfirmation): Promise<boolean>;
  getNow(): string;
}

/**
 * The player's generators: StepsVault's own (built in, signed in with the device token, always first) and the community
 * generators they added, with the music upload consent kept per generator, and the start commands of programs on this
 * computer.
 */
export class GeneratorSettings {
  private readonly options: GeneratorSettingsOptions;
  private readonly stepsVaultBaseUrl: string;
  private stepsVaultManifest: GeneratorManifest | null = null;
  private readonly lookedUpGeneratorsByAddress = new Map<string, { baseUrl: string; manifest: GeneratorManifest; startCommand: string | null }>();

  constructor(options: GeneratorSettingsOptions) {
    this.options = options;
    this.stepsVaultBaseUrl = getServiceBaseUrl({ address: `${options.siteUrl.replace(/\/+$/, '')}${STEPSVAULT_GENERATOR_PATH}`, serviceName: 'generator' });
  }

  /** Reads what StepsVault's generator makes; while it can't be reached, the screens say so. */
  async loadStepsVaultGenerator(): Promise<void> {
    const signIn = this.getStepsVaultSignIn();
    if (!signIn) return;
    const answer = await fetchGeneratorManifest({ httpClient: this.options.httpClient, address: this.stepsVaultBaseUrl, signIn }).catch(() => null);
    if (answer) this.stepsVaultManifest = answer.manifest;
  }

  buildStepsVaultGeneratorView(): StepsVaultGeneratorView {
    const hasConsent = this.options.getSettings().stepsVaultMusicUploadConsentedAt !== null;
    return { tokenCount: null, tokensHref: `${this.options.siteUrl}/tokens`, difficulties: this.stepsVaultManifest?.difficulties ?? null, musicUploadWarning: hasConsent ? null : `Your music file will be sent to StepsVault (${this.stepsVaultBaseUrl}).` };
  }

  /** The generator a job was started with. The sign-in goes to StepsVault's own generator only. */
  findJobGenerator(baseUrl: string): JobGenerator | null {
    if (baseUrl === this.stepsVaultBaseUrl) return { generator: this.buildStepsVaultGenerator(this.stepsVaultManifest ?? buildStepsVaultFallbackManifest()), signIn: this.getStepsVaultSignIn(), isStepsVault: true };
    const generator = this.options.getSettings().generators.find((candidate) => candidate.baseUrl === baseUrl);
    return generator ? { generator, signIn: null, isStepsVault: false } : null;
  }

  /** The generator for a new song, after the player agreed to send their music to it when it is on another computer. */
  async getGeneratorForNewSong({ generatorId, hasAgreedToMusicUpload }: { generatorId: string; hasAgreedToMusicUpload: boolean }): Promise<JobGenerator> {
    if (generatorId === STEPSVAULT_GENERATOR_ID) return this.getStepsVaultGeneratorForNewSong(hasAgreedToMusicUpload);
    const settings = this.options.getSettings();
    const generator = settings.generators.find((candidate) => candidate.manifest.id === generatorId);
    if (!generator) throw new Error('That generator isn’t set up any more. Add it again under Generators.');
    if (getMusicUploadWarningOrNull(generator) !== null) {
      if (!hasAgreedToMusicUpload) throw new Error(`Agree to send your music to ${generator.baseUrl} first, or use a generator on this computer.`);
      await this.saveGenerator(withMusicUploadConsent({ generator, consentedAt: this.options.getNow() }));
    }
    return { generator: this.options.getSettings().generators.find((candidate) => candidate.manifest.id === generatorId) ?? generator, signIn: null, isStepsVault: false };
  }

  async lookUpGenerator({ address, startCommand }: ServiceLookupRequest): Promise<GeneratorLookupResult> {
    try {
      const confirmedCommand = startCommand === null ? null : await this.confirmStartCommand({ baseUrl: getServiceBaseUrl({ address, serviceName: 'generator' }), command: startCommand });
      const { baseUrl, manifest } = await fetchGeneratorManifest({ httpClient: this.options.httpClient, address });
      if (baseUrl === this.stepsVaultBaseUrl) throw new Error('This is StepsVault’s own generator. It is always there, at the top of Generators.');
      this.lookedUpGeneratorsByAddress.set(address, { baseUrl, manifest, startCommand: confirmedCommand });
      return { kind: 'found', generator: buildGeneratorInstallPreview({ address, baseUrl, manifest, startCommand: confirmedCommand }) };
    } catch (error) {
      this.applyStartCommands();
      return { kind: 'failed', message: error instanceof Error ? error.message : 'No generator answered at this address. Check the address and that the generator is running.' };
    }
  }

  /** Adding an internet generator after its confirm step is the player's agreement to send it their music. */
  async installGenerator(preview: GeneratorInstallPreview): Promise<void> {
    const lookedUp = this.lookedUpGeneratorsByAddress.get(preview.address);
    if (!lookedUp) return;
    const generator = buildInstalledGenerator({ baseUrl: lookedUp.baseUrl, manifest: lookedUp.manifest, optionValues: getAddonOptionValuesFromViews(preview.options) });
    const generatorWithConsent = isGeneratorOnThisComputer(generator) ? generator : withMusicUploadConsent({ generator, consentedAt: this.options.getNow() });
    const settings = this.options.getSettings();
    const generators = [...settings.generators.filter((existing) => existing.manifest.id !== generator.manifest.id), generatorWithConsent];
    await this.options.saveSettings(this.withStartCommand({ settings: { ...settings, generators }, baseUrl: lookedUp.baseUrl, startCommand: lookedUp.startCommand }));
  }

  async removeGenerator(generatorId: string): Promise<void> {
    const settings = this.options.getSettings();
    await this.saveWithoutUnusedStartCommands({ ...settings, generators: settings.generators.filter((generator) => generator.manifest.id !== generatorId) });
  }

  async removeAddon(addonId: string): Promise<void> {
    const settings = this.options.getSettings();
    await this.saveWithoutUnusedStartCommands({ ...settings, addons: settings.addons.filter((addon) => addon.manifest.id !== addonId) });
  }

  async setGeneratorOption({ generatorId, optionId, value }: { generatorId: string; optionId: string; value: string }): Promise<void> {
    const generator = this.options.getSettings().generators.find((candidate) => candidate.manifest.id === generatorId);
    if (!generator) return;
    const values = getAddonOptionValues({ options: generator.manifest.options, savedValues: generator.optionValues });
    await this.saveGenerator({ ...generator, optionValues: withAddonOptionValue({ options: generator.manifest.options, values, optionId, value }) });
  }

  /**
   * Asks the player, in the app's own dialog, before Sync may ever run a command. The window only passes the text; it
   * can't run anything without the player's yes here. A command already saved for this address isn't asked again.
   */
  async confirmStartCommand({ baseUrl, command }: { baseUrl: string; command: string }): Promise<string> {
    if (!isOnThisComputer(baseUrl)) throw new Error('A start command is only for a program on this computer, at http://127.0.0.1 or http://localhost.');
    const isAlreadySaved = this.options.getSettings().startCommandsByBaseUrl[baseUrl] === command;
    if (!isAlreadySaved && !(await this.options.confirmStartCommand({ address: baseUrl, command, folder: getStartCommandFolder(command) }))) {
      throw new Error('You didn’t allow Sync to run that command. Start the program yourself, or add it without a start command.');
    }
    this.options.starter.setStartCommand({ baseUrl, command });
    return command;
  }

  /** The starter knows exactly the saved commands again, dropping one that was only being tried out. */
  applyStartCommands(): void {
    this.options.starter.replaceStartCommands(this.options.getSettings().startCommandsByBaseUrl);
  }

  withStartCommand({ settings, baseUrl, startCommand }: { settings: DesktopSettings; baseUrl: string; startCommand: string | null }): DesktopSettings {
    if (startCommand === null) return settings;
    return { ...settings, startCommandsByBaseUrl: { ...settings.startCommandsByBaseUrl, [baseUrl]: startCommand } };
  }

  private async getStepsVaultGeneratorForNewSong(hasAgreedToMusicUpload: boolean): Promise<JobGenerator> {
    const signIn = this.getStepsVaultSignIn();
    if (!signIn) throw new Error('Sign in to StepsVault first, so the song can go to your vault.');
    if (!this.stepsVaultManifest) await this.loadStepsVaultGenerator();
    if (!this.stepsVaultManifest) throw new Error('StepsVault can’t be reached right now. Check your internet connection, then try again.');
    const settings = this.options.getSettings();
    if (settings.stepsVaultMusicUploadConsentedAt === null) {
      if (!hasAgreedToMusicUpload) throw new Error('Agree to send your music to StepsVault first, or use a generator on this computer.');
      await this.options.saveSettings({ ...settings, stepsVaultMusicUploadConsentedAt: this.options.getNow() });
    }
    return { generator: this.buildStepsVaultGenerator(this.stepsVaultManifest), signIn, isStepsVault: true };
  }

  private buildStepsVaultGenerator(manifest: GeneratorManifest): InstalledGenerator {
    const generator = buildInstalledGenerator({ baseUrl: this.stepsVaultBaseUrl, manifest: { ...manifest, name: STEPSVAULT_GENERATOR_NAME } });
    const consentedAt = this.options.getSettings().stepsVaultMusicUploadConsentedAt;
    return consentedAt === null ? generator : withMusicUploadConsent({ generator, consentedAt });
  }

  private getStepsVaultSignIn(): GeneratorSignIn | null {
    const deviceToken = this.options.getDeviceToken();
    return deviceToken === null ? null : { siteUrl: this.options.siteUrl, deviceToken };
  }

  private async saveGenerator(generator: InstalledGenerator): Promise<void> {
    const settings = this.options.getSettings();
    await this.options.saveSettings({ ...settings, generators: settings.generators.map((existing) => (existing.manifest.id === generator.manifest.id ? generator : existing)) });
  }

  /** A start command stays only while an addon or generator at its address does. */
  private async saveWithoutUnusedStartCommands(settings: DesktopSettings): Promise<void> {
    const usedBaseUrls = new Set([...settings.addons.map((addon) => addon.baseUrl), ...settings.generators.map((generator) => generator.baseUrl)]);
    const startCommandsByBaseUrl = Object.fromEntries(Object.entries(settings.startCommandsByBaseUrl).filter(([baseUrl]) => usedBaseUrls.has(baseUrl)));
    await this.options.saveSettings({ ...settings, startCommandsByBaseUrl });
    this.applyStartCommands();
  }
}

/** Enough to go on asking about a StepsVault job after a restart, before StepsVault's manifest is read again. */
function buildStepsVaultFallbackManifest(): GeneratorManifest {
  return { protocol: 1, kind: 'generator', id: 'stepsvault.generator', name: STEPSVAULT_GENERATOR_NAME, version: '', author: 'StepsVault', description: '', options: [], difficulties: GENERATOR_DIFFICULTIES, musicTypes: ['audio/ogg'], usesVideo: false, maxMusicBytes: MAX_GENERATOR_MUSIC_BYTES };
}

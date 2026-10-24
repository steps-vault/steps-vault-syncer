import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildEmptyInstalledSongsRecord,
  buildInstalledAddon,
  fetchAddonManifest,
  getPlayerGroupNames,
  pollDeviceSignIn,
  runSync,
  scanMusicLibrary,
  SignedOutError,
  startDeviceSignIn,
  StepsVaultClient,
  type AddonManifest,
  type FolderLayout,
  type InstalledSongsRecord,
  type MusicIndex,
  type SyncOutcome,
  type SyncPorts,
} from '@stepsvault/sync-core';
import type { AddonInstallPreview, AddonLookupResult, SongAction } from '@stepsvault/sync-ui';
import type { DesktopSignIn, DesktopSyncBridge, DesktopSyncState } from '../shared/bridge-types';
import type { AudioBridge } from './audio-bridge';
import { buildDefaultSettings, parseSettings, withActivity, type DesktopSettings } from './desktop-settings';
import type { DeviceTokenStore } from './device-token-store';
import { findInstalledGames, getInstallParentFolders, type FoundGame } from './game-detection';
import { JsonFileStore } from './json-file-store';
import { MusicSourceRegistry } from './music-source-registry';
import { NodeHttpClient } from './node-http-client';
import { NodeMusicLibrary } from './node-music-library';
import { NodeSongsFolder } from './node-songs-folder';
import { buildActivityEntries, buildLayoutViews, buildSongDetailsById, buildSongRows, getTrayStatus } from './view-models';

const MAX_ADDON_FILE_BYTES = 200 * 1024 * 1024;
const ADDON_DOWNLOAD_TIMEOUT_MILLISECONDS = 120_000;
const MAX_ACTIVITY_IN_COPY = 50;

/** What the controller needs from Electron, passed in so the controller itself stays plain Node. */
export interface DesktopServices {
  chooseFolder(title: string): Promise<string | null>;
  chooseAudioFile(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  writeClipboard(text: string): void;
  isGameRunning(): Promise<boolean>;
  /** Quits and runs the downloaded installer. */
  installUpdate(): void;
}

export interface SyncControllerOptions {
  dataFolder: string;
  appDataFolder: string;
  siteUrl: string;
  appVersion: string;
  computerName: string;
  systemName: string;
  tokenStore: DeviceTokenStore;
  audioBridge: AudioBridge;
  services: DesktopServices;
  onStateChange: (state: DesktopSyncState) => void;
}

/** The app's brain: it owns the settings, the record and the token, runs syncs, and builds what the window shows. */
export class SyncController implements Omit<DesktopSyncBridge, 'onState'> {
  private readonly options: SyncControllerOptions;
  private readonly httpClient: NodeHttpClient;
  private readonly musicSources = new MusicSourceRegistry();
  private readonly settingsStore: JsonFileStore<DesktopSettings>;
  private readonly recordStore: JsonFileStore<InstalledSongsRecord>;
  private settings: DesktopSettings = buildDefaultSettings();
  private record: InstalledSongsRecord = buildEmptyInstalledSongsRecord();
  private deviceToken: string | null = null;
  private signIn: DesktopSignIn = { kind: 'signed-out' };
  private foundGames: FoundGame[] = [];
  private musicIndex: MusicIndex | null = null;
  private scannedFileCount: number | null = null;
  private lastOutcome: SyncOutcome | null = null;
  private playerGroupNames: string[] = [];
  private syncRun: DesktopSyncState['syncRun'] = null;
  private finishedSync: DesktopSyncState['finishedSync'] = null;
  private lastLayoutMove: DesktopSyncState['lastLayoutMove'] = null;
  private problem: string | null = null;
  private readyUpdateVersion: string | null = null;
  private dismissedUpdateVersion: string | null = null;
  private readonly addonNamesBySourceId = new Map<string, string>();
  private readonly lookedUpAddonsByAddress = new Map<string, { baseUrl: string; manifest: AddonManifest }>();

  constructor(options: SyncControllerOptions) {
    this.options = options;
    this.httpClient = new NodeHttpClient({ appVersion: options.appVersion });
    this.settingsStore = new JsonFileStore({ filePath: path.join(options.dataFolder, 'settings.json'), buildDefault: buildDefaultSettings, parse: parseSettings });
    this.recordStore = new JsonFileStore({ filePath: path.join(options.dataFolder, 'installed-songs.json'), buildDefault: buildEmptyInstalledSongsRecord, parse: (value) => value as InstalledSongsRecord });
  }

  async initialize(): Promise<void> {
    [this.settings, this.record, this.deviceToken] = await Promise.all([this.settingsStore.load(), this.recordStore.load(), this.options.tokenStore.load()]);
    if (this.deviceToken) this.signIn = { kind: 'signed-in', computerName: this.options.computerName };
    for (const filePath of Object.values(this.settings.pickedFilePathsBySongId)) this.musicSources.register(filePath);
    this.foundGames = await findInstalledGames({ parentFolders: getInstallParentFolders({ appDataFolder: this.options.appDataFolder }) });
    this.publish();
    await this.scanMusic();
  }

  get isReadyToSync(): boolean {
    return this.deviceToken !== null && this.settings.game !== null;
  }

  get isBackgroundSyncOn(): boolean {
    return this.settings.isBackgroundSyncOn;
  }

  getState(): Promise<DesktopSyncState> {
    return Promise.resolve(this.buildState());
  }

  async startSignIn(): Promise<void> {
    const device = { deviceName: this.options.computerName, operatingSystem: this.options.systemName, appVersion: this.options.appVersion };
    const deviceCode = await startDeviceSignIn({ httpClient: this.httpClient, siteUrl: this.options.siteUrl, device }).catch(() => null);
    if (!deviceCode) {
      this.problem = 'StepsVault can’t be reached right now. Check your internet connection, then choose "Get a new code".';
      this.publish();
      return;
    }
    this.problem = null;
    this.signIn = { kind: 'waiting-for-code', code: deviceCode.code, expiresAt: deviceCode.expiresAt, computerName: this.options.computerName, systemName: this.options.systemName };
    this.publish();
    void this.waitForSignIn({ pollingId: deviceCode.pollingId, intervalSeconds: deviceCode.pollIntervalSeconds });
  }

  async openLinkPage(): Promise<void> {
    await this.options.services.openExternal(`${this.options.siteUrl}/link`);
  }

  async useFoundGame(gameId: string): Promise<void> {
    const game = this.foundGames.find((candidate) => candidate.gameId === gameId);
    if (game) await this.connectGame({ gameName: game.gameName, songsFolderPath: game.songsFolderPath });
  }

  async chooseSongsFolder(): Promise<void> {
    const folder = await this.options.services.chooseFolder('Choose your StepMania Songs folder');
    if (folder) await this.connectGame({ gameName: 'StepMania', songsFolderPath: folder });
  }

  async addMusicFolder(): Promise<void> {
    const folder = await this.options.services.chooseFolder('Choose a folder with your music');
    if (!folder || this.settings.musicFolders.includes(folder)) return;
    await this.saveSettings({ ...this.settings, musicFolders: [...this.settings.musicFolders, folder] });
    await this.scanMusic();
    await this.syncNow();
  }

  async removeMusicFolder(folderPath: string): Promise<void> {
    await this.saveSettings({ ...this.settings, musicFolders: this.settings.musicFolders.filter((folder) => folder !== folderPath) });
    await this.scanMusic();
  }

  async scanMusicAgain(): Promise<void> {
    await this.scanMusic();
    await this.syncNow();
  }

  /** One sync at a time; a request while one runs is simply ignored (the running one is enough). */
  async syncNow(): Promise<void> {
    if (this.syncRun || !this.isReadyToSync) return;
    if (await this.options.services.isGameRunning()) {
      this.problem = 'StepMania is running. Close it so Sync can write your songs, then sync again.';
      this.publish();
      return;
    }
    this.syncRun = { currentSongNumber: 0, totalSongCount: 0, currentStepText: 'Reading your vault…' };
    this.problem = null;
    this.publish();
    try {
      await this.runOneSync();
    } catch (error) {
      await this.handleSyncError(error);
    } finally {
      this.syncRun = null;
      this.publish();
    }
  }

  dismissFinishedSync(): Promise<void> {
    this.finishedSync = null;
    this.publish();
    return Promise.resolve();
  }

  async setBackgroundSync(isOn: boolean): Promise<void> {
    await this.saveSettings({ ...this.settings, isBackgroundSyncOn: isOn });
  }

  async runSongAction({ vaultSongId, action }: { vaultSongId: string; action: SongAction }): Promise<void> {
    if (action === 'choose-audio' || action === 'use-different-file') {
      const filePath = await this.options.services.chooseAudioFile();
      if (!filePath) return;
      this.musicSources.register(filePath);
      await this.saveSettings({ ...this.settings, pickedFilePathsBySongId: { ...this.settings.pickedFilePathsBySongId, [vaultSongId]: filePath } });
    } else {
      await this.saveSettings(withSongChoice({ settings: this.settings, vaultSongId, action }));
    }
    await this.syncNow();
  }

  async lookUpAddon(address: string): Promise<AddonLookupResult> {
    try {
      const { baseUrl, manifest } = await fetchAddonManifest({ httpClient: this.httpClient, address });
      this.lookedUpAddonsByAddress.set(address, { baseUrl, manifest });
      return { kind: 'found', addon: { address, name: manifest.name, version: manifest.version, author: manifest.author } };
    } catch (error) {
      return { kind: 'failed', message: error instanceof Error ? error.message : 'No addon answered at this address.' };
    }
  }

  async installAddon(preview: AddonInstallPreview): Promise<void> {
    const lookedUp = this.lookedUpAddonsByAddress.get(preview.address);
    if (!lookedUp) return;
    const addon = buildInstalledAddon({ ...lookedUp, consentedAt: new Date().toISOString() });
    await this.saveSettings({ ...this.settings, addons: [...this.settings.addons.filter((existing) => existing.manifest.id !== addon.manifest.id), addon] });
    await this.syncNow();
  }

  async setAddonEnabled({ addonId, isEnabled }: { addonId: string; isEnabled: boolean }): Promise<void> {
    await this.saveSettings({ ...this.settings, addons: this.settings.addons.map((addon) => (addon.manifest.id === addonId ? { ...addon, isEnabled } : addon)) });
  }

  async removeAddon(addonId: string): Promise<void> {
    await this.saveSettings({ ...this.settings, addons: this.settings.addons.filter((addon) => addon.manifest.id !== addonId) });
  }

  async setLayout(layout: FolderLayout): Promise<void> {
    await this.saveSettings({ ...this.settings, layout });
    const movedBefore = this.settings.activity.length;
    await this.syncNow();
    const movedSongCount = this.settings.activity.slice(movedBefore).filter((event) => event.kind === 'moved').length;
    this.lastLayoutMove = { layout, movedSongCount };
    this.publish();
  }

  copyActivityDetails(): Promise<void> {
    const lines = this.settings.activity.slice(-MAX_ACTIVITY_IN_COPY).map((event) => `${event.at} ${event.kind} ${event.folderPath.join('/')}${event.message ? ` — ${event.message}` : ''}`);
    this.options.services.writeClipboard([`StepsVault Sync ${this.options.appVersion}`, ...lines].join('\n'));
    return Promise.resolve();
  }

  /** Called when a new version finished downloading. */
  setUpdateReady(version: string): void {
    this.readyUpdateVersion = version;
    this.publish();
  }

  /** Never in the middle of a sync: a half-done sync could leave a song half written. */
  async restartToUpdate(): Promise<void> {
    while (this.syncRun) await delay(1000);
    this.options.services.installUpdate();
  }

  dismissUpdate(): Promise<void> {
    this.dismissedUpdateVersion = this.readyUpdateVersion;
    this.publish();
    return Promise.resolve();
  }

  private async runOneSync(): Promise<void> {
    const outcome = await runSync({ ports: this.buildPorts(), settings: this.buildSyncSettings(), onPhase: (phase) => {
      this.syncRun = phase.kind === 'reading-vault'
        ? { currentSongNumber: 0, totalSongCount: 0, currentStepText: 'Reading your vault…' }
        : phase.kind === 'finding-audio'
          ? { currentSongNumber: phase.doneSongCount + 1, totalSongCount: phase.totalSongCount, currentStepText: 'Finding audio and checking it’s the same edit' }
          : { currentSongNumber: phase.progress.doneSongCount, totalSongCount: phase.progress.totalSongCount, currentStepText: 'Writing to your game' };
      this.publish();
    } });
    this.lastOutcome = outcome;
    this.record = outcome.record;
    this.playerGroupNames = this.settings.game ? await getPlayerGroupNames({ songsFolder: this.buildSongsFolder(), record: this.record }) : [];
    const songPlans = outcome.finalPlan.songPlans;
    this.finishedSync = { syncedCount: songPlans.filter((songPlan) => songPlan.status === 'synced').length, needsYouCount: songPlans.filter((songPlan) => songPlan.status !== 'synced').length };
    await this.saveSettings(withSettledChoices({ settings: withActivity({ settings: { ...this.settings, lastSyncAt: new Date().toISOString() }, events: outcome.events }), outcome }));
    await this.reportSeen(outcome);
  }

  private async handleSyncError(error: unknown): Promise<void> {
    if (error instanceof SignedOutError) {
      this.deviceToken = null;
      this.signIn = { kind: 'signed-out' };
      await this.options.tokenStore.clear();
    }
    this.problem = error instanceof Error ? error.message : 'The sync stopped. Try again in a minute.';
  }

  private async reportSeen(outcome: SyncOutcome): Promise<void> {
    const songCountsByStatus: Record<string, number> = {};
    for (const songPlan of outcome.finalPlan.songPlans) songCountsByStatus[songPlan.status] = (songCountsByStatus[songPlan.status] ?? 0) + 1;
    await this.buildClient().reportSeen({ songCountsByStatus, gameName: this.settings.game?.gameName ?? null }).catch(() => undefined);
  }

  private async waitForSignIn({ pollingId, intervalSeconds }: { pollingId: string; intervalSeconds: number }): Promise<void> {
    while (this.signIn.kind === 'waiting-for-code') {
      await delay(intervalSeconds * 1000);
      const poll = await pollDeviceSignIn({ httpClient: this.httpClient, siteUrl: this.options.siteUrl, pollingId }).catch(() => ({ status: 'waiting' as const }));
      if (poll.status === 'waiting') continue;
      if (poll.status === 'expired') {
        this.signIn = { kind: 'signed-out' };
        this.problem = 'The code expired. Choose "Get a new code" and type it on stepsvault.com/link.';
      } else {
        this.deviceToken = poll.deviceToken;
        await this.options.tokenStore.save(poll.deviceToken);
        this.signIn = { kind: 'signed-in', computerName: poll.deviceName };
      }
      this.publish();
    }
    await this.syncNow();
  }

  private async connectGame(game: { gameName: string; songsFolderPath: string }): Promise<void> {
    await this.saveSettings({ ...this.settings, game });
    await this.syncNow();
  }

  private async scanMusic(): Promise<void> {
    this.scannedFileCount = 0;
    this.publish();
    this.musicIndex = await scanMusicLibrary({
      musicLibrary: new NodeMusicLibrary({ musicFolders: this.settings.musicFolders, musicSources: this.musicSources }),
      onProgress: ({ scannedFileCount }) => {
        this.scannedFileCount = scannedFileCount;
        this.publish();
      },
    });
    this.publish();
  }

  private buildPorts(): SyncPorts {
    return {
      songsFolder: this.buildSongsFolder(),
      vault: this.buildClient(),
      recordStore: this.recordStore,
      httpClient: this.httpClient,
      checkAudioSource: async ({ sourceId, fingerprint }) => {
        const source = this.musicSources.getSource(sourceId);
        if (!source) return { kind: 'different-edit', sourceId };
        return this.options.audioBridge.checkAudio({ sourceId, bytes: new Uint8Array(await readFile(source.filePath)), fingerprint });
      },
      downloadAddonFile: (options) => this.downloadAddonFile(options),
      createId: randomUUID,
      getNow: () => new Date().toISOString(),
    };
  }

  private buildSyncSettings() {
    const pickedSourceIdsBySongId = new Map(Object.entries(this.settings.pickedFilePathsBySongId).map(([vaultSongId, filePath]) => [vaultSongId, this.musicSources.register(filePath)]));
    return {
      layout: this.settings.layout,
      shouldUpdateAutomatically: this.settings.shouldUpdateAutomatically,
      choices: { replaceEditedSongIds: new Set(this.settings.replaceEditedSongIds), removeFromGameSongIds: new Set(this.settings.removeFromGameSongIds), updateSongIds: new Set(this.settings.updateSongIds) },
      pickedSourceIdsBySongId,
      musicIndex: this.musicIndex,
      addons: this.settings.addons,
    };
  }

  private buildSongsFolder(): NodeSongsFolder {
    if (!this.settings.game) throw new Error('Connect your game first.');
    return new NodeSongsFolder({ rootFolder: this.settings.game.songsFolderPath, musicSources: this.musicSources, convertMusicToWav: async ({ filePath }) => this.options.audioBridge.convertToWav(new Uint8Array(await readFile(filePath))) });
  }

  private buildClient(): StepsVaultClient {
    return new StepsVaultClient({ httpClient: this.httpClient, siteUrl: this.options.siteUrl, deviceToken: this.deviceToken });
  }

  /** An addon's file goes into the app's own folder (never the music folders), named by a hash of its address. */
  private async downloadAddonFile({ url, fileName, addonName }: { url: string; fileName: string | null; addonName: string }): Promise<string> {
    const response = await this.httpClient.requestBytes({ url, method: 'GET', timeoutMilliseconds: ADDON_DOWNLOAD_TIMEOUT_MILLISECONDS, maxResponseBytes: MAX_ADDON_FILE_BYTES });
    if (response.status !== 200) throw new Error(`The addon's file answered ${String(response.status)}.`);
    const extension = path.extname(fileName ?? new URL(url).pathname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.audio';
    const filePath = path.join(this.options.dataFolder, 'addon-downloads', `${createHash('sha256').update(url).digest('hex').slice(0, 24)}${extension}`);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, response.body);
    const sourceId = this.musicSources.register(filePath);
    this.addonNamesBySourceId.set(sourceId, addonName);
    return sourceId;
  }

  private async saveSettings(settings: DesktopSettings): Promise<void> {
    this.settings = settings;
    await this.settingsStore.save(settings);
    this.publish();
  }

  private publish(): void {
    this.options.onStateChange(this.buildState());
  }

  private buildState(): DesktopSyncState {
    const outcome = this.lastOutcome;
    const songViewInput = {
      vaultSongs: outcome?.vaultSongs ?? [],
      songPlans: outcome?.finalPlan.songPlans ?? [],
      audioResultsBySongId: outcome?.audioResultsBySongId ?? new Map(),
      record: this.record,
      pickedSongIds: new Set(Object.keys(this.settings.pickedFilePathsBySongId)),
      addonNamesBySourceId: this.addonNamesBySourceId,
    };
    const songs = buildSongRows(songViewInput);
    const layoutViews = buildLayoutViews({ vaultSongs: outcome?.vaultSongs ?? [], record: this.record, playerGroupNames: this.playerGroupNames });
    return {
      appVersion: this.options.appVersion,
      siteUrl: this.options.siteUrl,
      signIn: this.signIn,
      game: this.settings.game,
      foundGames: this.foundGames.map((game) => ({ gameId: game.gameId, gameName: game.gameName, versionText: null, songsFolderPath: game.songsFolderPath, songCountText: `${game.songCount.toLocaleString('en-US')} songs` })),
      searchedPlacesText: 'checked every drive’s Games and Program Files folders',
      musicFolders: this.settings.musicFolders.map((folderPath) => ({ folderPath, scanState: this.scannedFileCount === null ? 'waiting' : 'scanned', summaryText: `${(this.musicIndex?.fileCount ?? 0).toLocaleString('en-US')} music files` })),
      scannedFileCount: this.scannedFileCount,
      pickedFiles: Object.entries(this.settings.pickedFilePathsBySongId).map(([vaultSongId, filePath]) => ({ vaultSongId, title: songs.find((song) => song.vaultSongId === vaultSongId)?.title ?? 'A song', fileName: path.basename(filePath), status: songs.find((song) => song.vaultSongId === vaultSongId)?.status ?? 'needs-audio' })),
      addons: this.settings.addons.map((addon) => ({ addonId: addon.manifest.id, name: addon.manifest.name, version: addon.manifest.version, author: addon.manifest.author, providesText: 'Audio links', isEnabled: addon.isEnabled, health: { kind: 'working', note: addon.baseUrl } })),
      layout: this.settings.layout,
      ...layoutViews,
      playerGroupNames: this.playerGroupNames,
      lastLayoutMove: this.lastLayoutMove,
      isBackgroundSyncOn: this.settings.isBackgroundSyncOn,
      songs,
      songDetailsById: buildSongDetailsById(songViewInput),
      syncRun: this.syncRun,
      finishedSync: this.finishedSync,
      lastSyncAt: this.settings.lastSyncAt,
      activity: buildActivityEntries({ events: this.settings.activity, vaultSongs: outcome?.vaultSongs ?? [] }),
      trayStatus: getTrayStatus({ isSyncing: this.syncRun !== null, isPaused: !this.settings.isBackgroundSyncOn, songPlans: outcome?.finalPlan.songPlans ?? [] }),
      updateVersion: this.readyUpdateVersion !== null && this.readyUpdateVersion !== this.dismissedUpdateVersion ? this.readyUpdateVersion : null,
      problem: this.problem,
    };
  }
}

/** A choice on a song's row, remembered until a sync has acted on it. */
function withSongChoice({ settings, vaultSongId, action }: { settings: DesktopSettings; vaultSongId: string; action: SongAction }): DesktopSettings {
  const add = (ids: string[]) => [...ids.filter((id) => id !== vaultSongId), vaultSongId];
  const drop = (ids: string[]) => ids.filter((id) => id !== vaultSongId);
  if (action === 'update') return { ...settings, updateSongIds: add(settings.updateSongIds) };
  if (action === 'replace-with-stepsvault') return { ...settings, replaceEditedSongIds: add(settings.replaceEditedSongIds) };
  if (action === 'keep-mine') return { ...settings, replaceEditedSongIds: drop(settings.replaceEditedSongIds) };
  if (action === 'remove-from-game') return { ...settings, removeFromGameSongIds: add(settings.removeFromGameSongIds) };
  if (action === 'keep-in-game') return { ...settings, removeFromGameSongIds: drop(settings.removeFromGameSongIds) };
  return settings;
}

/** Once a song is synced again (or gone), its one-off choices are done, so they never repeat by surprise. */
function withSettledChoices({ settings, outcome }: { settings: DesktopSettings; outcome: SyncOutcome }): DesktopSettings {
  const settledIds = new Set(outcome.finalPlan.songPlans.filter((songPlan) => songPlan.status === 'synced').map((songPlan) => songPlan.vaultSongId));
  const remainingIds = new Set(outcome.finalPlan.songPlans.map((songPlan) => songPlan.vaultSongId));
  const isOpen = (id: string) => remainingIds.has(id) && !settledIds.has(id);
  return { ...settings, updateSongIds: settings.updateSongIds.filter(isOpen), replaceEditedSongIds: settings.replaceEditedSongIds.filter(isOpen), removeFromGameSongIds: settings.removeFromGameSongIds.filter(isOpen) };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

import type { InstalledAddon } from '../addons/addon-client';
import type { AudioFingerprint } from '../audio-matching/audio-match';
import { findAudioForSong, type AudioSearchResult, type DownloadAddonFile } from '../audio-sources/audio-search';
import type { MusicIndex } from '../audio-sources/music-library';
import type { FolderLayout } from '../layout/folder-layout';
import { getPlayerGroupNames } from '../layout/player-groups';
import { checkInstalledSongs, type InstalledSongCheck } from '../ownership/installed-song-check';
import type { InstalledSongsRecord } from '../ownership/installed-songs';
import type { HttpClient } from '../network/http-client';
import type { AudioMatch, PlayerChoices, SyncPlan } from '../planner/sync-plan-types';
import { buildSyncPlan } from '../planner/sync-planner';
import type { SongsFolder } from '../songs-folder/songs-folder';
import { buildSongsPath, getNameKey } from '../songs-folder/songs-path';
import type { VaultSongDetails } from '../stepsvault-api/stepsvault-api-types';
import { buildAddonSongFacts } from '../stepsvault-api/stepsvault-client';
import type { VaultFiles } from '../writing/song-writer';
import { carryOutSyncPlan, type ActivityEvent, type SyncProgress } from '../writing/sync-executor';

/** Where the player's installed-songs record is kept: IndexedDB on the website, a JSON file in the app. */
export interface RecordStore {
  load(): Promise<InstalledSongsRecord>;
  save(record: InstalledSongsRecord): Promise<void>;
}

/** The parts of the StepsVault client a sync needs. */
export interface SyncVault extends VaultFiles {
  fetchVault(): Promise<VaultSongDetails[]>;
  fetchFingerprint(vaultSongId: string): Promise<AudioFingerprint>;
}

export interface SyncPorts {
  songsFolder: SongsFolder;
  vault: SyncVault;
  recordStore: RecordStore;
  httpClient: HttpClient;
  /** Decodes the file and matches it against this song's fingerprint, off the main thread. */
  checkAudioSource: (options: { sourceId: string; fingerprint: AudioFingerprint }) => Promise<AudioMatch>;
  downloadAddonFile: DownloadAddonFile;
  createId: () => string;
  getNow: () => string;
}

export interface SyncSettings {
  layout: FolderLayout;
  shouldUpdateAutomatically: boolean;
  choices: PlayerChoices;
  pickedSourceIdsBySongId: ReadonlyMap<string, string>;
  musicIndex: MusicIndex | null;
  addons: readonly InstalledAddon[];
}

export type SyncPhase = { kind: 'reading-vault' } | { kind: 'finding-audio'; vaultSongId: string; doneSongCount: number; totalSongCount: number } | { kind: 'writing'; progress: SyncProgress };

export interface SyncOutcome {
  vaultSongs: VaultSongDetails[];
  /** The plan as it stands after the sync: every song's status now. */
  finalPlan: SyncPlan;
  audioResultsBySongId: ReadonlyMap<string, AudioSearchResult>;
  events: ActivityEvent[];
  record: InstalledSongsRecord;
}

/**
 * One whole sync: read the vault, check what is installed, find audio for the songs that need it, plan, carry the
 * plan out, and plan again to report every song's status. The website and the desktop app both run this.
 */
export async function runSync({ ports, settings, onPhase }: { ports: SyncPorts; settings: SyncSettings; onPhase?: (phase: SyncPhase) => void }): Promise<SyncOutcome> {
  onPhase?.({ kind: 'reading-vault' });
  const [record, vaultSongs] = await Promise.all([ports.recordStore.load(), ports.vault.fetchVault()]);
  const checks = await checkInstalledSongs({ songsFolder: ports.songsFolder, record });
  const audioResultsBySongId = await findAudioForSongsThatNeedIt({ ports, settings, vaultSongs, checks, onPhase });
  const plan = await buildPlan({ ports, settings, vaultSongs, record, checks, audioResultsBySongId });
  const result = await carryOutSyncPlan({ plan, record, dependencies: { songsFolder: ports.songsFolder, vaultFiles: ports.vault, createId: ports.createId, getNow: ports.getNow }, onRecordChange: (changed) => ports.recordStore.save(changed), onProgress: (progress) => onPhase?.({ kind: 'writing', progress }) });
  await ports.recordStore.save(result.record);
  const finalChecks = await checkInstalledSongs({ songsFolder: ports.songsFolder, record: result.record });
  const finalPlan = await buildPlan({ ports, settings, vaultSongs, record: result.record, checks: finalChecks, audioResultsBySongId });
  return { vaultSongs, finalPlan, audioResultsBySongId, events: result.events, record: result.record };
}

/** Only songs that aren't (still) in the game need audio; installed songs keep the music they have. */
async function findAudioForSongsThatNeedIt(options: { ports: SyncPorts; settings: SyncSettings; vaultSongs: VaultSongDetails[]; checks: InstalledSongCheck[]; onPhase?: (phase: SyncPhase) => void }): Promise<Map<string, AudioSearchResult>> {
  const installedSongIds = new Set(options.checks.filter((check) => check.state === 'intact' || check.state === 'edited').map((check) => check.installedSong.vaultSongId));
  const songsNeedingAudio = options.vaultSongs.filter((song) => !installedSongIds.has(song.vaultSongId));
  const resultsBySongId = new Map<string, AudioSearchResult>();
  for (const [index, song] of songsNeedingAudio.entries()) {
    options.onPhase?.({ kind: 'finding-audio', vaultSongId: song.vaultSongId, doneSongCount: index, totalSongCount: songsNeedingAudio.length });
    resultsBySongId.set(song.vaultSongId, await findAudioForVaultSong({ ports: options.ports, settings: options.settings, song }));
  }
  return resultsBySongId;
}

async function findAudioForVaultSong({ ports, settings, song }: { ports: SyncPorts; settings: SyncSettings; song: VaultSongDetails }): Promise<AudioSearchResult> {
  if (!song.hasFingerprint) return { match: { kind: 'not-found', isWaitingForAddon: false }, addonMessages: ['StepsVault has no sound fingerprint for this song yet, so its audio can’t be checked.'], pageLinks: [] };
  const fingerprint = await ports.vault.fetchFingerprint(song.vaultSongId);
  return findAudioForSong({
    song: { vaultSongId: song.vaultSongId, ...buildAddonSongFacts(song) },
    pickedSourceId: settings.pickedSourceIdsBySongId.get(song.vaultSongId) ?? null,
    musicIndex: settings.musicIndex,
    addons: settings.addons,
    httpClient: ports.httpClient,
    checkAudioSource: ({ sourceId }) => ports.checkAudioSource({ sourceId, fingerprint }),
    downloadAddonFile: ports.downloadAddonFile,
  });
}

async function buildPlan(options: { ports: SyncPorts; settings: SyncSettings; vaultSongs: VaultSongDetails[]; record: InstalledSongsRecord; checks: InstalledSongCheck[]; audioResultsBySongId: ReadonlyMap<string, AudioSearchResult> }): Promise<SyncPlan> {
  return buildSyncPlan({
    vaultSongs: options.vaultSongs,
    record: options.record,
    checks: options.checks,
    audioMatchesBySongId: new Map([...options.audioResultsBySongId].map(([vaultSongId, result]) => [vaultSongId, result.match])),
    layout: options.settings.layout,
    playerGroupNames: await getPlayerGroupNames({ songsFolder: options.ports.songsFolder, record: options.record }),
    foreignFolderNamesByGroupKey: await getForeignFolderNamesByGroupKey({ songsFolder: options.ports.songsFolder, record: options.record }),
    choices: options.settings.choices,
    shouldUpdateAutomatically: options.settings.shouldUpdateAutomatically,
  });
}

/** Folders inside our groups that aren't ours (the player put them there); new songs never take their names. */
async function getForeignFolderNamesByGroupKey({ songsFolder, record }: { songsFolder: SongsFolder; record: InstalledSongsRecord }): Promise<Map<string, string[]>> {
  const ownFolderKeys = new Set(record.installedSongs.map((song) => song.folderPath.map(getNameKey).join('/')));
  const namesByGroupKey = new Map<string, string[]>();
  for (const groupName of record.ownedGroupNames) {
    const entries = await songsFolder.listEntries(buildSongsPath(groupName));
    const foreignNames = entries.filter((entry) => !ownFolderKeys.has(`${getNameKey(groupName)}/${getNameKey(entry.name)}`)).map((entry) => entry.name);
    namesByGroupKey.set(getNameKey(groupName), foreignNames);
  }
  return namesByGroupKey;
}

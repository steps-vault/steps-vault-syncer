import type { FolderLayout } from '@stepsvault/sync-core';
import type {
  ActivityEntryView,
  AddonInstallPreview,
  AddonLookupResult,
  AddonView,
  FinishedSyncView,
  FoundGameView,
  GeneratedSongView,
  GeneratorInstallPreview,
  GeneratorJobView,
  GeneratorLookupResult,
  GeneratorView,
  LayoutPreviewsByLayout,
  MakeSongRequest,
  MakeSongResult,
  MusicChoiceView,
  MusicFolderView,
  PickedFileView,
  PreselectedSongView,
  ServiceLookupRequest,
  SongAction,
  SongDetailsView,
  SongRowView,
  SongSourceSearchRequest,
  SongSourceSearchResult,
  SongSourceTabView,
  StepsVaultGeneratorView,
  SyncRunView,
  TrayStatus,
  VaultChoiceAnswer,
} from '@stepsvault/sync-ui';

export type DesktopSignIn =
  | { kind: 'signed-out' }
  | { kind: 'waiting-for-code'; code: string; expiresAt: string; computerName: string; systemName: string }
  | { kind: 'signed-in'; computerName: string };

/** Everything the window shows. The main process builds it; the window only renders it. */
export interface DesktopSyncState {
  appVersion: string;
  /** The StepsVault site this app syncs with, for links that open in the player's browser. */
  siteUrl: string;
  signIn: DesktopSignIn;
  game: { gameName: string; songsFolderPath: string } | null;
  foundGames: FoundGameView[];
  searchedPlacesText: string;
  musicFolders: MusicFolderView[];
  scannedFileCount: number | null;
  pickedFiles: PickedFileView[];
  addons: AddonView[];
  stepsVaultGenerator: StepsVaultGeneratorView;
  generators: GeneratorView[];
  /** One tab on the Make a song page per song-source addon that is on. */
  songSourceTabs: SongSourceTabView[];
  generatorJobs: GeneratorJobView[];
  generatedSongs: GeneratedSongView[];
  /** A song a website link asked to make: the window opens Generators › Make a song with it. */
  preselectedSong: PreselectedSongView | null;
  layout: FolderLayout;
  previewsByLayout: LayoutPreviewsByLayout;
  movingSongCountsByLayout: Record<FolderLayout, number>;
  playerGroupNames: string[];
  lastLayoutMove: { layout: FolderLayout; movedSongCount: number } | null;
  isBackgroundSyncOn: boolean;
  songs: SongRowView[];
  songDetailsById: Record<string, SongDetailsView>;
  syncRun: SyncRunView | null;
  finishedSync: FinishedSyncView | null;
  lastSyncAt: string | null;
  activity: ActivityEntryView[];
  trayStatus: TrayStatus;
  updateVersion: string | null;
  /** A problem the player should see now, in one sentence that says what to do. */
  problem: string | null;
}

/** What the window may ask the main process to do. Nothing here takes a file path: files are chosen in main's own dialogs. */
export interface DesktopSyncBridge {
  getState(): Promise<DesktopSyncState>;
  onState(listener: (state: DesktopSyncState) => void): () => void;
  startSignIn(): Promise<void>;
  openLinkPage(): Promise<void>;
  useFoundGame(gameId: string): Promise<void>;
  chooseSongsFolder(): Promise<void>;
  addMusicFolder(): Promise<void>;
  removeMusicFolder(folderPath: string): Promise<void>;
  scanMusicAgain(): Promise<void>;
  syncNow(): Promise<void>;
  dismissFinishedSync(): Promise<void>;
  setBackgroundSync(isOn: boolean): Promise<void>;
  runSongAction(request: { vaultSongId: string; action: SongAction }): Promise<void>;
  /** A start command is confirmed by the player in the app's own dialog before Sync ever runs it. */
  lookUpAddon(request: ServiceLookupRequest): Promise<AddonLookupResult>;
  installAddon(preview: AddonInstallPreview): Promise<void>;
  setAddonEnabled(request: { addonId: string; isEnabled: boolean }): Promise<void>;
  setAddonOption(request: { addonId: string; optionId: string; value: string }): Promise<void>;
  removeAddon(addonId: string): Promise<void>;
  lookUpGenerator(request: ServiceLookupRequest): Promise<GeneratorLookupResult>;
  installGenerator(preview: GeneratorInstallPreview): Promise<void>;
  removeGenerator(generatorId: string): Promise<void>;
  setGeneratorOption(request: { generatorId: string; optionId: string; value: string }): Promise<void>;
  /** Opens the app's own file dialog; the window gets a musicId, never a path. */
  chooseMusicFileForSong(): Promise<MusicChoiceView | null>;
  searchMusicFolders(query: string): Promise<MusicChoiceView[]>;
  findSongWithSource(request: SongSourceSearchRequest): Promise<SongSourceSearchResult>;
  stopFindingSong(): Promise<void>;
  makeSong(request: MakeSongRequest): Promise<MakeSongResult>;
  dismissPreselectedSong(preselectionKey: string): Promise<void>;
  cancelGeneratorJob(jobKey: string): Promise<void>;
  answerVaultChoice(answer: VaultChoiceAnswer): Promise<void>;
  dismissGeneratorJob(jobKey: string): Promise<void>;
  fetchGeneratedSongReport(songKey: string): Promise<string | null>;
  setLayout(layout: FolderLayout): Promise<void>;
  copyActivityDetails(): Promise<void>;
  restartToUpdate(): Promise<void>;
  dismissUpdate(): Promise<void>;
}

/**
 * The hidden window's side: decode and match, convert to WAV, measure a song's length, or draw a plain picture (the
 * window has Chromium's canvas, so no drawing library is needed).
 */
export type AudioJob =
  | { jobId: number; kind: 'check'; sourceId: string; bytes: Uint8Array; fingerprint: number[]; fingerprintRateHertz: number }
  | { jobId: number; kind: 'convert-to-wav'; bytes: Uint8Array }
  | { jobId: number; kind: 'measure'; bytes: Uint8Array }
  | { jobId: number; kind: 'make-picture'; width: number; height: number; title: string; artist: string };

export type AudioJobResult =
  | { jobId: number; kind: 'check'; match: { kind: 'matched'; sourceId: string; shiftSeconds: number } | { kind: 'different-edit'; sourceId: string } }
  | { jobId: number; kind: 'convert-to-wav'; bytes: Uint8Array }
  | { jobId: number; kind: 'measure'; lengthSeconds: number }
  | { jobId: number; kind: 'make-picture'; bytes: Uint8Array }
  | { jobId: number; kind: 'failed'; message: string };

export const BRIDGE_CHANNEL_PREFIX = 'stepsvault-sync:';
export const STATE_CHANNEL = `${BRIDGE_CHANNEL_PREFIX}state`;
export const AUDIO_JOB_CHANNEL = 'stepsvault-audio:job';
export const AUDIO_RESULT_CHANNEL = 'stepsvault-audio:result';
/** The bridge methods the window may call, by name; the preload exposes exactly these. */
export const BRIDGE_METHOD_NAMES = [
  'getState',
  'startSignIn',
  'openLinkPage',
  'useFoundGame',
  'chooseSongsFolder',
  'addMusicFolder',
  'removeMusicFolder',
  'scanMusicAgain',
  'syncNow',
  'dismissFinishedSync',
  'setBackgroundSync',
  'runSongAction',
  'lookUpAddon',
  'installAddon',
  'setAddonEnabled',
  'setAddonOption',
  'removeAddon',
  'lookUpGenerator',
  'installGenerator',
  'removeGenerator',
  'setGeneratorOption',
  'chooseMusicFileForSong',
  'searchMusicFolders',
  'findSongWithSource',
  'stopFindingSong',
  'makeSong',
  'dismissPreselectedSong',
  'cancelGeneratorJob',
  'answerVaultChoice',
  'dismissGeneratorJob',
  'fetchGeneratedSongReport',
  'setLayout',
  'copyActivityDetails',
  'restartToUpdate',
  'dismissUpdate',
] as const satisfies readonly (keyof DesktopSyncBridge)[];

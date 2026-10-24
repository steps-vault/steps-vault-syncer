import type { FolderLayout } from '@stepsvault/sync-core';
import type {
  ActivityEntryView,
  AddonInstallPreview,
  AddonLookupResult,
  AddonView,
  FinishedSyncView,
  FoundGameView,
  LayoutPreviewsByLayout,
  MusicFolderView,
  PickedFileView,
  SongAction,
  SongDetailsView,
  SongRowView,
  SyncRunView,
  TrayStatus,
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
  lookUpAddon(address: string): Promise<AddonLookupResult>;
  installAddon(preview: AddonInstallPreview): Promise<void>;
  setAddonEnabled(request: { addonId: string; isEnabled: boolean }): Promise<void>;
  removeAddon(addonId: string): Promise<void>;
  setLayout(layout: FolderLayout): Promise<void>;
  copyActivityDetails(): Promise<void>;
  restartToUpdate(): Promise<void>;
  dismissUpdate(): Promise<void>;
}

/** The hidden audio window's side: decode and match, or convert to WAV. */
export type AudioJob =
  | { jobId: number; kind: 'check'; sourceId: string; bytes: Uint8Array; fingerprint: number[]; fingerprintRateHertz: number }
  | { jobId: number; kind: 'convert-to-wav'; bytes: Uint8Array };

export type AudioJobResult =
  | { jobId: number; kind: 'check'; match: { kind: 'matched'; sourceId: string; shiftSeconds: number } | { kind: 'different-edit'; sourceId: string } }
  | { jobId: number; kind: 'convert-to-wav'; bytes: Uint8Array }
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
  'removeAddon',
  'setLayout',
  'copyActivityDetails',
  'restartToUpdate',
  'dismissUpdate',
] as const satisfies readonly (keyof DesktopSyncBridge)[];

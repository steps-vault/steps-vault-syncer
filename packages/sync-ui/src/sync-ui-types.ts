import type { FolderLayout, SongSyncStatus } from '@stepsvault/sync-core';

/** The website shows browser permission prompts; the desktop app has a tray and background sync. */
export type SyncPlatform = 'website' | 'desktop';

export type SyncScreen = 'songs' | 'audio-sources' | 'folder-layout' | 'activity' | 'account';

/** Levels in the game's order (Beginner, Easy, Medium, Hard, Challenge); null when that chart doesn't exist. */
export type DifficultyLevels = readonly [number | null, number | null, number | null, number | null, number | null];

export type SongAudioSource =
  | { kind: 'music-folder' }
  | { kind: 'picked-file' }
  | { kind: 'addon'; addonName: string }
  | { kind: 'none' };

export type SongSyncStep = 'finding-audio' | 'checking-edit' | 'lining-up' | 'writing-to-game';

/** Where a song is in the sync that is running now. */
export type SongSyncProgress = { kind: 'working'; step: SongSyncStep } | { kind: 'waiting-in-line' };

export type SongAction = 'sync' | 'choose-audio' | 'use-different-file' | 'update' | 'keep-mine' | 'replace-with-stepsvault' | 'remove-from-game' | 'keep-in-game';

export interface SongRowView {
  vaultSongId: string;
  title: string;
  artist: string;
  genre: string | null;
  coverArtUrl: string | null;
  levels: DifficultyLevels;
  status: SongSyncStatus;
  audioSource: SongAudioSource;
  /** When the song was added to the vault (milliseconds since 1970), for the "Recently added" sort. */
  addedAt: number;
  progress?: SongSyncProgress | null;
  /** A short line under the status, for example "Keeping your version". */
  note?: string | null;
  /** Leave it out to offer the status's usual choices; an empty list once the player has chosen. */
  statusActions?: readonly SongAction[];
}

export type AudioEditMatch = 'same' | 'different' | 'unknown';

export interface AudioMatchView {
  fileName: string | null;
  edit: AudioEditMatch;
  /** For example "Moved the steps 0.18 s later to fit your copy." */
  timingText: string;
  /** From 0 (nothing to check yet) to 10 (very sure). */
  confidence: number;
}

export interface SongDetailsView {
  song: SongRowView;
  album: string | null;
  bpmText: string;
  lengthText: string;
  statusNote: string | null;
  audioMatch: AudioMatchView;
  /** For example "Songs/Pop/Cheap Thrills"; null while the song is not in the game. */
  gameFolderPath: string | null;
  chartVersionText: string;
  /** What the newer chart does better, when the status is "Update available". */
  updateNote: string | null;
}

export interface ConnectedGameView {
  gameName: string;
  songsFolderPath: string;
}

export interface FoundGameView {
  gameId: string;
  gameName: string;
  versionText: string | null;
  songsFolderPath: string;
  songCountText: string;
}

export interface PlayerGroupView {
  groupName: string;
  songCount: number;
}

export type MusicFolderScanState = 'scanned' | 'scanning' | 'waiting';

export interface MusicFolderView {
  folderPath: string;
  scanState: MusicFolderScanState;
  /** For example "1,240 files · 15 vault songs found". */
  summaryText: string;
}

export interface PickedFileView {
  vaultSongId: string;
  title: string;
  fileName: string;
  status: SongSyncStatus;
}

export type AddonHealth = { kind: 'working'; note: string } | { kind: 'not-answering'; note: string };

export interface AddonView {
  addonId: string;
  name: string;
  version: string;
  author: string;
  providesText: string;
  isEnabled: boolean;
  health: AddonHealth;
  isNew?: boolean;
}

/** What the addon's own description says about itself, shown before the player agrees to install it. */
export interface AddonInstallPreview {
  address: string;
  name: string;
  version: string;
  author: string;
}

export type AddonLookupResult = { kind: 'found'; addon: AddonInstallPreview } | { kind: 'failed'; message: string };

export interface LayoutPreviewGroup {
  groupName: string;
  /** Shown next to the group, for example "23 songs" or "name taken". */
  tagText?: string;
  songTitles: readonly string[];
  moreSongCount?: number;
}

export interface LayoutPreview {
  groups: readonly LayoutPreviewGroup[];
  /** For example "+ 5 more genres". */
  moreGroupsText?: string;
}

export type LayoutPreviewsByLayout = Readonly<Record<FolderLayout, LayoutPreview>>;

/** `write-failed`: a song couldn't be written (full disk, StepMania open…); its details say what to do. */
export type ActivityKind = 'sync-finished' | 'added' | 'updated' | 'lined-up' | 'no-audio' | 'different-edit' | 'removed' | 'kept-edits' | 'addon-not-answering' | 'moved' | 'connected' | 'write-failed';

export interface ActivityEntryView {
  entryId: string;
  kind: ActivityKind;
  dayText: string;
  timeText: string;
  /** The sentence is textBefore + highlightedText (bold) + textAfter, for example "Added " + "Cheap Thrills" + " to Pop". */
  textBefore: string;
  highlightedText: string;
  textAfter: string;
  summaryText: string;
  details: readonly { label: string; value: string }[];
}

export type TrayStatus = 'synced' | 'syncing' | 'needs-attention' | 'paused';

export interface LinkedComputerView {
  computerId: string;
  computerName: string;
  /** For example "Windows 11 · linked Oct 3, 2026". */
  systemText: string;
  isOnline: boolean;
  lastSyncText: string;
  gameName: string;
}

export type SignInState =
  | { kind: 'waiting-for-code'; code: string; expiresInText: string; computerName: string; systemName: string }
  | { kind: 'signed-in'; playerName: string; computerName: string };

export type LinkCodeState = 'typing' | 'miss' | 'great' | 'linked';

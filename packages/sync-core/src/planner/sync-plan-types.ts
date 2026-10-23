import type { SongFolderFacts } from '../layout/folder-layout';
import type { SongsPath } from '../songs-folder/songs-path';

/** A song in the player's vault on StepsVault, as Sync needs it. */
export interface VaultSong extends SongFolderFacts {
  /** Changes whenever the song's steps change on StepsVault. */
  chartVersion: string;
}

/** What the audio search found for one song (tasks 6 and 7 produce this). */
export type AudioMatch =
  | { kind: 'matched'; sourceId: string; shiftSeconds: number }
  | { kind: 'different-edit'; sourceId: string }
  | { kind: 'not-found'; isWaitingForAddon: boolean };

/** One clear status per song, as the status chips show it. */
export type SongSyncStatus = 'synced' | 'syncing' | 'needs-audio' | 'different-edit' | 'update-available' | 'you-edited-this' | 'removed-from-vault';

export type SyncAction =
  | { kind: 'add'; vaultSongId: string; to: SongsPath; chartVersion: string; audio: { sourceId: string; shiftSeconds: number } }
  | { kind: 'update'; vaultSongId: string; at: SongsPath; chartVersion: string }
  | { kind: 'move'; vaultSongId: string; from: SongsPath; to: SongsPath }
  | { kind: 'remove'; vaultSongId: string; at: SongsPath }
  /** Drops the record of a folder that is gone or no longer ours; touches nothing on disk. */
  | { kind: 'forget'; vaultSongId: string };

export interface SongPlan {
  vaultSongId: string;
  status: SongSyncStatus;
  /** In order; an empty list when nothing needs doing (or the player must choose first). */
  actions: SyncAction[];
  isWaitingForAddon: boolean;
}

export interface SyncPlan {
  songPlans: SongPlan[];
  /** Record clean-up for songs that are neither in the vault nor in the game any more. */
  forgetActions: SyncAction[];
}

/** What the player chose on a song's row; nothing chosen means the safe default. */
export interface PlayerChoices {
  /** For "You edited this": replace their edits with StepsVault's steps. Default: keep theirs. */
  replaceEditedSongIds: ReadonlySet<string>;
  /** For "Removed from vault": remove it from the game. Default: keep it. */
  removeFromGameSongIds: ReadonlySet<string>;
  /** For "Update available" when automatic updates are off. */
  updateSongIds: ReadonlySet<string>;
}

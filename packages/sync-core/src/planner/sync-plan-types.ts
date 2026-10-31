import type { SongFolderFacts } from '../layout/folder-layout';
import type { SongsPath } from '../songs-folder/songs-path';

/** A song in the player's vault on StepsVault, as Sync needs it. */
export interface VaultSong extends SongFolderFacts {
  /** Changes whenever the song's steps change on StepsVault. */
  chartVersion: string;
}

/** What the audio search found for one song (tasks 6 and 7 produce this). */
export type AudioMatch =
  /** videoSourceId: the song's video from the same source as the music, so it shares the music's timing. */
  | { kind: 'matched'; sourceId: string; shiftSeconds: number; videoSourceId?: string | null }
  | { kind: 'different-edit'; sourceId: string }
  | { kind: 'not-found'; isWaitingForAddon: boolean };

/** One clear status per song, as the status chips show it. */
export type SongSyncStatus = 'synced' | 'syncing' | 'needs-audio' | 'different-edit' | 'update-available' | 'you-edited-this' | 'removed-from-vault';

export type SyncAction =
  | { kind: 'add'; vaultSongId: string; to: SongsPath; chartVersion: string; audio: { sourceId: string; shiftSeconds: number; videoSourceId: string | null } }
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
  /** The party lists' folders, list by list; missing from plans made without party lists. */
  partyFolderPlans?: PartyFolderPlan[];
}

/** A party list the player syncs, as the planner needs it. */
export interface PartyListToSync {
  partyListId: string;
  name: string;
  /** "Party - <name>" from the site, before Sync's own name cleaning (getPartyFolderBaseName). */
  gameFolderName: string;
  /** The list's ready songs, in its order. */
  songs: readonly VaultSong[];
}

/** One party folder: copies of the list's songs, whatever the folder layout. */
export interface PartyFolderPlan {
  partyListId: string;
  listName: string;
  baseName: string;
  /** Where the copies go; for a list that is gone, the folder they are removed from. */
  groupName: string;
  /** False once the list ended, was deleted or the player stopped syncing it: every copy Sync wrote is removed. */
  isSynced: boolean;
  /** One per copy, keyed by the song like the layout's plans; a song may also have a plan of its own there. */
  songPlans: SongPlan[];
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

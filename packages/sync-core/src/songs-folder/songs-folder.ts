import type { SongsPath } from './songs-path';

export interface SongsFolderEntry {
  name: string;
  isFolder: boolean;
}

/**
 * The game's Songs folder. The website implements it with the File System Access API and the desktop app with
 * Node's `fs`; both must refuse anything outside the chosen folder.
 */
export interface SongsFolder {
  /** Entries directly inside `path`; an empty list when `path` doesn't exist. */
  listEntries(path: SongsPath): Promise<SongsFolderEntry[]>;
  /** null when the file doesn't exist. */
  readText(path: SongsPath): Promise<string | null>;
  /** Creates missing parent folders. */
  writeText(options: { path: SongsPath; text: string }): Promise<void>;
  /** Fails when `to` already exists, so a rename never replaces anything. */
  rename(options: { from: SongsPath; to: SongsPath }): Promise<void>;
  /** Removes the folder and everything in it. */
  removeFolder(path: SongsPath): Promise<void>;
}

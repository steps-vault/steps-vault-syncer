import type { SongsPath } from './songs-path';

export interface SongsFolderEntry {
  name: string;
  isFolder: boolean;
}

/**
 * Why a Songs-folder operation failed, so the screen can say what to do: free up space, close StepMania, choose the
 * folder again. Implementations translate their own errors (ENOSPC, EBUSY, NotAllowedError…) into these.
 */
export type SongsFolderFailure = 'disk-full' | 'locked' | 'not-found' | 'already-exists' | 'no-permission' | 'other';

export class SongsFolderError extends Error {
  readonly failure: SongsFolderFailure;

  constructor({ failure, message }: { failure: SongsFolderFailure; message: string }) {
    super(message);
    this.name = 'SongsFolderError';
    this.failure = failure;
  }
}

/**
 * The game's Songs folder. The website implements it with the File System Access API and the desktop app with
 * Node's `fs`; both must refuse anything outside the chosen folder, and throw SongsFolderError.
 */
export interface SongsFolder {
  /** Entries directly inside `path`; an empty list when `path` doesn't exist. */
  listEntries(path: SongsPath): Promise<SongsFolderEntry[]>;
  /** null when the file doesn't exist. */
  readText(path: SongsPath): Promise<string | null>;
  /** Creates missing parent folders; replaces the file if it exists. */
  writeText(options: { path: SongsPath; text: string }): Promise<void>;
  /** Creates missing parent folders; replaces the file if it exists. */
  writeBytes(options: { path: SongsPath; bytes: Uint8Array }): Promise<void>;
  /**
   * Copies the player's music file that the audio search knows as `sourceId` (a music-folder file, a picked file or
   * an addon download) into `folder` as `<baseName>.<extension>`, converting formats StepMania can't play (ogg, mp3
   * and wav play as they are). Returns the file name it wrote. The music never leaves the player's computer.
   */
  copyMusic(options: { sourceId: string; folder: SongsPath; baseName: string }): Promise<string>;
  /** Fails with 'already-exists' when `to` exists, so a rename never replaces anything. */
  rename(options: { from: SongsPath; to: SongsPath }): Promise<void>;
  /** A file that is already gone is not an error. */
  removeFile(path: SongsPath): Promise<void>;
  /** Removes the folder and everything in it. */
  removeFolder(path: SongsPath): Promise<void>;
}

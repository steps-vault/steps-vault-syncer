import { SongsFolderError, type SongsFolder, type SongsFolderEntry, type SongsFolderFailure } from './songs-folder';
import { getPathKey, type SongsPath } from './songs-path';

type FileContents = string | Uint8Array;

/**
 * A Songs folder in memory, for tests. Names compare without case, as on Windows, where most players are. Tests can
 * make it fail like a real disk: full after some writes, or a folder held open by StepMania.
 */
export class MemorySongsFolder implements SongsFolder {
  private readonly filesByPathKey = new Map<string, { path: SongsPath; contents: FileContents }>();
  private readonly foldersByPathKey = new Map<string, SongsPath>();
  private readonly musicBytesBySourceId = new Map<string, Uint8Array>();
  private readonly lockedPathKeys = new Set<string>();
  private writesBeforeFailure: { count: number; failure: SongsFolderFailure } | null = null;

  listEntries(path: SongsPath): Promise<SongsFolderEntry[]> {
    const entriesByNameKey = new Map<string, SongsFolderEntry>();
    for (const descendant of this.getDescendantPaths(path)) {
      const name = descendant[path.length];
      if (name === undefined) continue;
      const isFolder = descendant.length > path.length + 1 || this.foldersByPathKey.has(getPathKey(descendant));
      entriesByNameKey.set(getPathKey([name]), { name, isFolder });
    }
    return Promise.resolve([...entriesByNameKey.values()]);
  }

  readText(path: SongsPath): Promise<string | null> {
    const contents = this.filesByPathKey.get(getPathKey(path))?.contents;
    return Promise.resolve(typeof contents === 'string' ? contents : null);
  }

  /** Test helper: a file's bytes, for music and images. */
  readBytes(path: SongsPath): Uint8Array | null {
    const contents = this.filesByPathKey.get(getPathKey(path))?.contents;
    return contents instanceof Uint8Array ? contents : null;
  }

  writeText({ path, text }: { path: SongsPath; text: string }): Promise<void> {
    return runLikeADisk(() => { this.writeFile({ path, contents: text }); });
  }

  writeBytes({ path, bytes }: { path: SongsPath; bytes: Uint8Array }): Promise<void> {
    return runLikeADisk(() => { this.writeFile({ path, contents: bytes }); });
  }

  copyMusic({ sourceId, folder, baseName }: { sourceId: string; folder: SongsPath; baseName: string }): Promise<string> {
    return runLikeADisk(() => {
      const bytes = this.musicBytesBySourceId.get(sourceId);
      if (!bytes) throw new SongsFolderError({ failure: 'not-found', message: `The music file ${sourceId} is gone. Choose the audio again.` });
      const fileName = `${baseName}.ogg`;
      this.writeFile({ path: [...folder, fileName], contents: bytes });
      return fileName;
    });
  }

  rename(options: { from: SongsPath; to: SongsPath }): Promise<void> {
    return runLikeADisk(() => {
      this.renameNow(options);
    });
  }

  private renameNow({ from, to }: { from: SongsPath; to: SongsPath }): void {
    this.throwIfLocked(from);
    if (this.exists(to)) throw new SongsFolderError({ failure: 'already-exists', message: `Can't rename to ${to.join('/')}: something with that name is already there.` });
    for (const [key, file] of [...this.filesByPathKey]) {
      if (!isInside({ path: file.path, folder: from })) continue;
      this.filesByPathKey.delete(key);
      this.storeFile({ path: [...to, ...file.path.slice(from.length)], contents: file.contents });
    }
    for (const [key, folder] of [...this.foldersByPathKey]) {
      if (!isInside({ path: folder, folder: from })) continue;
      this.foldersByPathKey.delete(key);
      this.addFolder([...to, ...folder.slice(from.length)]);
    }
  }

  removeFile(path: SongsPath): Promise<void> {
    return runLikeADisk(() => {
      this.throwIfLocked(path);
      this.filesByPathKey.delete(getPathKey(path));
    });
  }

  removeFolder(path: SongsPath): Promise<void> {
    return runLikeADisk(() => {
      this.throwIfLocked(path);
      for (const [key, file] of [...this.filesByPathKey]) if (isInside({ path: file.path, folder: path })) this.filesByPathKey.delete(key);
      for (const [key, folder] of [...this.foldersByPathKey]) if (isInside({ path: folder, folder: path })) this.foldersByPathKey.delete(key);
    });
  }

  /** Test helper: an empty folder, like a group the player made and left empty. */
  addFolder(path: SongsPath): void {
    for (let length = 1; length <= path.length; length += 1) {
      const folder = path.slice(0, length);
      this.foldersByPathKey.set(getPathKey(folder), folder);
    }
  }

  /** Test helper: a music file the audio search found on the player's computer. */
  addMusicSource({ sourceId, bytes }: { sourceId: string; bytes: Uint8Array }): void {
    this.musicBytesBySourceId.set(sourceId, bytes);
  }

  /** Test helper: the next `count` writes work, then every write fails. */
  failWritesAfter({ count, failure }: { count: number; failure: SongsFolderFailure }): void {
    this.writesBeforeFailure = { count, failure };
  }

  /** Test helper: StepMania holds this folder (or file) open, so it can't be renamed or removed. */
  lock(path: SongsPath): void {
    this.lockedPathKeys.add(getPathKey(path));
  }

  private writeFile({ path, contents }: { path: SongsPath; contents: FileContents }): void {
    this.throwIfWriteShouldFail();
    this.throwIfLocked(path);
    this.storeFile({ path, contents });
  }

  private storeFile({ path, contents }: { path: SongsPath; contents: FileContents }): void {
    this.addFolder(path.slice(0, -1));
    this.filesByPathKey.set(getPathKey(path), { path, contents });
  }

  private throwIfWriteShouldFail(): void {
    if (!this.writesBeforeFailure) return;
    if (this.writesBeforeFailure.count > 0) {
      this.writesBeforeFailure.count -= 1;
      return;
    }
    throw new SongsFolderError({ failure: this.writesBeforeFailure.failure, message: 'The test disk refused this write.' });
  }

  private throwIfLocked(path: SongsPath): void {
    const isLocked = [...this.lockedPathKeys].some((lockedKey) => getPathKey(path) === lockedKey || getPathKey(path).startsWith(`${lockedKey}/`));
    if (isLocked) throw new SongsFolderError({ failure: 'locked', message: `${path.join('/')} is in use by another program.` });
  }

  private exists(path: SongsPath): boolean {
    const pathKey = getPathKey(path);
    return this.filesByPathKey.has(pathKey) || this.foldersByPathKey.has(pathKey);
  }

  private getDescendantPaths(path: SongsPath): SongsPath[] {
    const filePaths = [...this.filesByPathKey.values()].map((file) => file.path);
    return [...filePaths, ...this.foldersByPathKey.values()].filter((candidate) => candidate.length > path.length && isInside({ path: candidate, folder: path }));
  }
}

/** A real disk reports failures as rejected promises, never as a throw before the promise exists. */
function runLikeADisk<Result>(operation: () => Result): Promise<Result> {
  return Promise.resolve().then(operation);
}

function isInside({ path, folder }: { path: SongsPath; folder: SongsPath }): boolean {
  return path.length >= folder.length && getPathKey(path.slice(0, folder.length)) === getPathKey(folder);
}

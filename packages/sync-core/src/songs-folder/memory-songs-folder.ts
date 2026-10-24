import type { SongsFolder, SongsFolderEntry } from './songs-folder';
import { getPathKey, type SongsPath } from './songs-path';

/** A Songs folder in memory, for tests. Names compare without case, as on Windows, where most players are. */
export class MemorySongsFolder implements SongsFolder {
  private readonly textsByPathKey = new Map<string, { path: SongsPath; text: string }>();
  private readonly foldersByPathKey = new Map<string, SongsPath>();

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
    return Promise.resolve(this.textsByPathKey.get(getPathKey(path))?.text ?? null);
  }

  writeText({ path, text }: { path: SongsPath; text: string }): Promise<void> {
    this.addFolder(path.slice(0, -1));
    this.textsByPathKey.set(getPathKey(path), { path, text });
    return Promise.resolve();
  }

  async rename({ from, to }: { from: SongsPath; to: SongsPath }): Promise<void> {
    if (await this.exists(to)) throw new Error(`Can't rename to ${to.join('/')}: something with that name is already there.`);
    for (const [key, file] of [...this.textsByPathKey]) {
      if (!isInside({ path: file.path, folder: from })) continue;
      this.textsByPathKey.delete(key);
      await this.writeText({ path: [...to, ...file.path.slice(from.length)], text: file.text });
    }
    for (const [key, folder] of [...this.foldersByPathKey]) {
      if (!isInside({ path: folder, folder: from })) continue;
      this.foldersByPathKey.delete(key);
      this.addFolder([...to, ...folder.slice(from.length)]);
    }
  }

  removeFolder(path: SongsPath): Promise<void> {
    for (const [key, file] of [...this.textsByPathKey]) if (isInside({ path: file.path, folder: path })) this.textsByPathKey.delete(key);
    for (const [key, folder] of [...this.foldersByPathKey]) if (isInside({ path: folder, folder: path })) this.foldersByPathKey.delete(key);
    return Promise.resolve();
  }

  /** Test helper: an empty folder, like a group the player made and left empty. */
  addFolder(path: SongsPath): void {
    for (let length = 1; length <= path.length; length += 1) {
      const folder = path.slice(0, length);
      this.foldersByPathKey.set(getPathKey(folder), folder);
    }
  }

  private exists(path: SongsPath): Promise<boolean> {
    const pathKey = getPathKey(path);
    return Promise.resolve(this.textsByPathKey.has(pathKey) || this.foldersByPathKey.has(pathKey));
  }

  private getDescendantPaths(path: SongsPath): SongsPath[] {
    const filePaths = [...this.textsByPathKey.values()].map((file) => file.path);
    return [...filePaths, ...this.foldersByPathKey.values()].filter((candidate) => candidate.length > path.length && isInside({ path: candidate, folder: path }));
  }
}

function isInside({ path, folder }: { path: SongsPath; folder: SongsPath }): boolean {
  return path.length >= folder.length && getPathKey(path.slice(0, folder.length)) === getPathKey(folder);
}

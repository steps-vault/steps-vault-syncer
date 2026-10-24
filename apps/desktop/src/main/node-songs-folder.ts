import { copyFile, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SongsFolderError, type SongsFolder, type SongsFolderEntry, type SongsFolderFailure, type SongsPath } from '@stepsvault/sync-core';
import type { MusicSourceRegistry } from './music-source-registry';

/** StepMania plays these as they are; anything else is converted to WAV first. */
const PLAYABLE_EXTENSIONS = new Set(['ogg', 'mp3', 'wav']);
const PLAYABLE_VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'avi', 'mpg', 'mpeg']);
const FAILURES_BY_ERROR_CODE: Readonly<Record<string, SongsFolderFailure>> = {
  ENOSPC: 'disk-full',
  EDQUOT: 'disk-full',
  EBUSY: 'locked',
  EPERM: 'locked',
  EACCES: 'no-permission',
  EROFS: 'no-permission',
  ENOENT: 'not-found',
  EEXIST: 'already-exists',
  ENOTEMPTY: 'already-exists',
};

/** Decodes a music file StepMania can't play and returns it as 16-bit WAV (the hidden audio window does this). */
export type ConvertMusicToWav = (options: { filePath: string }) => Promise<Uint8Array>;

/**
 * The game's Songs folder on disk. Every path is built from checked names and must stay inside the folder, and no
 * step of it may be a link or junction, so nothing Sync writes can land anywhere else on the computer.
 */
export class NodeSongsFolder implements SongsFolder {
  private readonly rootFolder: string;
  private readonly musicSources: MusicSourceRegistry;
  private readonly convertMusicToWav: ConvertMusicToWav;

  constructor({ rootFolder, musicSources, convertMusicToWav }: { rootFolder: string; musicSources: MusicSourceRegistry; convertMusicToWav: ConvertMusicToWav }) {
    this.rootFolder = path.resolve(rootFolder);
    this.musicSources = musicSources;
    this.convertMusicToWav = convertMusicToWav;
  }

  async listEntries(songsPath: SongsPath): Promise<SongsFolderEntry[]> {
    const folder = await this.resolveInside(songsPath);
    try {
      const entries = await readdir(folder, { withFileTypes: true });
      return entries.map((entry) => ({ name: entry.name, isFolder: entry.isDirectory() }));
    } catch (error) {
      if (getErrorCode(error) === 'ENOENT') return [];
      throw toSongsFolderError(error);
    }
  }

  async readText(songsPath: SongsPath): Promise<string | null> {
    const filePath = await this.resolveInside(songsPath);
    try {
      return await readFile(filePath, 'utf8');
    } catch (error) {
      if (getErrorCode(error) === 'ENOENT') return null;
      throw toSongsFolderError(error);
    }
  }

  writeText({ path: songsPath, text }: { path: SongsPath; text: string }): Promise<void> {
    return this.writeFileInside({ songsPath, contents: text });
  }

  writeBytes({ path: songsPath, bytes }: { path: SongsPath; bytes: Uint8Array }): Promise<void> {
    return this.writeFileInside({ songsPath, contents: bytes });
  }

  async copyMusic({ sourceId, folder, baseName }: { sourceId: string; folder: SongsPath; baseName: string }): Promise<string> {
    const source = this.musicSources.getSource(sourceId);
    if (!source) throw new SongsFolderError({ failure: 'not-found', message: 'The music file for this song is gone. Choose its audio again.' });
    const extension = path.extname(source.filePath).slice(1).toLowerCase();
    if (PLAYABLE_EXTENSIONS.has(extension)) {
      const fileName = `${baseName}.${extension}`;
      await this.run(async () => {
        const target = await this.resolveInside([...folder, fileName]);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(source.filePath, target);
      });
      return fileName;
    }
    const fileName = `${baseName}.wav`;
    await this.writeFileInside({ songsPath: [...folder, fileName], contents: await this.convertMusicToWav({ filePath: source.filePath }) });
    return fileName;
  }

  /** Addons send videos StepMania already plays; anything else is refused rather than converted. */
  async copyVideo({ sourceId, folder, baseName }: { sourceId: string; folder: SongsPath; baseName: string }): Promise<string> {
    const source = this.musicSources.getSource(sourceId);
    if (!source) throw new SongsFolderError({ failure: 'not-found', message: 'The video for this song is gone. Sync again to fetch it.' });
    const extension = path.extname(source.filePath).slice(1).toLowerCase();
    if (!PLAYABLE_VIDEO_EXTENSIONS.has(extension)) throw new SongsFolderError({ failure: 'other', message: `A .${extension} video can't play in StepMania, so Sync left it out.` });
    const fileName = `${baseName}.${extension}`;
    await this.run(async () => {
      const target = await this.resolveInside([...folder, fileName]);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source.filePath, target);
    });
    return fileName;
  }

  async rename({ from, to }: { from: SongsPath; to: SongsPath }): Promise<void> {
    const [fromPath, toPath] = await Promise.all([this.resolveInside(from), this.resolveInside(to)]);
    if (await exists(toPath)) throw new SongsFolderError({ failure: 'already-exists', message: `${to.join('/')} already exists, so Sync didn't move anything there.` });
    await this.run(async () => {
      await mkdir(path.dirname(toPath), { recursive: true });
      await rename(fromPath, toPath);
    });
  }

  async removeFile(songsPath: SongsPath): Promise<void> {
    const filePath = await this.resolveInside(songsPath);
    await this.run(() => rm(filePath, { force: true }));
  }

  async removeFolder(songsPath: SongsPath): Promise<void> {
    if (songsPath.length === 0) throw new SongsFolderError({ failure: 'no-permission', message: 'Sync never removes the whole Songs folder.' });
    const folder = await this.resolveInside(songsPath);
    await this.run(() => rm(folder, { recursive: true, force: true }));
  }

  private async writeFileInside({ songsPath, contents }: { songsPath: SongsPath; contents: string | Uint8Array }): Promise<void> {
    const filePath = await this.resolveInside(songsPath);
    await this.run(async () => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, contents);
    });
  }

  /** The absolute path for checked names, refusing anything that would leave the Songs folder. */
  private async resolveInside(songsPath: SongsPath): Promise<string> {
    const unsafeName = songsPath.find((name) => name === '' || name === '.' || name === '..' || /[\\/]/.test(name) || name.includes('\0'));
    if (unsafeName !== undefined) throw new SongsFolderError({ failure: 'no-permission', message: `"${unsafeName}" can't be used inside the Songs folder. This is a bug in Sync; please report it.` });
    const resolved = path.resolve(this.rootFolder, ...songsPath);
    if (resolved !== this.rootFolder && !resolved.startsWith(`${this.rootFolder}${path.sep}`)) throw new SongsFolderError({ failure: 'no-permission', message: 'Sync refused to write outside your Songs folder.' });
    await this.assertNoLinkOnTheWay(songsPath);
    return resolved;
  }

  /** A junction or link inside the Songs folder could point anywhere on the disk, so Sync never goes through one. */
  private async assertNoLinkOnTheWay(songsPath: SongsPath): Promise<void> {
    for (let length = 1; length <= songsPath.length; length += 1) {
      const step = path.resolve(this.rootFolder, ...songsPath.slice(0, length));
      const stats = await lstat(step).catch(() => null);
      if (!stats) return;
      if (stats.isSymbolicLink()) throw new SongsFolderError({ failure: 'no-permission', message: `${songsPath.slice(0, length).join('/')} is a link to another place, so Sync leaves it alone.` });
    }
  }

  private async run(operation: () => Promise<unknown>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      throw toSongsFolderError(error);
    }
  }
}

export function toSongsFolderError(error: unknown): SongsFolderError {
  if (error instanceof SongsFolderError) return error;
  const failure = FAILURES_BY_ERROR_CODE[getErrorCode(error) ?? ''] ?? 'other';
  return new SongsFolderError({ failure, message: error instanceof Error ? error.message : String(error) });
}

function getErrorCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : null;
}

async function exists(filePath: string): Promise<boolean> {
  return (await lstat(filePath).catch(() => null)) !== null;
}

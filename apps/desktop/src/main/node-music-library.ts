import { opendir } from 'node:fs/promises';
import path from 'node:path';
import type { MusicFile, MusicLibrary } from '@stepsvault/sync-core';
import type { MusicSourceRegistry } from './music-source-registry';

/** Formats Chromium can decode, so the sound check can read them. */
export const MUSIC_EXTENSIONS = new Set(['mp3', 'ogg', 'oga', 'opus', 'wav', 'flac', 'm4a', 'aac', 'webm']);
const MAX_FOLDER_DEPTH = 12;

/**
 * The player's music folders on disk. Links and junctions are not followed (they can loop or lead anywhere), and
 * hidden or system folders are skipped.
 */
export class NodeMusicLibrary implements MusicLibrary {
  private readonly musicFolders: readonly string[];
  private readonly musicSources: MusicSourceRegistry;

  constructor({ musicFolders, musicSources }: { musicFolders: readonly string[]; musicSources: MusicSourceRegistry }) {
    this.musicFolders = musicFolders;
    this.musicSources = musicSources;
  }

  async *listMusicFiles({ shouldStop }: { shouldStop: () => boolean }): AsyncIterable<MusicFile> {
    for (const musicFolder of this.musicFolders) {
      yield* this.walk({ folder: path.resolve(musicFolder), folderNames: [path.basename(musicFolder)], depth: 0, shouldStop });
    }
  }

  private async *walk({ folder, folderNames, depth, shouldStop }: { folder: string; folderNames: string[]; depth: number; shouldStop: () => boolean }): AsyncIterable<MusicFile> {
    if (depth > MAX_FOLDER_DEPTH || shouldStop()) return;
    const directory = await opendir(folder).catch(() => null);
    if (!directory) return;
    for await (const entry of directory) {
      if (shouldStop()) return;
      if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;
      const entryPath = path.join(folder, entry.name);
      if (entry.isDirectory()) yield* this.walk({ folder: entryPath, folderNames: [...folderNames, entry.name], depth: depth + 1, shouldStop });
      else if (entry.isFile() && MUSIC_EXTENSIONS.has(path.extname(entry.name).slice(1).toLowerCase())) {
        yield { sourceId: this.musicSources.register(entryPath), fileName: entry.name, folderNames, taggedTitle: null, taggedArtist: null };
      }
    }
  }
}

import type { InstalledSong } from './installed-songs';

/** Dot first, so StepMania and most file browsers don't show it to the player. */
export const SONG_FOLDER_MARKER_FILE_NAME = '.stepsvault.json';
const MARKER_FORMAT = 'stepsvault-song';

export interface SongFolderMarker {
  format: typeof MARKER_FORMAT;
  version: 1;
  vaultSongId: string;
  installId: string;
}

export function buildSongFolderMarkerText(installedSong: InstalledSong): string {
  const marker: SongFolderMarker = { format: MARKER_FORMAT, version: 1, vaultSongId: installedSong.vaultSongId, installId: installedSong.installId };
  return `${JSON.stringify(marker, null, 2)}\n`;
}

/** null for anything that isn't a marker Sync wrote: a folder with a broken marker is treated as the player's. */
export function parseSongFolderMarker(text: string): SongFolderMarker | null {
  const value = parseJsonOrNull(text);
  if (!isRecord(value) || value.format !== MARKER_FORMAT || value.version !== 1) return null;
  if (typeof value.vaultSongId !== 'string' || typeof value.installId !== 'string') return null;
  return { format: MARKER_FORMAT, version: 1, vaultSongId: value.vaultSongId, installId: value.installId };
}

export function isMarkerOf({ marker, installedSong }: { marker: SongFolderMarker | null; installedSong: InstalledSong }): boolean {
  return marker?.vaultSongId === installedSong.vaultSongId && marker.installId === installedSong.installId;
}

function parseJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

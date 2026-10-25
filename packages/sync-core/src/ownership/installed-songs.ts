import { getNameKey, getPathKey, type SongsPath } from '../songs-folder/songs-path';
import type { GeneratedSong } from './generated-songs';

/** One song folder Sync wrote. The record of these is kept by the website or the app, outside the Songs folder. */
export interface InstalledSong {
  vaultSongId: string;
  /** Changes on StepsVault whenever the song's steps change. */
  chartVersion: string;
  /** New for every install, so a marker copied into another folder (or from another computer) never matches. */
  installId: string;
  /** `[group, song folder]` inside the Songs folder. */
  folderPath: SongsPath;
  /** A hash of each chart file Sync wrote, to tell when the player has edited one. */
  chartHashesByFileName: Readonly<Record<string, string>>;
  /** The player's music as it sits in the song folder, and how far the steps were moved to fit it. */
  music: InstalledMusic;
  installedAt: string;
}

export interface InstalledMusic {
  fileName: string;
  /** The song's video next to the music, if its source gave one; kept on every update. Older records have none. */
  videoFileName?: string | null;
  /** Seconds the player's copy starts later than StepsVault's (negative: earlier); reapplied on every update. */
  shiftSeconds: number;
}

export interface InstalledSongsRecord {
  version: 1;
  installedSongs: readonly InstalledSong[];
  /** Group folders Sync created; a group the player made is never one of these, even with the same name. */
  ownedGroupNames: readonly string[];
  /** Songs made with a community generator; missing in records written before generators. */
  generatedSongs?: readonly GeneratedSong[];
}

export function buildEmptyInstalledSongsRecord(): InstalledSongsRecord {
  return { version: 1, installedSongs: [], ownedGroupNames: [] };
}

export function withInstalledSong({ record, installedSong }: { record: InstalledSongsRecord; installedSong: InstalledSong }): InstalledSongsRecord {
  const otherSongs = record.installedSongs.filter((song) => song.vaultSongId !== installedSong.vaultSongId);
  return { ...record, installedSongs: [...otherSongs, installedSong] };
}

export function withoutInstalledSong({ record, vaultSongId }: { record: InstalledSongsRecord; vaultSongId: string }): InstalledSongsRecord {
  return { ...record, installedSongs: record.installedSongs.filter((song) => song.vaultSongId !== vaultSongId) };
}

export function withOwnedGroup({ record, groupName }: { record: InstalledSongsRecord; groupName: string }): InstalledSongsRecord {
  if (isOwnedGroup({ record, groupName })) return record;
  return { ...record, ownedGroupNames: [...record.ownedGroupNames, groupName] };
}

export function isOwnedGroup({ record, groupName }: { record: InstalledSongsRecord; groupName: string }): boolean {
  return record.ownedGroupNames.some((ownedName) => getNameKey(ownedName) === getNameKey(groupName));
}

export function findInstalledSong({ record, vaultSongId }: { record: InstalledSongsRecord; vaultSongId: string }): InstalledSong | undefined {
  return record.installedSongs.find((song) => song.vaultSongId === vaultSongId);
}

export function findInstalledSongAt({ record, folderPath }: { record: InstalledSongsRecord; folderPath: SongsPath }): InstalledSong | undefined {
  const pathKey = getPathKey(folderPath);
  return record.installedSongs.find((song) => getPathKey(song.folderPath) === pathKey);
}

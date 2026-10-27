import type { GeneratorDifficulty, GeneratorSongFacts } from '../generators/generator-protocol';
import type { SongsPath } from '../songs-folder/songs-path';
import type { InstalledSongsRecord } from './installed-songs';

/** A song folder Sync wrote from a community generator's files. It is the player's alone and never in the vault. */
export interface GeneratedSong {
  /** getGeneratedSongKey(song): making the same song again replaces this one. */
  songKey: string;
  song: GeneratorSongFacts;
  generatorId: string;
  generatorVersion: string;
  generatorName: string;
  difficulties: readonly GeneratorDifficulty[];
  /** Each made chart's level, from the song file; missing for songs written before Sync kept them. */
  levelsByDifficulty?: Partial<Record<GeneratorDifficulty, number>>;
  /** New for every write, so a marker copied into another folder never matches. */
  installId: string;
  /** `[group, song folder]` inside the Songs folder. */
  folderPath: SongsPath;
  /** The vault song the player chose to replace with this one in the game; null when the vault has no such song. */
  inPlaceOfVaultSongId: string | null;
  generatedAt: string;
}

/** Records written before generators have no list of generated songs. */
export function getGeneratedSongs(record: InstalledSongsRecord): readonly GeneratedSong[] {
  return record.generatedSongs ?? [];
}

export function findGeneratedSong({ record, songKey }: { record: InstalledSongsRecord; songKey: string }): GeneratedSong | undefined {
  return getGeneratedSongs(record).find((generatedSong) => generatedSong.songKey === songKey);
}

/** Adds the song, or replaces the earlier version of the same song. */
export function withGeneratedSong({ record, generatedSong }: { record: InstalledSongsRecord; generatedSong: GeneratedSong }): InstalledSongsRecord {
  const otherSongs = getGeneratedSongs(record).filter((song) => song.songKey !== generatedSong.songKey);
  return { ...record, generatedSongs: [...otherSongs, generatedSong] };
}

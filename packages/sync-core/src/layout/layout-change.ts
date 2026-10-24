import type { InstalledSongsRecord } from '../ownership/installed-songs';
import { isSamePath, type SongsPath } from '../songs-folder/songs-path';

export interface SongFolderMove {
  vaultSongId: string;
  from: SongsPath;
  to: SongsPath;
}

/**
 * The installed songs that must move to reach the target paths. Every move resets that song's StepMania scores
 * (they are kept by folder), so the screen shows how many songs move before asking.
 */
export function getSongFolderMoves({ record, targetPathsBySongId }: { record: InstalledSongsRecord; targetPathsBySongId: ReadonlyMap<string, SongsPath> }): SongFolderMove[] {
  return record.installedSongs.flatMap((installedSong) => {
    const target = targetPathsBySongId.get(installedSong.vaultSongId);
    if (!target || isSamePath({ first: installedSong.folderPath, second: target })) return [];
    return [{ vaultSongId: installedSong.vaultSongId, from: installedSong.folderPath, to: target }];
  });
}

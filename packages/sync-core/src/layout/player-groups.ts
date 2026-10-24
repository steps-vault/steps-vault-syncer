import { isOwnedGroup, type InstalledSongsRecord } from '../ownership/installed-songs';
import type { SongsFolder } from '../songs-folder/songs-folder';

/** Every top-level folder Sync didn't create: the player's groups, which Sync never touches. */
export async function getPlayerGroupNames({ songsFolder, record }: { songsFolder: SongsFolder; record: InstalledSongsRecord }): Promise<string[]> {
  const entries = await songsFolder.listEntries([]);
  return entries.filter((entry) => entry.isFolder && !isOwnedGroup({ record, groupName: entry.name })).map((entry) => entry.name);
}

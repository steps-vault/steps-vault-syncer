import type { SongsFolder } from '../songs-folder/songs-folder';
import { getNameKey } from '../songs-folder/songs-path';
import { checkInstalledSong, type InstalledSongCheck } from './installed-song-check';
import type { InstalledSong, InstalledSongsRecord } from './installed-songs';

/**
 * A game folder Sync made for one party list, with copies of the list's songs. It stands apart from the folder layout:
 * a song can be in its layout folder and in any number of party folders at once.
 */
export interface PartyFolder {
  partyListId: string;
  /** The list's name at the last sync, so the screens can still name the folder after the list is gone. */
  listName: string;
  /** What the folder was named from (getPartyFolderBaseName): a list keeps its folder until it is renamed. */
  baseName: string;
  /** The folder in Songs, after the "name already yours" rule, for example "Party - Maya's birthday". */
  groupName: string;
  /** One copy per song, each with its own marker, like any song folder Sync writes. */
  installedSongs: readonly InstalledSong[];
}

export interface PartyFolderCheck {
  partyListId: string;
  /** checkInstalledSong() for every copy in the folder. */
  checks: InstalledSongCheck[];
}

/** Records written before party lists have none. */
export function getPartyFolders(record: InstalledSongsRecord): readonly PartyFolder[] {
  return record.partyFolders ?? [];
}

export function findPartyFolder({ record, partyListId }: { record: InstalledSongsRecord; partyListId: string }): PartyFolder | undefined {
  return getPartyFolders(record).find((partyFolder) => partyFolder.partyListId === partyListId);
}

/** A folder with no copies left drops out: the record keeps only what is in the game. */
export function withPartyFolder({ record, partyFolder }: { record: InstalledSongsRecord; partyFolder: PartyFolder }): InstalledSongsRecord {
  const otherFolders = getPartyFolders(record).filter((folder) => folder.partyListId !== partyFolder.partyListId);
  return { ...record, partyFolders: partyFolder.installedSongs.length > 0 ? [...otherFolders, partyFolder] : otherFolders };
}

/**
 * One party folder's copies as a record of their own, so the planner and the executor handle them exactly like the
 * layout's songs (one copy per song inside a folder). The owned groups are the whole record's.
 */
export function buildPartyFolderSongsRecord({ record, partyListId }: { record: InstalledSongsRecord; partyListId: string }): InstalledSongsRecord {
  return { version: 1, installedSongs: findPartyFolder({ record, partyListId })?.installedSongs ?? [], ownedGroupNames: record.ownedGroupNames };
}

export async function checkPartyFolders({ songsFolder, record }: { songsFolder: SongsFolder; record: InstalledSongsRecord }): Promise<PartyFolderCheck[]> {
  return Promise.all(getPartyFolders(record).map(async (partyFolder) => ({
    partyListId: partyFolder.partyListId,
    checks: await Promise.all(partyFolder.installedSongs.map((installedSong) => checkInstalledSong({ songsFolder, installedSong }))),
  })));
}

/** Every song folder Sync wrote, in the layout and in party folders, as `group/folder` name keys. */
export function getOwnSongFolderKeys(record: InstalledSongsRecord): Set<string> {
  const installedSongs = [...record.installedSongs, ...getPartyFolders(record).flatMap((partyFolder) => partyFolder.installedSongs)];
  return new Set(installedSongs.map((installedSong) => installedSong.folderPath.map(getNameKey).join('/')));
}

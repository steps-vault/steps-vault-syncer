import { findInstalledSong, type InstalledSongsRecord } from '../ownership/installed-songs';
import { buildSongsPath, getNameKey, type SongsPath } from '../songs-folder/songs-path';
import { getSafeFolderName } from './safe-folder-name';

export type FolderLayout = 'one-group' | 'by-genre' | 'by-artist';

export const ONE_GROUP_NAME = 'StepsVault';
/** Plain ASCII, like every folder name Sync writes (see getSafeFolderName). */
export const CLASH_PREFIX = 'StepsVault - ';
const UNKNOWN_GENRE_NAME = 'Other';
const UNKNOWN_ARTIST_NAME = 'Unknown artist';
const UNKNOWN_TITLE_NAME = 'Untitled';

/** What layout needs to know about a vault song. */
export interface SongFolderFacts {
  vaultSongId: string;
  title: string;
  artist: string;
  /** The title and artist in English letters when they are written in another script; folders are named by them. */
  titleTransliteration?: string | null;
  artistTransliteration?: string | null;
  genre: string | null;
}

/** The names a song folder is named from. */
export type SongFolderNames = Pick<SongFolderFacts, 'title' | 'artist' | 'titleTransliteration' | 'artistTransliteration'>;

function getFolderTitle(song: SongFolderNames): string {
  return song.titleTransliteration || song.title;
}

function getFolderArtist(song: SongFolderNames): string {
  return song.artistTransliteration || song.artist;
}

export function getGroupBaseName({ layout, song }: { layout: FolderLayout; song: SongFolderFacts }): string {
  if (layout === 'one-group') return ONE_GROUP_NAME;
  if (layout === 'by-genre') return getSafeFolderName({ name: song.genre ?? '', fallback: UNKNOWN_GENRE_NAME });
  return getSafeFolderName({ name: getFolderArtist(song), fallback: UNKNOWN_ARTIST_NAME });
}

/**
 * Our group keeps its plain name unless the player already has a folder called that (compared without case); then
 * it becomes "StepsVault - <name>", so the player's folder and ours never mix.
 */
export function getGroupName({ baseName, playerGroupNames }: { baseName: string; playerGroupNames: readonly string[] }): string {
  const playerNameKeys = new Set(playerGroupNames.map(getNameKey));
  if (!playerNameKeys.has(getNameKey(baseName))) return baseName;
  return getUnusedName({ preferredName: `${CLASH_PREFIX}${baseName}`, takenNameKeys: playerNameKeys });
}

export interface TargetFolderOptions {
  songs: readonly SongFolderFacts[];
  layout: FolderLayout;
  /** Top-level folders in the Songs folder that Sync didn't create. */
  playerGroupNames: readonly string[];
  record: InstalledSongsRecord;
  /** Folders inside our groups that aren't ours (the player put them there), by group name key. */
  foreignFolderNamesByGroupKey?: ReadonlyMap<string, readonly string[]>;
}

/**
 * Where each song belongs. An installed song already in its right group keeps its folder name, so a new song with
 * the same title never renames it (StepMania keeps scores by folder). New and moving songs get names no one uses.
 */
export function getTargetFolderPaths(options: TargetFolderOptions): Map<string, SongsPath> {
  const groupNamesBySongId = new Map(options.songs.map((song) => [song.vaultSongId, getGroupName({ baseName: getGroupBaseName({ layout: options.layout, song }), playerGroupNames: options.playerGroupNames })]));
  const takenNameKeysByGroupKey = getForeignNameKeysByGroupKey(options.foreignFolderNamesByGroupKey);
  const targetPathsBySongId = new Map<string, SongsPath>();
  for (const song of options.songs) {
    const keptPath = getKeptPath({ song, groupName: groupNamesBySongId.get(song.vaultSongId) ?? ONE_GROUP_NAME, record: options.record });
    if (keptPath) reserveTarget({ song, path: keptPath, targetPathsBySongId, takenNameKeysByGroupKey });
  }
  for (const song of [...options.songs].sort(compareSongsForNaming)) {
    if (targetPathsBySongId.has(song.vaultSongId)) continue;
    const groupName = groupNamesBySongId.get(song.vaultSongId) ?? ONE_GROUP_NAME;
    const folderName = getNewSongFolderName({ song, takenNameKeys: getTakenNameKeys({ takenNameKeysByGroupKey, groupName }) });
    reserveTarget({ song, path: buildSongsPath(groupName, folderName), targetPathsBySongId, takenNameKeysByGroupKey });
  }
  return targetPathsBySongId;
}

function getKeptPath({ song, groupName, record }: { song: SongFolderFacts; groupName: string; record: InstalledSongsRecord }): SongsPath | null {
  const installedSong = findInstalledSong({ record, vaultSongId: song.vaultSongId });
  const [installedGroupName, installedFolderName] = installedSong?.folderPath ?? [];
  if (installedGroupName === undefined || installedFolderName === undefined) return null;
  return getNameKey(installedGroupName) === getNameKey(groupName) ? buildSongsPath(groupName, installedFolderName) : null;
}

/** "Sorry", then "Sorry (Justin Bieber)", then "Sorry (Justin Bieber) 2". */
export function getNewSongFolderName({ song, takenNameKeys }: { song: SongFolderNames; takenNameKeys: ReadonlySet<string> }): string {
  const title = getSafeFolderName({ name: getFolderTitle(song), fallback: UNKNOWN_TITLE_NAME });
  if (!takenNameKeys.has(getNameKey(title))) return title;
  const withArtist = getSafeFolderName({ name: `${getFolderTitle(song)} (${getFolderArtist(song)})`, fallback: title });
  return getUnusedName({ preferredName: withArtist, takenNameKeys });
}

function getUnusedName({ preferredName, takenNameKeys }: { preferredName: string; takenNameKeys: ReadonlySet<string> }): string {
  let candidate = preferredName;
  for (let number = 2; takenNameKeys.has(getNameKey(candidate)); number += 1) candidate = `${preferredName} ${number}`;
  return candidate;
}

function reserveTarget(options: { song: SongFolderFacts; path: SongsPath; targetPathsBySongId: Map<string, SongsPath>; takenNameKeysByGroupKey: Map<string, Set<string>> }): void {
  const [groupName, folderName] = options.path;
  if (groupName === undefined || folderName === undefined) return;
  options.targetPathsBySongId.set(options.song.vaultSongId, options.path);
  getTakenNameKeys({ takenNameKeysByGroupKey: options.takenNameKeysByGroupKey, groupName }).add(getNameKey(folderName));
}

function getTakenNameKeys({ takenNameKeysByGroupKey, groupName }: { takenNameKeysByGroupKey: Map<string, Set<string>>; groupName: string }): Set<string> {
  const groupKey = getNameKey(groupName);
  const takenNameKeys = takenNameKeysByGroupKey.get(groupKey) ?? new Set<string>();
  takenNameKeysByGroupKey.set(groupKey, takenNameKeys);
  return takenNameKeys;
}

function getForeignNameKeysByGroupKey(foreignFolderNamesByGroupKey: ReadonlyMap<string, readonly string[]> | undefined): Map<string, Set<string>> {
  return new Map([...(foreignFolderNamesByGroupKey ?? [])].map(([groupKey, names]) => [groupKey, new Set(names.map(getNameKey))]));
}

/** A fixed order, so two computers syncing the same vault choose the same names. */
function compareSongsForNaming(first: SongFolderFacts, second: SongFolderFacts): number {
  return first.vaultSongId < second.vaultSongId ? -1 : first.vaultSongId > second.vaultSongId ? 1 : 0;
}

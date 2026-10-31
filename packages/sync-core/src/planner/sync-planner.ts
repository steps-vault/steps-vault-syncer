import { getSongFolderPaths, getTargetFolderPaths, type FolderLayout } from '../layout/folder-layout';
import { getPartyFolderBaseName, getPartyFolderNames } from '../layout/party-folder-names';
import type { InstalledSongCheck } from '../ownership/installed-song-check';
import type { InstalledSongsRecord } from '../ownership/installed-songs';
import { getPartyFolders, type PartyFolder, type PartyFolderCheck } from '../ownership/party-folders';
import { getNameKey, isSamePath, type SongsPath } from '../songs-folder/songs-path';
import type { AudioMatch, PartyFolderPlan, PartyListToSync, PlayerChoices, SongPlan, SyncAction, SyncPlan, VaultSong } from './sync-plan-types';

export interface SyncPlanInput {
  vaultSongs: readonly VaultSong[];
  record: InstalledSongsRecord;
  /** checkInstalledSongs() for every song in the record. */
  checks: readonly InstalledSongCheck[];
  audioMatchesBySongId: ReadonlyMap<string, AudioMatch>;
  layout: FolderLayout;
  playerGroupNames: readonly string[];
  foreignFolderNamesByGroupKey?: ReadonlyMap<string, readonly string[]>;
  choices: PlayerChoices;
  shouldUpdateAutomatically: boolean;
  /**
   * The party lists the player syncs. Missing or null when the site didn't say (an older site without party lists, or
   * it couldn't be reached): the party folders then stay exactly as they are, since an unknown list hasn't ended.
   */
  partyLists?: readonly PartyListToSync[] | null;
  /** checkPartyFolders() for every party folder in the record. */
  partyFolderChecks?: readonly PartyFolderCheck[];
}

/**
 * What to do for every song, and the status each row shows. Pure: it reads nothing and writes nothing, so the same
 * input always gives the same plan, and a plan that has been carried out plans nothing more.
 */
export function buildSyncPlan(input: SyncPlanInput): SyncPlan {
  const partyFolders = getPartyFolders(input.record);
  const partyFolderNamesById = getPartyFolderNames({ partyLists: input.partyLists ?? [], partyFolders, playerGroupNames: input.playerGroupNames, ownedGroupNames: input.record.ownedGroupNames });
  // The layout never puts a song into a party folder: to it, those names are taken like the player's own.
  const partyGroupNames = [...partyFolderNamesById.values(), ...partyFolders.map((partyFolder) => partyFolder.groupName)];
  const layoutPlan = buildLayoutPlan({ ...input, playerGroupNames: [...input.playerGroupNames, ...partyGroupNames] });
  if (!input.partyLists) return layoutPlan;
  return { ...layoutPlan, partyFolderPlans: buildPartyFolderPlans({ input, partyLists: input.partyLists, partyFolderNamesById }) };
}

function buildLayoutPlan(input: SyncPlanInput): SyncPlan {
  const checksBySongId = new Map(input.checks.map((check) => [check.installedSong.vaultSongId, check]));
  const targetPathsBySongId = getTargetFolderPaths({
    songs: input.vaultSongs,
    layout: input.layout,
    playerGroupNames: input.playerGroupNames,
    record: { ...input.record, installedSongs: input.checks.filter(isStillOurs).map((check) => check.installedSong) },
    foreignFolderNamesByGroupKey: withLostFoldersAsForeign({ foreignFolderNamesByGroupKey: input.foreignFolderNamesByGroupKey, checks: input.checks }),
  });
  const vaultSongPlans = input.vaultSongs.map((song) => planVaultSong({ song, check: checksBySongId.get(song.vaultSongId), target: targetPathsBySongId.get(song.vaultSongId), input }));
  const vaultSongIds = new Set(input.vaultSongs.map((song) => song.vaultSongId));
  const leftChecks = input.checks.filter((check) => !vaultSongIds.has(check.installedSong.vaultSongId));
  return {
    songPlans: [...vaultSongPlans, ...leftChecks.filter(isStillOurs).map((check) => planSongLeftTheVault({ check, choices: input.choices }))],
    forgetActions: leftChecks.filter((check) => !isStillOurs(check)).map((check) => buildForgetAction(check)),
  };
}

function planVaultSong({ song, check, target, input }: { song: VaultSong; check: InstalledSongCheck | undefined; target: SongsPath | undefined; input: SyncPlanInput }): SongPlan {
  if (!target) throw new Error(`No folder was chosen for the vault song ${song.vaultSongId}. This is a bug in Sync; please report it.`);
  if (!check || !isStillOurs(check)) {
    const forgetActions = check ? [buildForgetAction(check)] : [];
    return planNewSong({ song, target, match: input.audioMatchesBySongId.get(song.vaultSongId), forgetActions });
  }
  const isReplacingEdits = input.choices.replaceEditedSongIds.has(song.vaultSongId);
  if (check.state === 'edited' && !isReplacingEdits) return planEditedSong({ song, check, target });
  return planInstalledSong({ song, check, target, isUpdateWanted: isReplacingEdits || input.shouldUpdateAutomatically || input.choices.updateSongIds.has(song.vaultSongId), isReplacingEdits });
}

function planNewSong({ song, target, match, forgetActions }: { song: VaultSong; target: SongsPath; match: AudioMatch | undefined; forgetActions: SyncAction[] }): SongPlan {
  const vaultSongId = song.vaultSongId;
  if (match?.kind === 'matched') {
    const addAction: SyncAction = { kind: 'add', vaultSongId, to: target, chartVersion: song.chartVersion, audio: { sourceId: match.sourceId, shiftSeconds: match.shiftSeconds, videoSourceId: match.videoSourceId ?? null } };
    return { vaultSongId, status: 'syncing', actions: [...forgetActions, addAction], isWaitingForAddon: false };
  }
  if (match?.kind === 'different-edit') return { vaultSongId, status: 'different-edit', actions: forgetActions, isWaitingForAddon: false };
  return { vaultSongId, status: 'needs-audio', actions: forgetActions, isWaitingForAddon: match?.isWaitingForAddon ?? false };
}

/** The player's edits stay: the song can still move with a layout change (its files move untouched), never update. */
function planEditedSong({ song, check, target }: { song: VaultSong; check: InstalledSongCheck; target: SongsPath }): SongPlan {
  const actions = getMoveActions({ vaultSongId: song.vaultSongId, from: check.installedSong.folderPath, to: target });
  return { vaultSongId: song.vaultSongId, status: actions.length > 0 ? 'syncing' : 'you-edited-this', actions, isWaitingForAddon: false };
}

function planInstalledSong(options: { song: VaultSong; check: InstalledSongCheck; target: SongsPath; isUpdateWanted: boolean; isReplacingEdits: boolean }): SongPlan {
  const { song, check, target } = options;
  const vaultSongId = song.vaultSongId;
  const hasNewSteps = check.installedSong.chartVersion !== song.chartVersion;
  const shouldUpdate = options.isReplacingEdits || (hasNewSteps && options.isUpdateWanted);
  const updateActions: SyncAction[] = shouldUpdate ? [{ kind: 'update', vaultSongId, at: target, chartVersion: song.chartVersion }] : [];
  const actions = [...getMoveActions({ vaultSongId, from: check.installedSong.folderPath, to: target }), ...updateActions];
  if (actions.length > 0) return { vaultSongId, status: 'syncing', actions, isWaitingForAddon: false };
  return { vaultSongId, status: hasNewSteps ? 'update-available' : 'synced', actions, isWaitingForAddon: false };
}

/** Removing a song from the vault never removes it from the game unless the player says so. */
function planSongLeftTheVault({ check, choices }: { check: InstalledSongCheck; choices: PlayerChoices }): SongPlan {
  const { vaultSongId, folderPath } = check.installedSong;
  if (!choices.removeFromGameSongIds.has(vaultSongId)) return { vaultSongId, status: 'removed-from-vault', actions: [], isWaitingForAddon: false };
  return { vaultSongId, status: 'syncing', actions: [{ kind: 'remove', vaultSongId, at: folderPath }], isWaitingForAddon: false };
}

function buildPartyFolderPlans({ input, partyLists, partyFolderNamesById }: { input: SyncPlanInput; partyLists: readonly PartyListToSync[]; partyFolderNamesById: ReadonlyMap<string, string> }): PartyFolderPlan[] {
  const checksByPartyListId = new Map((input.partyFolderChecks ?? []).map((folderCheck) => [folderCheck.partyListId, folderCheck.checks]));
  const syncedPartyListIds = new Set(partyLists.map((partyList) => partyList.partyListId));
  const syncedFolderPlans = partyLists.map((partyList) => planSyncedPartyFolder({
    partyList,
    groupName: partyFolderNamesById.get(partyList.partyListId) ?? getPartyFolderBaseName(partyList.gameFolderName),
    checks: checksByPartyListId.get(partyList.partyListId) ?? [],
    input,
  }));
  const goneFolders = getPartyFolders(input.record).filter((partyFolder) => !syncedPartyListIds.has(partyFolder.partyListId));
  const goneFolderPlans = goneFolders.map((partyFolder) => planGonePartyFolder({ partyFolder, checks: checksByPartyListId.get(partyFolder.partyListId) ?? [] }));
  return [...syncedFolderPlans, ...goneFolderPlans];
}

/** Copies of the list's ready songs, planned like layout songs but all in the list's own folder. */
function planSyncedPartyFolder({ partyList, groupName, checks, input }: { partyList: PartyListToSync; groupName: string; checks: readonly InstalledSongCheck[]; input: SyncPlanInput }): PartyFolderPlan {
  const songs = getSongsOnce(partyList.songs);
  const targetPathsBySongId = getSongFolderPaths({
    songs,
    groupNamesBySongId: new Map(songs.map((song) => [song.vaultSongId, groupName])),
    record: { version: 1, installedSongs: checks.filter(isStillOurs).map((check) => check.installedSong), ownedGroupNames: [] },
    foreignFolderNamesByGroupKey: withLostFoldersAsForeign({ foreignFolderNamesByGroupKey: input.foreignFolderNamesByGroupKey, checks }),
  });
  const checksBySongId = new Map(checks.map((check) => [check.installedSong.vaultSongId, check]));
  const songIds = new Set(songs.map((song) => song.vaultSongId));
  const leftChecks = checks.filter((check) => !songIds.has(check.installedSong.vaultSongId));
  return {
    partyListId: partyList.partyListId,
    listName: partyList.name,
    baseName: getPartyFolderBaseName(partyList.gameFolderName),
    groupName,
    isSynced: true,
    songPlans: [
      ...songs.map((song) => planVaultSong({ song, check: checksBySongId.get(song.vaultSongId), target: targetPathsBySongId.get(song.vaultSongId), input })),
      ...leftChecks.filter(isStillOurs).map((check) => planCopyLeftTheList(check)),
    ],
    forgetActions: leftChecks.filter((check) => !isStillOurs(check)).map((check) => buildForgetAction(check)),
  };
}

/** The list ended, was deleted or isn't synced any more: known from the record alone, so it works after the site forgot it. */
function planGonePartyFolder({ partyFolder, checks }: { partyFolder: PartyFolder; checks: readonly InstalledSongCheck[] }): PartyFolderPlan {
  return {
    partyListId: partyFolder.partyListId,
    listName: partyFolder.listName,
    baseName: partyFolder.baseName,
    groupName: partyFolder.groupName,
    isSynced: false,
    songPlans: checks.filter(isStillOurs).map((check) => planCopyLeftTheList(check)),
    forgetActions: checks.filter((check) => !isStillOurs(check)).map((check) => buildForgetAction(check)),
  };
}

/** A copy goes with its list. One the player edited stays in the game as theirs: Sync never deletes the player's edits. */
function planCopyLeftTheList(check: InstalledSongCheck): SongPlan {
  const { vaultSongId, folderPath } = check.installedSong;
  if (check.state === 'edited') return { vaultSongId, status: 'you-edited-this', actions: [buildForgetAction(check)], isWaitingForAddon: false };
  return { vaultSongId, status: 'syncing', actions: [{ kind: 'remove', vaultSongId, at: folderPath }], isWaitingForAddon: false };
}

/** A list holds each song once; should the site ever send one twice, the first one counts. */
function getSongsOnce(songs: readonly VaultSong[]): VaultSong[] {
  const seenSongIds = new Set<string>();
  return songs.filter((song) => {
    if (seenSongIds.has(song.vaultSongId)) return false;
    seenSongIds.add(song.vaultSongId);
    return true;
  });
}

function getMoveActions({ vaultSongId, from, to }: { vaultSongId: string; from: SongsPath; to: SongsPath }): SyncAction[] {
  return isSamePath({ first: from, second: to }) ? [] : [{ kind: 'move', vaultSongId, from, to }];
}

function buildForgetAction(check: InstalledSongCheck): SyncAction {
  return { kind: 'forget', vaultSongId: check.installedSong.vaultSongId };
}

function isStillOurs(check: InstalledSongCheck): boolean {
  return check.state === 'intact' || check.state === 'edited';
}

/** A folder the player replaced keeps its name for them: a new install of that song must pick another. */
function withLostFoldersAsForeign({ foreignFolderNamesByGroupKey, checks }: { foreignFolderNamesByGroupKey: ReadonlyMap<string, readonly string[]> | undefined; checks: readonly InstalledSongCheck[] }): Map<string, string[]> {
  const namesByGroupKey = new Map([...(foreignFolderNamesByGroupKey ?? [])].map(([groupKey, names]) => [groupKey, [...names]]));
  for (const check of checks.filter((candidate) => candidate.state === 'not-ours')) {
    const [groupName, folderName] = check.installedSong.folderPath;
    if (groupName === undefined || folderName === undefined) continue;
    const groupKey = getNameKey(groupName);
    namesByGroupKey.set(groupKey, [...(namesByGroupKey.get(groupKey) ?? []), folderName]);
  }
  return namesByGroupKey;
}

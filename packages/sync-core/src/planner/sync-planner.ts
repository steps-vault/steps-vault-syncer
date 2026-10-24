import { getTargetFolderPaths, type FolderLayout } from '../layout/folder-layout';
import type { InstalledSongCheck } from '../ownership/installed-song-check';
import type { InstalledSongsRecord } from '../ownership/installed-songs';
import { getNameKey, isSamePath, type SongsPath } from '../songs-folder/songs-path';
import type { AudioMatch, PlayerChoices, SongPlan, SyncAction, SyncPlan, VaultSong } from './sync-plan-types';

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
}

/**
 * What to do for every song, and the status each row shows. Pure: it reads nothing and writes nothing, so the same
 * input always gives the same plan, and a plan that has been carried out plans nothing more.
 */
export function buildSyncPlan(input: SyncPlanInput): SyncPlan {
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
    const addAction: SyncAction = { kind: 'add', vaultSongId, to: target, chartVersion: song.chartVersion, audio: { sourceId: match.sourceId, shiftSeconds: match.shiftSeconds } };
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

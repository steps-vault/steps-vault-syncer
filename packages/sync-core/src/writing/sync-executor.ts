import { findInstalledSong, withInstalledSong, withOwnedGroup, withoutInstalledSong, type InstalledSong, type InstalledSongsRecord } from '../ownership/installed-songs';
import { buildPartyFolderSongsRecord, findPartyFolder, getPartyFolders, withPartyFolder, type PartyFolder } from '../ownership/party-folders';
import type { PartyFolderPlan, SongPlan, SyncAction, SyncPlan } from '../planner/sync-plan-types';
import { buildSongsPath, getNameKey } from '../songs-folder/songs-path';
import { addSong, moveSong, removeSong, updateSong, type SongWriterDependencies } from './song-writer';
import { SongWriteError, toSongWriteError, type SongWriteFailure } from './song-write-error';

export type ActivityKind = 'added' | 'updated' | 'moved' | 'removed' | 'failed';

/** One line of the Activity screen. */
export interface ActivityEvent {
  vaultSongId: string;
  kind: ActivityKind;
  at: string;
  folderPath: readonly string[];
  failure?: SongWriteFailure;
  message?: string;
  /** Set for a copy in a party list's folder; the song may also have a folder of its own in the layout. */
  partyListId?: string;
}

export interface SyncProgress {
  doneSongCount: number;
  totalSongCount: number;
  vaultSongId: string;
}

export interface SyncResult {
  record: InstalledSongsRecord;
  events: ActivityEvent[];
}

/**
 * Carries out a plan song by song. A song that fails stops only itself; the record is updated after every action
 * that worked, so `onRecordChange` can save it and a crash halfway never forgets a folder Sync wrote.
 */
export async function carryOutSyncPlan(options: {
  plan: SyncPlan;
  record: InstalledSongsRecord;
  dependencies: SongWriterDependencies;
  onProgress?: (progress: SyncProgress) => void;
  onRecordChange?: (record: InstalledSongsRecord) => Promise<void>;
}): Promise<SyncResult> {
  const partyFolderPlans = options.plan.partyFolderPlans ?? [];
  const layoutRecord = options.plan.forgetActions.reduce((current, action) => withoutInstalledSong({ record: current, vaultSongId: action.vaultSongId }), options.record);
  let record = withPartyFolderForgetActions({ record: layoutRecord, partyFolderPlans });
  const events: ActivityEvent[] = [];
  const songWorks = getSongWorks(options.plan);
  for (const [index, songWork] of songWorks.entries()) {
    const result = songWork.partyFolderPlan
      ? await carryOutPartySongPlan({ songPlan: songWork.songPlan, partyFolderPlan: songWork.partyFolderPlan, record, dependencies: options.dependencies })
      : await carryOutSongPlan({ songPlan: songWork.songPlan, record, dependencies: options.dependencies });
    record = result.record;
    events.push(...result.events);
    await options.onRecordChange?.(record);
    options.onProgress?.({ doneSongCount: index + 1, totalSongCount: songWorks.length, vaultSongId: songWork.songPlan.vaultSongId });
  }
  return { record: await removeEmptyOwnedGroups({ record, dependencies: options.dependencies }), events };
}

interface SongWork {
  songPlan: SongPlan;
  /** Set for a copy in a party list's folder. */
  partyFolderPlan: PartyFolderPlan | null;
}

/** The layout's songs first, then the party folders' copies, skipping songs with nothing to do. */
function getSongWorks(plan: SyncPlan): SongWork[] {
  const layoutWorks = plan.songPlans.map((songPlan) => ({ songPlan, partyFolderPlan: null }));
  const partyWorks = (plan.partyFolderPlans ?? []).flatMap((partyFolderPlan) => partyFolderPlan.songPlans.map((songPlan) => ({ songPlan, partyFolderPlan })));
  return [...layoutWorks, ...partyWorks].filter((songWork) => songWork.songPlan.actions.length > 0);
}

/** Forgets the lost copies and brings each folder's list name up to date, before any copy is written. */
function withPartyFolderForgetActions({ record, partyFolderPlans }: { record: InstalledSongsRecord; partyFolderPlans: readonly PartyFolderPlan[] }): InstalledSongsRecord {
  return partyFolderPlans.reduce((current, partyFolderPlan) => {
    if (!findPartyFolder({ record: current, partyListId: partyFolderPlan.partyListId })) return current;
    const songsRecord = partyFolderPlan.forgetActions.reduce((songs, action) => withoutInstalledSong({ record: songs, vaultSongId: action.vaultSongId }), buildPartyFolderSongsRecord({ record: current, partyListId: partyFolderPlan.partyListId }));
    return withPartyFolder({ record: current, partyFolder: buildPartyFolder({ partyFolderPlan, installedSongs: songsRecord.installedSongs }) });
  }, record);
}

/** A copy is carried out like a layout song, inside a record of its folder's copies only, then put back. */
async function carryOutPartySongPlan(options: { songPlan: SongPlan; partyFolderPlan: PartyFolderPlan; record: InstalledSongsRecord; dependencies: SongWriterDependencies }): Promise<SyncResult> {
  const { partyFolderPlan, record } = options;
  const songsRecord = buildPartyFolderSongsRecord({ record, partyListId: partyFolderPlan.partyListId });
  const result = await carryOutSongPlan({ songPlan: options.songPlan, record: songsRecord, dependencies: options.dependencies });
  const partyFolder = buildPartyFolder({ partyFolderPlan, installedSongs: result.record.installedSongs });
  return {
    record: withPartyFolder({ record: { ...record, ownedGroupNames: result.record.ownedGroupNames }, partyFolder }),
    events: result.events.map((event) => ({ ...event, partyListId: partyFolderPlan.partyListId })),
  };
}

function buildPartyFolder({ partyFolderPlan, installedSongs }: { partyFolderPlan: PartyFolderPlan; installedSongs: readonly InstalledSong[] }): PartyFolder {
  const { partyListId, listName, baseName, groupName } = partyFolderPlan;
  return { partyListId, listName, baseName, groupName, installedSongs };
}

async function carryOutSongPlan({ songPlan, record, dependencies }: { songPlan: SongPlan; record: InstalledSongsRecord; dependencies: SongWriterDependencies }): Promise<SyncResult> {
  let currentRecord = record;
  const events: ActivityEvent[] = [];
  for (const action of songPlan.actions) {
    try {
      currentRecord = await carryOutAction({ action, record: currentRecord, dependencies });
      // Forgetting a lost folder is bookkeeping, not something Sync did in the game.
      if (action.kind !== 'forget') events.push(buildSuccessEvent({ action, record: currentRecord, at: dependencies.getNow() }));
    } catch (error) {
      const writeError = toSongWriteError(error);
      events.push({ vaultSongId: songPlan.vaultSongId, kind: 'failed', at: dependencies.getNow(), folderPath: getActionPath(action), failure: writeError.failure, message: writeError.message });
      break;
    }
  }
  return { record: currentRecord, events };
}

async function carryOutAction({ action, record, dependencies }: { action: SyncAction; record: InstalledSongsRecord; dependencies: SongWriterDependencies }): Promise<InstalledSongsRecord> {
  const { songsFolder } = dependencies;
  if (action.kind === 'forget') return withoutInstalledSong({ record, vaultSongId: action.vaultSongId });
  if (action.kind === 'add') return withSongInGroup({ record, installedSong: await addSong({ dependencies, action }) });
  const installedSong = findInstalledSong({ record, vaultSongId: action.vaultSongId });
  if (!installedSong) throw new SongWriteError({ failure: 'other', message: 'Sync lost track of this song. Sync again.' });
  if (action.kind === 'update') return withSongInGroup({ record, installedSong: await updateSong({ dependencies, action, installedSong }) });
  if (action.kind === 'move') return withSongInGroup({ record, installedSong: await moveSong({ songsFolder, installedSong, to: action.to }) });
  await removeSong({ songsFolder, installedSong });
  return withoutInstalledSong({ record, vaultSongId: action.vaultSongId });
}

function withSongInGroup({ record, installedSong }: { record: InstalledSongsRecord; installedSong: InstalledSong }): InstalledSongsRecord {
  const groupName = installedSong.folderPath[0];
  const withSong = withInstalledSong({ record, installedSong });
  return groupName === undefined ? withSong : withOwnedGroup({ record: withSong, groupName });
}

/** A group Sync created and emptied (after a layout change or removals) goes, so the song list has no empty groups. */
async function removeEmptyOwnedGroups({ record, dependencies }: { record: InstalledSongsRecord; dependencies: SongWriterDependencies }): Promise<InstalledSongsRecord> {
  const installedSongs = [...record.installedSongs, ...getPartyFolders(record).flatMap((partyFolder) => partyFolder.installedSongs)];
  const usedGroupKeys = new Set(installedSongs.map((song) => getNameKey(song.folderPath[0] ?? '')));
  let currentRecord = record;
  for (const groupName of record.ownedGroupNames.filter((name) => !usedGroupKeys.has(getNameKey(name)))) {
    const entries = await dependencies.songsFolder.listEntries(buildSongsPath(groupName));
    if (entries.length > 0) continue;
    await dependencies.songsFolder.removeFolder(buildSongsPath(groupName)).catch(() => undefined);
    currentRecord = { ...currentRecord, ownedGroupNames: currentRecord.ownedGroupNames.filter((name) => getNameKey(name) !== getNameKey(groupName)) };
  }
  return currentRecord;
}

const ACTIVITY_KIND_BY_ACTION_KIND = { add: 'added', update: 'updated', move: 'moved', remove: 'removed' } as const;

function buildSuccessEvent({ action, record, at }: { action: Exclude<SyncAction, { kind: 'forget' }>; record: InstalledSongsRecord; at: string }): ActivityEvent {
  const kind = ACTIVITY_KIND_BY_ACTION_KIND[action.kind];
  const folderPath = findInstalledSong({ record, vaultSongId: action.vaultSongId })?.folderPath ?? getActionPath(action);
  return { vaultSongId: action.vaultSongId, kind, at, folderPath };
}

function getActionPath(action: SyncAction): readonly string[] {
  if (action.kind === 'add' || action.kind === 'move') return action.to;
  if (action.kind === 'update' || action.kind === 'remove') return action.at;
  return [];
}

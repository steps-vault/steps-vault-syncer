/** Builds what the screens show about party lists' folders; shared by the website and the desktop app. */
import { getPartyFolders, type InstalledSongsRecord, type PartyFolder, type PartyFolderPlan, type SongSyncStatus, type SyncPartyList } from '@stepsvault/sync-core';
import type { LayoutPreview, PartyFolderView } from '../sync-ui-types';

const IN_GAME_STATUSES: ReadonlySet<SongSyncStatus> = new Set(['synced', 'update-available', 'you-edited-this']);
const NEEDS_AUDIO_STATUSES: ReadonlySet<SongSyncStatus> = new Set(['needs-audio', 'different-edit']);
const PREVIEW_FOLDER_COUNT = 2;
const PREVIEW_SONG_COUNT = 2;
const HOUR_MILLISECONDS = 60 * 60 * 1000;
const DAY_MILLISECONDS = 24 * HOUR_MILLISECONDS;

export interface PartyFolderViewInput {
  /** From the sync's final plan; missing when the site didn't say which lists the player syncs. */
  partyFolderPlans: readonly PartyFolderPlan[] | undefined;
  partyLists: readonly SyncPartyList[] | null;
  record: InstalledSongsRecord;
  now: Date;
}

/** Every party folder in the game, and every synced list, even before its first song is in. */
export function buildPartyFolderViews(input: PartyFolderViewInput): PartyFolderView[] {
  if (!input.partyFolderPlans) return getPartyFolders(input.record).map((partyFolder) => buildRecordedFolderView(partyFolder));
  const endsAtById = new Map((input.partyLists ?? []).map((partyList) => [partyList.partyListId, partyList.endsAt]));
  return input.partyFolderPlans
    .filter((folderPlan) => folderPlan.isSynced || folderPlan.songPlans.length > 0)
    .map((folderPlan) => buildPlannedFolderView({ folderPlan, endsAt: endsAtById.get(folderPlan.partyListId) ?? null, now: input.now }));
}

function buildPlannedFolderView({ folderPlan, endsAt, now }: { folderPlan: PartyFolderPlan; endsAt: string | null; now: Date }): PartyFolderView {
  const inGameCount = folderPlan.songPlans.filter((songPlan) => IN_GAME_STATUSES.has(songPlan.status)).length;
  const needsAudioCount = folderPlan.songPlans.filter((songPlan) => NEEDS_AUDIO_STATUSES.has(songPlan.status)).length;
  return {
    partyListId: folderPlan.partyListId,
    listName: folderPlan.listName,
    folderText: `Songs/${folderPlan.groupName}`,
    songCountText: folderPlan.isSynced && folderPlan.songPlans.length === 0 ? 'No ready songs yet' : describeSongsInGame(inGameCount),
    needsYouText: needsAudioCount === 0 ? null : `${String(needsAudioCount)} ${needsAudioCount === 1 ? 'needs' : 'need'} audio`,
    endsText: folderPlan.isSynced ? getPartyListEndText({ endsAt, now }) : null,
    isLeaving: !folderPlan.isSynced,
  };
}

/** The site didn't say this time, so the folder is shown as the last sync left it. */
function buildRecordedFolderView(partyFolder: PartyFolder): PartyFolderView {
  return {
    partyListId: partyFolder.partyListId,
    listName: partyFolder.listName,
    folderText: `Songs/${partyFolder.groupName}`,
    songCountText: describeSongsInGame(partyFolder.installedSongs.length),
    needsYouText: null,
    endsText: null,
    isLeaving: false,
  };
}

function describeSongsInGame(songCount: number): string {
  return `${String(songCount)} ${songCount === 1 ? 'song' : 'songs'} in your game`;
}

/** "Ends in 2d", "Ends in 5h", "Ends within the hour"; null without an end, or once it has passed. */
export function getPartyListEndText({ endsAt, now }: { endsAt: string | null; now: Date }): string | null {
  if (endsAt === null) return null;
  const leftMilliseconds = new Date(endsAt).getTime() - now.getTime();
  if (!(leftMilliseconds > 0)) return null;
  if (leftMilliseconds < HOUR_MILLISECONDS) return 'Ends within the hour';
  if (leftMilliseconds < DAY_MILLISECONDS) return `Ends in ${String(Math.floor(leftMilliseconds / HOUR_MILLISECONDS))}h`;
  return `Ends in ${String(Math.floor(leftMilliseconds / DAY_MILLISECONDS))}d`;
}

/** The player's own party folders for the Folder layout screen's small tree; null when they sync none yet. */
export function buildPartyFolderPreview({ partyFolderPlans, partyLists, now }: Omit<PartyFolderViewInput, 'record'>): LayoutPreview | null {
  const partyListsById = new Map((partyLists ?? []).map((partyList) => [partyList.partyListId, partyList]));
  const syncedFolderPlans = (partyFolderPlans ?? []).filter((folderPlan) => folderPlan.isSynced);
  if (syncedFolderPlans.length === 0) return null;
  const groups = syncedFolderPlans.slice(0, PREVIEW_FOLDER_COUNT).map((folderPlan) => {
    const partyList = partyListsById.get(folderPlan.partyListId);
    const songTitles = (partyList?.songs ?? []).map((song) => song.title);
    const endText = getPartyListEndText({ endsAt: partyList?.endsAt ?? null, now });
    return {
      groupName: folderPlan.groupName,
      isPartyFolder: true,
      ...(endText === null ? {} : { tagText: endText.toLowerCase() }),
      songTitles: songTitles.slice(0, PREVIEW_SONG_COUNT),
      moreSongCount: Math.max(0, songTitles.length - PREVIEW_SONG_COUNT),
      songTagText: 'copy',
    };
  });
  const moreFolderCount = syncedFolderPlans.length - groups.length;
  return { groups, ...(moreFolderCount > 0 ? { moreGroupsText: `+ ${String(moreFolderCount)} more party ${moreFolderCount === 1 ? 'list' : 'lists'}` } : {}) };
}

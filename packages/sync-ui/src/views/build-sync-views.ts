/** Builds what the screens show from a sync's results; shared by the website and the desktop app. */
import {
  CLASH_PREFIX,
  FOLDER_LAYOUTS,
  findInstalledSong,
  getSongFolderMoves,
  getTargetFolderPaths,
  isGeneratedSongActivityEvent,
  type ActivityEvent,
  type ActivityLogEvent,
  type GeneratedSongActivityEvent,
  type GeneratedSongActivityStep,
  type AudioSearchResult,
  type FolderLayout,
  type InstalledSongsRecord,
  type SongPlan,
  type VaultSongDetails,
} from '@stepsvault/sync-core';
import type { ActivityEntryView, ActivityKind, DifficultyLevels, LayoutPreview, LayoutPreviewGroup, LayoutPreviewsByLayout, SongAudioSource, SongDetailsView, SongRowView, TrayStatus } from '../sync-ui-types';
import { getGroupColorHex } from './group-colors';

const PREVIEW_GROUP_COUNT = 3;
const MORE_GROUP_NOUNS_BY_LAYOUT: Readonly<Record<FolderLayout, { one: string; many: string }>> = {
  'one-group': { one: 'group', many: 'groups' },
  'by-genre': { one: 'genre', many: 'genres' },
  'by-artist': { one: 'artist', many: 'artists' },
  'my-groups': { one: 'group', many: 'groups' },
};
const PREVIEW_SONG_COUNT = 3;
const ACTIVITY_KINDS_BY_EVENT_KIND: Readonly<Record<ActivityEvent['kind'], ActivityKind>> = { added: 'added', updated: 'updated', moved: 'moved', removed: 'removed', failed: 'write-failed' };
const ACTIVITY_VERBS_BY_EVENT_KIND: Readonly<Record<ActivityEvent['kind'], string>> = { added: 'Added ', updated: 'Updated ', moved: 'Moved ', removed: 'Removed ', failed: 'Couldn’t save ' };
const GENERATED_SONG_TEXTS_BY_STEP: Readonly<Record<GeneratedSongActivityStep, { kind: ActivityKind; textBefore: string; getTextAfter: (event: GeneratedSongActivityEvent) => string }>> = {
  'started': { kind: 'generating', textBefore: 'Started making ', getTextAfter: (event) => ` with ${event.generatorName}` },
  'resumed': { kind: 'generating', textBefore: 'Went on making ', getTextAfter: (event) => ` with ${event.generatorName}` },
  'not-cancelled': { kind: 'generating', textBefore: 'Couldn’t cancel ', getTextAfter: () => '' },
  'written': { kind: 'generated', textBefore: 'Made ', getTextAfter: (event) => ` with ${event.generatorName}` },
  'added-to-vault': { kind: 'generated', textBefore: 'Made ', getTextAfter: () => ' for the library' },
  'kept-vault-song': { kind: 'generated', textBefore: 'Kept the library song of ', getTextAfter: () => '' },
  'failed': { kind: 'generate-failed', textBefore: 'Couldn’t make ', getTextAfter: (event) => ` with ${event.generatorName}` },
  'cancelled': { kind: 'generate-cancelled', textBefore: 'Cancelled ', getTextAfter: () => '' },
};
const DAY_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const DAY_WITH_YEAR_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export interface SongViewInput {
  vaultSongs: readonly VaultSongDetails[];
  songPlans: readonly SongPlan[];
  audioResultsBySongId: ReadonlyMap<string, AudioSearchResult>;
  record: InstalledSongsRecord;
  pickedSongIds: ReadonlySet<string>;
  /** Which addon each downloaded file came from. */
  addonNamesBySourceId: ReadonlyMap<string, string>;
}

export function buildSongRows(input: SongViewInput): SongRowView[] {
  const plansBySongId = new Map(input.songPlans.map((songPlan) => [songPlan.vaultSongId, songPlan]));
  return input.vaultSongs.map((song) => ({
    vaultSongId: song.vaultSongId,
    title: song.title,
    artist: song.artist,
    genre: song.genre,
    coverArtUrl: null,
    levels: getDifficultyLevels(song.levels),
    status: plansBySongId.get(song.vaultSongId)?.status ?? 'needs-audio',
    audioSource: getAudioSource({ input, vaultSongId: song.vaultSongId }),
    addedAt: 0,
    note: getSongNote({ input, vaultSongId: song.vaultSongId }),
  }));
}

export function buildSongDetailsById(input: SongViewInput): Record<string, SongDetailsView> {
  const rowsById = new Map(buildSongRows(input).map((row) => [row.vaultSongId, row]));
  return Object.fromEntries(input.vaultSongs.flatMap((song) => {
    const row = rowsById.get(song.vaultSongId);
    return row ? [[song.vaultSongId, buildSongDetails({ input, song, row })]] : [];
  }));
}

function buildSongDetails({ input, song, row }: { input: SongViewInput; song: VaultSongDetails; row: SongRowView }): SongDetailsView {
  const installedSong = findInstalledSong({ record: input.record, vaultSongId: song.vaultSongId });
  const match = input.audioResultsBySongId.get(song.vaultSongId)?.match;
  const shiftSeconds = installedSong?.music.shiftSeconds ?? (match?.kind === 'matched' ? match.shiftSeconds : null);
  return {
    song: row,
    album: song.album,
    bpmText: song.bpm === null ? '—' : `${String(Math.round(song.bpm))} BPM`,
    lengthText: formatLength(song.lengthSeconds),
    statusNote: row.note ?? null,
    audioMatch: {
      fileName: installedSong?.music.fileName ?? null,
      edit: installedSong || match?.kind === 'matched' ? 'same' : match?.kind === 'different-edit' ? 'different' : 'unknown',
      timingText: shiftSeconds === null ? 'Not lined up yet.' : describeShift(shiftSeconds),
      confidence: installedSong || match?.kind === 'matched' ? 9 : 0,
    },
    gameFolderPath: installedSong ? ['Songs', ...installedSong.folderPath].join('/') : null,
    chartVersionText: installedSong ? `Version ${installedSong.chartVersion}` : `Version ${song.chartVersion}`,
    updateNote: row.status === 'update-available' ? 'The library has newer steps for this song.' : null,
  };
}

function getAudioSource({ input, vaultSongId }: { input: SongViewInput; vaultSongId: string }): SongAudioSource {
  if (input.pickedSongIds.has(vaultSongId)) return { kind: 'picked-file' };
  const match = input.audioResultsBySongId.get(vaultSongId)?.match;
  const sourceId = match && match.kind !== 'not-found' ? match.sourceId : null;
  const addonName = sourceId ? input.addonNamesBySourceId.get(sourceId) : undefined;
  if (addonName) return { kind: 'addon', addonName };
  if (findInstalledSong({ record: input.record, vaultSongId }) || match?.kind === 'matched') return { kind: 'music-folder' };
  return { kind: 'none' };
}

function getSongNote({ input, vaultSongId }: { input: SongViewInput; vaultSongId: string }): string | null {
  const result = input.audioResultsBySongId.get(vaultSongId);
  if (!result) return null;
  if (result.match.kind === 'not-found' && result.match.isWaitingForAddon) return result.addonMessages[0] ?? 'Waiting for an addon · we’ll try again';
  return result.match.kind === 'matched' ? null : (result.addonMessages[0] ?? null);
}

/** Five levels in the game's order, null where a chart doesn't exist. */
function getDifficultyLevels(levels: readonly (number | null)[]): DifficultyLevels {
  return [levels[0] ?? null, levels[1] ?? null, levels[2] ?? null, levels[3] ?? null, levels[4] ?? null];
}

/** "Moved the steps 0.18 s later to fit your copy." */
export function describeShift(shiftSeconds: number): string {
  if (Math.abs(shiftSeconds) < 0.005) return 'Your copy starts exactly like ours; nothing to move.';
  return `Moved the steps ${Math.abs(shiftSeconds).toFixed(2)} s ${shiftSeconds > 0 ? 'later' : 'earlier'} to fit your copy.`;
}

function formatLength(seconds: number): string {
  const wholeSeconds = Math.round(seconds);
  return `${String(Math.floor(wholeSeconds / 60))}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

/** Newest first: a sync's events and the steps of making songs with generators. */
export function buildActivityEntries({ events, vaultSongs }: { events: readonly ActivityLogEvent[]; vaultSongs: readonly VaultSongDetails[] }): ActivityEntryView[] {
  const titlesById = new Map(vaultSongs.map((song) => [song.vaultSongId, song.title]));
  return [...events].reverse().map((event, index) => {
    const entryId = `${event.at}-${String(index)}`;
    return isGeneratedSongActivityEvent(event) ? buildGeneratedSongEntry({ event, entryId }) : buildSyncEntry({ event, entryId, titlesById });
  });
}

function buildSyncEntry({ event, entryId, titlesById }: { event: ActivityEvent; entryId: string; titlesById: ReadonlyMap<string, string> }): ActivityEntryView {
  const groupName = event.folderPath[0] ?? 'your game';
  return {
    entryId,
    kind: ACTIVITY_KINDS_BY_EVENT_KIND[event.kind],
    ...formatEntryTime(event.at),
    textBefore: ACTIVITY_VERBS_BY_EVENT_KIND[event.kind],
    highlightedText: titlesById.get(event.vaultSongId) ?? event.folderPath.at(-1) ?? 'a song',
    textAfter: getSyncEntryTextAfter({ event, groupName }),
    summaryText: event.message ?? (event.kind === 'removed' ? `Deleted only Songs/${event.folderPath.join('/')}` : `Songs/${event.folderPath.join('/')}`),
    details: [{ label: 'Folder', value: `Songs/${event.folderPath.join('/')}` }, ...(event.failure ? [{ label: 'Problem', value: event.failure }] : [])],
  };
}

function buildGeneratedSongEntry({ event, entryId }: { event: GeneratedSongActivityEvent; entryId: string }): ActivityEntryView {
  const texts = GENERATED_SONG_TEXTS_BY_STEP[event.step];
  const folderText = event.folderPath.length > 0 ? `Songs/${event.folderPath.join('/')}` : null;
  return {
    entryId,
    kind: texts.kind,
    ...formatEntryTime(event.at),
    textBefore: texts.textBefore,
    highlightedText: event.songTitle,
    textAfter: texts.getTextAfter(event),
    summaryText: event.message ?? (event.step === 'written' && event.folderPath[0] ? `In ${event.folderPath[0]}` : folderText) ?? `With ${event.generatorName}`,
    details: [{ label: 'Generator', value: event.generatorName }, ...(folderText ? [{ label: 'Folder', value: folderText }] : []), ...(event.message ? [{ label: 'Problem', value: event.message }] : [])],
  };
}

function getSyncEntryTextAfter({ event, groupName }: { event: ActivityEvent; groupName: string }): string {
  if (event.kind === 'failed' || event.kind === 'updated') return '';
  if (event.kind === 'removed') return event.partyListId === undefined ? ' from your game' : ` from ${groupName}`;
  return ` to ${groupName}`;
}

function formatEntryTime(isoTime: string): { dayText: string; timeText: string } {
  const at = new Date(isoTime);
  return { dayText: getDayText({ at, now: new Date() }), timeText: TIME_FORMAT.format(at) };
}

/** "Today", "Yesterday", "Oct 20", or "Oct 20, 2025" for another year. */
export function getDayText({ at, now }: { at: Date; now: Date }): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayLength = 24 * 60 * 60 * 1000;
  if (at.getTime() >= startOfToday) return 'Today';
  if (at.getTime() >= startOfToday - dayLength) return 'Yesterday';
  return at.getFullYear() === now.getFullYear() ? DAY_FORMAT.format(at) : DAY_WITH_YEAR_FORMAT.format(at);
}

export function buildLayoutViews({ vaultSongs, record, playerGroupNames }: { vaultSongs: readonly VaultSongDetails[]; record: InstalledSongsRecord; playerGroupNames: readonly string[] }): { previewsByLayout: LayoutPreviewsByLayout; movingSongCountsByLayout: Record<FolderLayout, number> } {
  const entries = FOLDER_LAYOUTS.map((layout) => {
    const targetPathsBySongId = getTargetFolderPaths({ songs: vaultSongs, layout, playerGroupNames, record });
    return { layout, preview: buildLayoutPreview({ layout, targetPathsBySongId, vaultSongs }), movingCount: getSongFolderMoves({ record, targetPathsBySongId }).length };
  });
  return {
    previewsByLayout: Object.fromEntries(entries.map((entry) => [entry.layout, entry.preview])) as LayoutPreviewsByLayout,
    movingSongCountsByLayout: Object.fromEntries(entries.map((entry) => [entry.layout, entry.movingCount])) as Record<FolderLayout, number>,
  };
}

/** The one group shows its song count; genres and artists show a few groups and how many more there are. */
function buildLayoutPreview({ layout, targetPathsBySongId, vaultSongs }: { layout: FolderLayout; targetPathsBySongId: ReadonlyMap<string, readonly string[]>; vaultSongs: readonly VaultSongDetails[] }): LayoutPreview {
  if (layout === 'my-groups') return buildMyGroupsPreview({ targetPathsBySongId, vaultSongs });
  const titlesByGroup = getSongTitlesByGroup({ targetPathsBySongId, vaultSongs });
  const groups = [...titlesByGroup].slice(0, PREVIEW_GROUP_COUNT).map(([groupName, titles]) => ({
    groupName,
    ...(layout === 'one-group' ? { tagText: `${String(titles.length)} ${titles.length === 1 ? 'song' : 'songs'}` } : {}),
    songTitles: titles.slice(0, PREVIEW_SONG_COUNT),
    moreSongCount: Math.max(0, titles.length - PREVIEW_SONG_COUNT),
  }));
  return { groups, moreGroupsText: getMoreGroupsText({ layout, moreGroupCount: titlesByGroup.size - groups.length }) };
}

/**
 * The player's biggest groups with their song counts, then Ungrouped, which shows while it has songs. Every one of these
 * folders starts with the same "dancedance.studio - ", so the small tree leaves it off and names the groups as the site does.
 */
function buildMyGroupsPreview({ targetPathsBySongId, vaultSongs }: { targetPathsBySongId: ReadonlyMap<string, readonly string[]>; vaultSongs: readonly VaultSongDetails[] }): LayoutPreview {
  const groupedSongs = vaultSongs.filter((song) => (song.groupFolderName ?? null) !== null);
  const ungroupedSongs = vaultSongs.filter((song) => (song.groupFolderName ?? null) === null);
  const titlesByGroup = getSongTitlesByGroup({ targetPathsBySongId, vaultSongs: groupedSongs });
  const colorHexesByGroup = getColorHexesByGroup({ targetPathsBySongId, vaultSongs: groupedSongs });
  const biggestGroups = [...titlesByGroup].sort(([firstName, firstTitles], [secondName, secondTitles]) => secondTitles.length - firstTitles.length || firstName.localeCompare(secondName)).slice(0, PREVIEW_GROUP_COUNT);
  const ungroupedName = ungroupedSongs[0] ? targetPathsBySongId.get(ungroupedSongs[0].vaultSongId)?.[0] : undefined;
  const groups = [
    ...biggestGroups.map(([groupName, titles]) => buildMyGroupPreviewGroup({ groupName, songCount: titles.length, folderColorHex: colorHexesByGroup.get(groupName) })),
    ...(ungroupedName === undefined ? [] : [{ groupName: getNameWithoutPrefix(ungroupedName), tagText: String(ungroupedSongs.length), songTitles: [], isUngrouped: true }]),
  ];
  return { groups, moreGroupsText: getMoreGroupsText({ layout: 'my-groups', moreGroupCount: titlesByGroup.size - biggestGroups.length }) };
}

function buildMyGroupPreviewGroup({ groupName, songCount, folderColorHex }: { groupName: string; songCount: number; folderColorHex: string | undefined }): LayoutPreviewGroup {
  return { groupName: getNameWithoutPrefix(groupName), tagText: String(songCount), songTitles: [], ...(folderColorHex === undefined ? {} : { folderColorHex }) };
}

/** Every song in a group carries the same colour, so the first one with a colour Sync knows names the folder's. */
function getColorHexesByGroup({ targetPathsBySongId, vaultSongs }: { targetPathsBySongId: ReadonlyMap<string, readonly string[]>; vaultSongs: readonly VaultSongDetails[] }): Map<string, string> {
  const colorHexesByGroup = new Map<string, string>();
  for (const song of vaultSongs) {
    const groupName = targetPathsBySongId.get(song.vaultSongId)?.[0];
    const colorHex = getGroupColorHex(song.groupColorKey);
    if (groupName && colorHex && !colorHexesByGroup.has(groupName)) colorHexesByGroup.set(groupName, colorHex);
  }
  return colorHexesByGroup;
}

function getNameWithoutPrefix(groupName: string): string {
  return groupName.startsWith(CLASH_PREFIX) ? groupName.slice(CLASH_PREFIX.length) : groupName;
}

function getSongTitlesByGroup({ targetPathsBySongId, vaultSongs }: { targetPathsBySongId: ReadonlyMap<string, readonly string[]>; vaultSongs: readonly VaultSongDetails[] }): Map<string, string[]> {
  const titlesByGroup = new Map<string, string[]>();
  for (const song of vaultSongs) {
    const groupName = targetPathsBySongId.get(song.vaultSongId)?.[0];
    if (groupName) titlesByGroup.set(groupName, [...(titlesByGroup.get(groupName) ?? []), song.title]);
  }
  return titlesByGroup;
}

function getMoreGroupsText({ layout, moreGroupCount }: { layout: FolderLayout; moreGroupCount: number }): string | undefined {
  if (moreGroupCount <= 0) return undefined;
  const nouns = MORE_GROUP_NOUNS_BY_LAYOUT[layout];
  return `+ ${String(moreGroupCount)} more ${moreGroupCount === 1 ? nouns.one : nouns.many}`;
}

export function getTrayStatus({ isSyncing, isPaused, songPlans }: { isSyncing: boolean; isPaused: boolean; songPlans: readonly SongPlan[] }): TrayStatus {
  if (isPaused) return 'paused';
  if (isSyncing) return 'syncing';
  return songPlans.every((songPlan) => songPlan.status === 'synced') ? 'synced' : 'needs-attention';
}

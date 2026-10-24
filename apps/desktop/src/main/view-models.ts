import {
  findInstalledSong,
  getSongFolderMoves,
  getTargetFolderPaths,
  type ActivityEvent,
  type AudioSearchResult,
  type FolderLayout,
  type InstalledSongsRecord,
  type SongPlan,
  type VaultSongDetails,
} from '@stepsvault/sync-core';
import type { ActivityEntryView, ActivityKind, DifficultyLevels, LayoutPreview, LayoutPreviewsByLayout, SongAudioSource, SongDetailsView, SongRowView, TrayStatus } from '@stepsvault/sync-ui';

const LAYOUTS: readonly FolderLayout[] = ['one-group', 'by-genre', 'by-artist'];
const PREVIEW_GROUP_COUNT = 3;
const PREVIEW_SONG_COUNT = 3;
const ACTIVITY_KINDS_BY_EVENT_KIND: Readonly<Record<ActivityEvent['kind'], ActivityKind>> = { added: 'added', updated: 'updated', moved: 'moved', removed: 'removed', failed: 'write-failed' };
const ACTIVITY_VERBS_BY_EVENT_KIND: Readonly<Record<ActivityEvent['kind'], string>> = { added: 'Added ', updated: 'Updated ', moved: 'Moved ', removed: 'Removed ', failed: 'Couldn’t write ' };
const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
    updateNote: row.status === 'update-available' ? 'StepsVault has newer steps for this song.' : null,
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
  if (Math.abs(shiftSeconds) < 0.005) return 'Your copy starts exactly like StepsVault’s; nothing to move.';
  return `Moved the steps ${Math.abs(shiftSeconds).toFixed(2)} s ${shiftSeconds > 0 ? 'later' : 'earlier'} to fit your copy.`;
}

function formatLength(seconds: number): string {
  const wholeSeconds = Math.round(seconds);
  return `${String(Math.floor(wholeSeconds / 60))}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

export function buildActivityEntries({ events, vaultSongs }: { events: readonly ActivityEvent[]; vaultSongs: readonly VaultSongDetails[] }): ActivityEntryView[] {
  const titlesById = new Map(vaultSongs.map((song) => [song.vaultSongId, song.title]));
  return [...events].reverse().map((event, index) => {
    const at = new Date(event.at);
    const groupName = event.folderPath[0] ?? 'your game';
    return {
      entryId: `${event.at}-${String(index)}`,
      kind: ACTIVITY_KINDS_BY_EVENT_KIND[event.kind],
      dayText: DAY_FORMAT.format(at),
      timeText: TIME_FORMAT.format(at),
      textBefore: ACTIVITY_VERBS_BY_EVENT_KIND[event.kind],
      highlightedText: titlesById.get(event.vaultSongId) ?? event.folderPath.at(-1) ?? 'a song',
      textAfter: event.kind === 'failed' ? '' : event.kind === 'removed' ? ' from your game' : ` in ${groupName}`,
      summaryText: event.message ?? `Songs/${event.folderPath.join('/')}`,
      details: [{ label: 'Folder', value: `Songs/${event.folderPath.join('/')}` }, ...(event.failure ? [{ label: 'Problem', value: event.failure }] : [])],
    };
  });
}

export function buildLayoutViews({ vaultSongs, record, playerGroupNames }: { vaultSongs: readonly VaultSongDetails[]; record: InstalledSongsRecord; playerGroupNames: readonly string[] }): { previewsByLayout: LayoutPreviewsByLayout; movingSongCountsByLayout: Record<FolderLayout, number> } {
  const entries = LAYOUTS.map((layout) => {
    const targetPathsBySongId = getTargetFolderPaths({ songs: vaultSongs, layout, playerGroupNames, record });
    return { layout, preview: buildLayoutPreview({ targetPathsBySongId, vaultSongs, playerGroupNames }), movingCount: getSongFolderMoves({ record, targetPathsBySongId }).length };
  });
  return {
    previewsByLayout: Object.fromEntries(entries.map((entry) => [entry.layout, entry.preview])) as LayoutPreviewsByLayout,
    movingSongCountsByLayout: Object.fromEntries(entries.map((entry) => [entry.layout, entry.movingCount])) as Record<FolderLayout, number>,
  };
}

function buildLayoutPreview({ targetPathsBySongId, vaultSongs, playerGroupNames }: { targetPathsBySongId: ReadonlyMap<string, readonly string[]>; vaultSongs: readonly VaultSongDetails[]; playerGroupNames: readonly string[] }): LayoutPreview {
  const titlesByGroup = new Map<string, string[]>();
  for (const song of vaultSongs) {
    const groupName = targetPathsBySongId.get(song.vaultSongId)?.[0];
    if (groupName) titlesByGroup.set(groupName, [...(titlesByGroup.get(groupName) ?? []), song.title]);
  }
  const playerNameKeys = new Set(playerGroupNames.map((name) => name.toLowerCase()));
  const groups = [...titlesByGroup].slice(0, PREVIEW_GROUP_COUNT).map(([groupName, titles]) => ({
    groupName,
    tagText: playerNameKeys.has(groupName.replace(/^StepsVault · /, '').toLowerCase()) && groupName.startsWith('StepsVault · ') ? 'name taken' : `${String(titles.length)} ${titles.length === 1 ? 'song' : 'songs'}`,
    songTitles: titles.slice(0, PREVIEW_SONG_COUNT),
    moreSongCount: Math.max(0, titles.length - PREVIEW_SONG_COUNT),
  }));
  const moreGroupCount = titlesByGroup.size - groups.length;
  return { groups, moreGroupsText: moreGroupCount > 0 ? `+ ${String(moreGroupCount)} more groups` : undefined };
}

export function getTrayStatus({ isSyncing, isPaused, songPlans }: { isSyncing: boolean; isPaused: boolean; songPlans: readonly SongPlan[] }): TrayStatus {
  if (isPaused) return 'paused';
  if (isSyncing) return 'syncing';
  return songPlans.every((songPlan) => songPlan.status === 'synced') ? 'synced' : 'needs-attention';
}

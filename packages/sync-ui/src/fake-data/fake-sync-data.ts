import type { FolderLayout } from '@stepsvault/sync-core';
import type { ActivityEntryView, AddonInstallPreview, AddonView, ConnectedGameView, DifficultyLevels, FoundGameView, LayoutPreviewsByLayout, LinkedComputerView, MusicFolderView, PickedFileView, PlayerGroupView, SongDetailsView, SongRowView } from '../sync-ui-types';

// Made-up songs and artists for the preview page and the tests; the cover art is drawn here, so nothing loads from the network.

function buildFakeCoverArt({ firstColour, secondColour }: { firstColour: string; secondColour: string }): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${firstColour}"/><stop offset="1" stop-color="${secondColour}"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="44" cy="20" r="12" fill="#ffffff" fill-opacity="0.25"/><path d="M0 48 Q20 30 40 46 T64 40 V64 H0z" fill="#0b0b12" fill-opacity="0.35"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

interface FakeSong {
  row: SongRowView;
  album: string;
  bpm: number;
  lengthText: string;
  fileName: string | null;
  edit: 'same' | 'different' | 'unknown';
  timingText: string;
  confidence: number;
  gameFolderPath: string | null;
  chartVersionText: string;
  statusNote?: string;
  updateNote?: string;
}

const DAY = 86_400_000;
const ADDED_BASE = Date.UTC(2026, 9, 20);

function buildFakeSong(song: Omit<FakeSong, 'row'> & { row: Omit<SongRowView, 'coverArtUrl' | 'addedAt'> & { colours: [string, string]; addedDaysAgo: number } }): FakeSong {
  const { colours, addedDaysAgo, ...row } = song.row;
  return { ...song, row: { ...row, coverArtUrl: buildFakeCoverArt({ firstColour: colours[0], secondColour: colours[1] }), addedAt: ADDED_BASE - addedDaysAgo * DAY } };
}

function levels(...values: (number | null)[]): DifficultyLevels {
  return [values[0] ?? null, values[1] ?? null, values[2] ?? null, values[3] ?? null, values[4] ?? null];
}

const FAKE_SONGS: readonly FakeSong[] = [
  buildFakeSong({ row: { vaultSongId: 'paper-thrills', title: 'Paper Thrills', artist: 'Sola', genre: 'Pop', levels: levels(2, 4, 7, 9, 11), status: 'synced', audioSource: { kind: 'music-folder' }, colours: ['#ff32f8', '#7405ec'], addedDaysAgo: 0 }, album: 'This Is Acting Out', bpm: 90, lengthText: '3:44', fileName: 'Music\\Sola\\This Is Acting Out\\05 Paper Thrills.mp3', edit: 'same', timingText: 'Moved the steps 0.18 s later to fit your copy.', confidence: 9, gameFolderPath: 'Songs/StepsVault · Pop/Paper Thrills', chartVersionText: 'Chart v3 · Oct 12, 2026', statusNote: 'In your game and lined up with your audio.' }),
  buildFakeSong({ row: { vaultSongId: 'watch-me-glow', title: 'Watch Me Glow', artist: 'Merav Lin', genre: 'Pop', levels: levels(1, 4, 6, 8, null), status: 'update-available', audioSource: { kind: 'music-folder' }, colours: ['#1cd8ff', '#0570ec'], addedDaysAgo: 1 }, album: 'Watch Me Glow (single)', bpm: 128, lengthText: '3:05', fileName: 'Music\\Merav Lin\\Watch Me Glow.flac', edit: 'same', timingText: 'Moved the steps 0.04 s earlier to fit your copy.', confidence: 8, gameFolderPath: 'Songs/StepsVault · Pop/Watch Me Glow', chartVersionText: 'Chart v2 · Sep 30, 2026', statusNote: 'A better chart is ready.', updateNote: 'Chart v3 adds a Challenge chart and cleaner jumps in the chorus.' }),
  buildFakeSong({ row: { vaultSongId: 'sugar-you', title: 'Sugar You', artist: 'Velvet Static', genre: 'Pop Punk', levels: levels(2, 5, 7, 10, 12), status: 'different-edit', audioSource: { kind: 'picked-file' }, colours: ['#ff3c3c', '#ffc600'], addedDaysAgo: 2 }, album: 'Golden Hour', bpm: 172, lengthText: '3:22', fileName: 'Downloads\\sugar_you_radio_edit.mp3', edit: 'different', timingText: 'Your file is 0:24 shorter. It looks like the radio edit; these steps fit the album version (3:22).', confidence: 3, gameFolderPath: null, chartVersionText: 'Chart v1 · Oct 20, 2026', statusNote: 'Pick the album version to sync it.' }),
  buildFakeSong({ row: { vaultSongId: 'paris', title: 'Paris', artist: 'Kairo Lights', genre: 'Electronic', levels: levels(1, 3, 6, 8, 11), status: 'removed-from-vault', audioSource: { kind: 'music-folder' }, colours: ['#34bfff', '#2a1f4a'], addedDaysAgo: 3 }, album: 'Night Circuit', bpm: 128, lengthText: '3:31', fileName: 'Music\\Kairo Lights\\Night Circuit\\Paris.mp3', edit: 'same', timingText: 'Moved the steps 0.11 s later to fit your copy.', confidence: 9, gameFolderPath: 'Songs/Electronic/Paris', chartVersionText: 'Chart v2 · Aug 2, 2026', statusNote: 'You removed it from your vault on Oct 20.' }),
  buildFakeSong({ row: { vaultSongId: 'sakura-drive', title: '桜ドライブ', artist: '星野レイ', genre: 'J-Pop', levels: levels(3, 5, 8, 11, 13), status: 'synced', audioSource: { kind: 'addon', addonName: 'Open Audio Links' }, colours: ['#ffb3d9', '#ff32f8'], addedDaysAgo: 4 }, album: 'Hanabi Signal', bpm: 174, lengthText: '3:41', fileName: 'Open Audio Links · YouTube audio', edit: 'same', timingText: 'Moved the steps 0.31 s earlier to fit this audio.', confidence: 8, gameFolderPath: 'Songs/J-Pop/桜ドライブ', chartVersionText: 'Chart v4 · Oct 18, 2026', statusNote: 'In your game and lined up with your audio.' }),
  buildFakeSong({ row: { vaultSongId: 'neon-overdrive', title: 'Neon Overdrive', artist: 'Kairo Lights', genre: 'Electronic', levels: levels(2, 4, 7, 10, 12), status: 'you-edited-this', audioSource: { kind: 'music-folder' }, colours: ['#a4ff00', '#0b3d2e'], addedDaysAgo: 5 }, album: 'Night Circuit', bpm: 150, lengthText: '2:58', fileName: 'Music\\Kairo Lights\\Night Circuit\\Neon Overdrive.mp3', edit: 'same', timingText: 'Already lined up — no change needed.', confidence: 10, gameFolderPath: 'Songs/Electronic/Neon Overdrive', chartVersionText: 'Chart v2 · your edits from Oct 19', statusNote: 'You changed the Hard chart. We won’t overwrite it.' }),
  buildFakeSong({ row: { vaultSongId: 'midnight-sun', title: 'שמש של חצות', artist: 'תמר אור', genre: 'Israeli Pop', levels: levels(1, 3, 6, 8, 10), status: 'needs-audio', audioSource: { kind: 'none' }, colours: ['#ffc600', '#ff2f39'], addedDaysAgo: 6 }, album: 'גלים', bpm: 124, lengthText: '3:12', fileName: null, edit: 'unknown', timingText: 'We looked in My music folder and Open Audio Links but didn’t find this song.', confidence: 0, gameFolderPath: null, chartVersionText: 'Chart v1 · Oct 2, 2026', statusNote: 'Add audio to play it.' }),
  buildFakeSong({ row: { vaultSongId: 'bassline-cathedral', title: 'Bassline Cathedral', artist: 'DJ Morrow', genre: 'Drum & Bass', levels: levels(3, 5, 8, 11, 13), status: 'synced', audioSource: { kind: 'picked-file' }, colours: ['#7405ec', '#0b0b12'], addedDaysAgo: 7 }, album: 'Cathedral EP', bpm: 172, lengthText: '5:20', fileName: 'Desktop\\bassline_cathedral_final.wav', edit: 'same', timingText: 'Already lined up — no change needed.', confidence: 10, gameFolderPath: 'Songs/Drum & Bass/Bassline Cathedral', chartVersionText: 'Chart v1 · Sep 9, 2026' }),
  buildFakeSong({ row: { vaultSongId: 'pulse-garden', title: 'Pulse Garden', artist: 'Kairo Lights', genre: 'Electronic', levels: levels(2, 4, 6, 9, 12), status: 'needs-audio', audioSource: { kind: 'none' }, colours: ['#2cff00', '#1cd8ff'], addedDaysAgo: 8, note: 'Waiting for Indie Tapes · we’ll try again' }, album: 'Pulse Garden EP', bpm: 132, lengthText: '4:12', fileName: null, edit: 'unknown', timingText: 'We found “Pulse Garden (Live)” but it’s a different version, so we didn’t use it.', confidence: 0, gameFolderPath: null, chartVersionText: 'Chart v1 · Jul 15, 2026', statusNote: 'Add audio to play it.' }),
  buildFakeSong({ row: { vaultSongId: 'afterimage', title: 'Afterimage', artist: 'Kairo Lights', genre: 'Electronic', levels: levels(2, 4, 7, 9, null), status: 'synced', audioSource: { kind: 'music-folder' }, colours: ['#1cd8ff', '#7405ec'], addedDaysAgo: 9 }, album: 'Night Circuit', bpm: 140, lengthText: '3:22', fileName: 'Music\\Kairo Lights\\Night Circuit\\Afterimage.mp3', edit: 'same', timingText: 'Moved the steps 0.07 s later to fit your copy.', confidence: 9, gameFolderPath: 'Songs/Electronic/Afterimage', chartVersionText: 'Chart v1 · Sep 2, 2026' }),
  buildFakeSong({ row: { vaultSongId: 'cumbia-del-satelite', title: 'Cumbia del Satélite', artist: 'Los Faroles', genre: 'Latin', levels: levels(1, 2, 4, 6, 8), status: 'synced', audioSource: { kind: 'addon', addonName: 'Open Audio Links' }, colours: ['#fee600', '#ff2f39'], addedDaysAgo: 10 }, album: 'Faroles', bpm: 96, lengthText: '3:30', fileName: 'Open Audio Links · YouTube audio', edit: 'same', timingText: 'Moved the steps 0.22 s later to fit this audio.', confidence: 7, gameFolderPath: 'Songs/Latin/Cumbia del Satélite', chartVersionText: 'Chart v1 · Aug 30, 2026' }),
  buildFakeSong({ row: { vaultSongId: 'slow-motion-comet', title: 'Slow Motion Comet', artist: 'Lumen Park', genre: 'Synthpop', levels: levels(1, 3, 5, 7, 9), status: 'update-available', audioSource: { kind: 'music-folder' }, colours: ['#c9a0ff', '#13213b'], addedDaysAgo: 11 }, album: 'Satellites', bpm: 118, lengthText: '3:56', fileName: 'Music\\Lumen Park\\Satellites\\Slow Motion Comet.mp3', edit: 'same', timingText: 'Moved the steps 0.12 s later to fit your copy.', confidence: 9, gameFolderPath: 'Songs/Synthpop/Slow Motion Comet', chartVersionText: 'Chart v1 · Sep 14, 2026', updateNote: 'Chart v2 fixes a late hold in the bridge and evens out the Medium chart.' }),
];

export const FAKE_SONG_ROWS: readonly SongRowView[] = FAKE_SONGS.map((song) => song.row);

export function getFakeSongDetails(vaultSongId: string): SongDetailsView | null {
  const song = FAKE_SONGS.find((fakeSong) => fakeSong.row.vaultSongId === vaultSongId);
  if (!song) return null;
  return {
    song: song.row,
    album: song.album,
    bpmText: `${String(song.bpm)} BPM`,
    lengthText: song.lengthText,
    statusNote: song.statusNote ?? null,
    audioMatch: { fileName: song.fileName, edit: song.edit, timingText: song.timingText, confidence: song.confidence },
    gameFolderPath: song.gameFolderPath,
    chartVersionText: song.chartVersionText,
    updateNote: song.updateNote ?? null,
  };
}

export const FAKE_GAME: ConnectedGameView = { gameName: 'StepMania 5 LTEK Edition', songsFolderPath: 'C:\\Games\\StepMania 5 LTEK Edition\\Songs' };

export const FAKE_FOUND_GAMES: readonly FoundGameView[] = [
  { gameId: 'ltek', gameName: 'StepMania 5 LTEK Edition', versionText: '5.1 · LTEK', songsFolderPath: 'C:\\Games\\StepMania 5 LTEK Edition\\Songs', songCountText: '1,312' },
  { gameId: 'stepmania-5', gameName: 'StepMania 5', versionText: '5.0.12', songsFolderPath: 'C:\\Games\\StepMania 5\\Songs', songCountText: '486' },
  { gameId: 'itgmania', gameName: 'ITGmania', versionText: '0.8.0', songsFolderPath: 'D:\\ITGmania\\Songs', songCountText: '2,040' },
  { gameId: 'outfox', gameName: 'Project OutFox', versionText: '0.5', songsFolderPath: 'C:\\Games\\Project OutFox\\Songs', songCountText: '220' },
];

export const FAKE_PLAYER_GROUPS: readonly PlayerGroupView[] = [
  { groupName: 'DDR A20', songCount: 412 },
  { groupName: 'Stamina RPG 6', songCount: 436 },
  { groupName: 'Club Fantastic Season 2', songCount: 180 },
  { groupName: 'In The Groove 2', songCount: 137 },
  { groupName: 'ITG Rebirth', songCount: 65 },
  { groupName: 'Pop', songCount: 58 },
  { groupName: 'My Favourites', songCount: 24 },
];

export const FAKE_MUSIC_FOLDERS: readonly MusicFolderView[] = [
  { folderPath: 'C:\\Users\\Noa\\Music', scanState: 'scanned', summaryText: '1,240 files · 15 vault songs found' },
  { folderPath: 'D:\\Rips\\Albums', scanState: 'scanning', summaryText: 'Scanning…' },
];

export const FAKE_PICKED_FILES: readonly PickedFileView[] = [
  { vaultSongId: 'bassline-cathedral', title: 'Bassline Cathedral', fileName: 'bassline_cathedral_final.wav', status: 'synced' },
  { vaultSongId: 'sugar-you', title: 'Sugar You', fileName: 'sugar_you_radio_edit.mp3', status: 'different-edit' },
];

export const FAKE_ADDONS: readonly AddonView[] = [
  { addonId: 'open-audio-links', name: 'Open Audio Links', version: '1.4.2', author: '@mixtape_lab', providesText: 'audio and video links', isEnabled: true, health: { kind: 'working', note: 'Working · gave audio for 2 songs' }, options: [{ optionId: 'media', label: 'What to get', choices: [{ value: 'audio', label: 'Music only' }, { value: 'audio-and-video', label: 'Music and video' }], value: 'audio-and-video' }] },
  { addonId: 'indie-tapes', name: 'Indie Tapes', version: '0.6.1', author: 'cassette-club', providesText: 'audio links', isEnabled: true, health: { kind: 'not-answering', note: 'Not answering since 14:02. Songs keep the audio they have; new ones wait.' }, options: [] },
  { addonId: 'home-server-music', name: 'Home Server Music', version: '0.3.0', author: '@noa', providesText: 'audio links', isEnabled: false, health: { kind: 'working', note: 'Turned off' }, options: [] },
];

export const FAKE_ADDON_PREVIEW: AddonInstallPreview = { address: 'https://bridge.hyperpad.example/stepsvault', name: 'Bandcamp Bridge', version: '0.9.0', author: 'hyperpad',
  options: [{ optionId: 'media', label: 'What to get', choices: [{ value: 'audio', label: 'Music only' }, { value: 'audio-and-video', label: 'Music and video' }], value: 'audio-and-video' }],
};

export const FAKE_LAYOUT_PREVIEWS: LayoutPreviewsByLayout = {
  'one-group': { groups: [{ groupName: 'StepsVault', tagText: '12 songs', songTitles: ['Paper Thrills', 'Watch Me Glow', '桜ドライブ'], moreSongCount: 9 }] },
  'by-genre': { groups: [{ groupName: 'StepsVault · Pop', tagText: 'name taken', songTitles: ['Paper Thrills', 'Watch Me Glow'] }, { groupName: 'Electronic', songTitles: ['Afterimage'] }, { groupName: 'J-Pop', songTitles: [] }], moreGroupsText: '+ 5 more genres' },
  'by-artist': { groups: [{ groupName: 'Merav Lin', songTitles: ['Watch Me Glow'] }, { groupName: 'Sola', songTitles: ['Paper Thrills'] }, { groupName: 'Kairo Lights', songTitles: ['Afterimage'] }], moreGroupsText: '+ 7 more artists' },
};

export const FAKE_MOVING_SONG_COUNTS: Readonly<Record<FolderLayout, number>> = { 'one-group': 12, 'by-genre': 0, 'by-artist': 11 };

export const FAKE_ACTIVITY_ENTRIES: readonly ActivityEntryView[] = [
  { entryId: 'finished', kind: 'sync-finished', dayText: 'Today', timeText: '18:42', textBefore: 'Sync finished — ', highlightedText: '8 synced, 4 need you', textAfter: '', summaryText: 'PERFECT! · 12 songs checked in 1 min 12 s', details: [{ label: 'Synced', value: '8 songs' }, { label: 'Need audio', value: 'שמש של חצות, Pulse Garden' }, { label: 'Different edit', value: 'Sugar You' }, { label: 'Started by', value: 'You pressed Sync now' }] },
  { entryId: 'added-paper-thrills', kind: 'added', dayText: 'Today', timeText: '18:41', textBefore: 'Added ', highlightedText: 'Paper Thrills', textAfter: ' to StepsVault · Pop', summaryText: 'Audio from My music folder · same edit', details: [{ label: 'Audio file', value: 'Music\\Sola\\This Is Acting Out\\05 Paper Thrills.mp3' }, { label: 'Lined up', value: 'Moved the steps 0.18 s later to fit your copy' }, { label: 'Folder', value: 'Songs/StepsVault · Pop/Paper Thrills' }, { label: 'Chart', value: 'v3' }] },
  { entryId: 'updated-watch-me-glow', kind: 'updated', dayText: 'Today', timeText: '18:41', textBefore: 'Updated ', highlightedText: 'Watch Me Glow', textAfter: ' (better chart)', summaryText: 'Chart v2 → v3: adds a Challenge chart, cleaner jumps', details: [{ label: 'What changed', value: 'New Challenge chart · cleaner jumps in the chorus' }, { label: 'Your scores', value: 'Kept — same folder' }, { label: 'Folder', value: 'Songs/StepsVault · Pop/Watch Me Glow' }] },
  { entryId: 'skipped-sugar-you', kind: 'different-edit', dayText: 'Today', timeText: '18:40', textBefore: 'Skipped ', highlightedText: 'Sugar You', textAfter: ' — different edit', summaryText: 'Your file is 0:24 shorter than the steps', details: [{ label: 'Your file', value: 'Downloads\\sugar_you_radio_edit.mp3 (2:58)' }, { label: 'Steps made for', value: 'Album version (3:22)' }, { label: 'What to do', value: 'Use a different file… on the song' }] },
  { entryId: 'skipped-midnight-sun', kind: 'no-audio', dayText: 'Today', timeText: '18:40', textBefore: 'Skipped ', highlightedText: 'שמש של חצות', textAfter: ' — no audio found', summaryText: 'Looked in My music folder and Open Audio Links', details: [{ label: 'Looked in', value: 'C:\\Users\\Noa\\Music, D:\\Rips\\Albums, Open Audio Links' }, { label: 'What to do', value: 'Choose audio… on the song, or add another music folder' }] },
  { entryId: 'removed-paris', kind: 'removed', dayText: 'Yesterday', timeText: '21:10', textBefore: 'Removed ', highlightedText: 'Paris', textAfter: ' (you removed it from your vault)', summaryText: 'Deleted only Songs/Electronic/Paris', details: [{ label: 'Deleted', value: 'Songs/Electronic/Paris' }, { label: 'Not touched', value: 'Your audio file and all your other songs' }] },
  { entryId: 'kept-neon-overdrive', kind: 'kept-edits', dayText: 'Yesterday', timeText: '21:09', textBefore: 'Kept your changes to ', highlightedText: 'Neon Overdrive', textAfter: '', summaryText: 'You edited the Hard chart — we didn’t overwrite it', details: [{ label: 'Your edit', value: 'Hard chart, changed Oct 19' }, { label: 'Newer chart', value: 'Not installed — choose Replace on the song if you want it' }] },
  { entryId: 'addon-indie-tapes', kind: 'addon-not-answering', dayText: 'Yesterday', timeText: '20:58', textBefore: 'Addon ', highlightedText: 'Indie Tapes', textAfter: ' didn’t answer', summaryText: '1 song waited for audio · nothing broke', details: [{ label: 'Addon', value: 'Indie Tapes v0.6.1 by cassette-club' }, { label: 'Songs waiting', value: 'Pulse Garden' }, { label: 'Next try', value: 'On your next sync' }] },
  { entryId: 'moved-by-genre', kind: 'moved', dayText: 'Oct 20', timeText: '19:02', textBefore: 'Moved 12 songs into ', highlightedText: 'By genre', textAfter: ' layout', summaryText: 'Scores for these songs start fresh · your songs not touched', details: [{ label: 'Before', value: 'One group (StepsVault)' }, { label: 'After', value: 'By genre' }, { label: 'Your groups', value: 'Not touched (7 groups, 1,312 songs)' }] },
  { entryId: 'connected', kind: 'connected', dayText: 'Oct 20', timeText: '19:00', textBefore: 'Connected ', highlightedText: 'StepMania 5 LTEK Edition', textAfter: '', summaryText: 'C:\\Games\\StepMania 5 LTEK Edition\\Songs', details: [{ label: 'Songs folder', value: 'C:\\Games\\StepMania 5 LTEK Edition\\Songs' }, { label: 'Found', value: '7 groups of yours · 1,312 songs, all locked' }] },
];

export const FAKE_LINKED_COMPUTERS: readonly LinkedComputerView[] = [
  { computerId: 'living-room', computerName: 'LIVING-ROOM-PC', systemText: 'Windows 11 · linked Oct 3, 2026', isOnline: true, lastSyncText: '2 minutes ago', gameName: 'StepMania 5 LTEK Edition' },
  { computerId: 'arcade-cab', computerName: 'ARCADE-CAB', systemText: 'Windows 10 · linked Aug 21, 2026', isOnline: false, lastSyncText: '3 days ago', gameName: 'ITGmania' },
];

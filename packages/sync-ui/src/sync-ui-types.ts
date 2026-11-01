import type { FolderLayout, GeneratorDifficulty, SongSourceInput, SongSyncStatus, VaultSongChoice } from '@stepsvault/sync-core';

/** The website shows browser permission prompts; the desktop app has a tray and background sync. */
export type SyncPlatform = 'website' | 'desktop';

export type SyncScreen = 'songs' | 'audio-sources' | 'generators' | 'folder-layout' | 'activity' | 'account';

/** Levels in the game's order (Beginner, Easy, Medium, Hard, Challenge); null when that chart doesn't exist. */
export type DifficultyLevels = readonly [number | null, number | null, number | null, number | null, number | null];

export type SongAudioSource =
  | { kind: 'music-folder' }
  | { kind: 'picked-file' }
  | { kind: 'addon'; addonName: string }
  | { kind: 'none' };

export type SongSyncStep = 'finding-audio' | 'checking-edit' | 'lining-up' | 'writing-to-game';

/** Where a song is in the sync that is running now. */
export type SongSyncProgress = { kind: 'working'; step: SongSyncStep } | { kind: 'waiting-in-line' };

export type SongAction = 'sync' | 'choose-audio' | 'use-different-file' | 'update' | 'keep-mine' | 'replace-with-stepsvault' | 'remove-from-game' | 'keep-in-game';

export interface SongRowView {
  vaultSongId: string;
  title: string;
  artist: string;
  genre: string | null;
  coverArtUrl: string | null;
  levels: DifficultyLevels;
  status: SongSyncStatus;
  audioSource: SongAudioSource;
  /** When the song was added to the vault (milliseconds since 1970), for the "Recently added" sort. */
  addedAt: number;
  progress?: SongSyncProgress | null;
  /** A short line under the status, for example "Keeping your version". */
  note?: string | null;
  /** Leave it out to offer the status's usual choices; an empty list once the player has chosen. */
  statusActions?: readonly SongAction[];
}

export type AudioEditMatch = 'same' | 'different' | 'unknown';

export interface AudioMatchView {
  fileName: string | null;
  edit: AudioEditMatch;
  /** For example "Moved the steps 0.18 s later to fit your copy." */
  timingText: string;
  /** From 0 (nothing to check yet) to 10 (very sure). */
  confidence: number;
}

export interface SongDetailsView {
  song: SongRowView;
  album: string | null;
  bpmText: string;
  lengthText: string;
  statusNote: string | null;
  audioMatch: AudioMatchView;
  /** For example "Songs/Pop/Cheap Thrills"; null while the song is not in the game. */
  gameFolderPath: string | null;
  chartVersionText: string;
  /** What the newer chart does better, when the status is "Update available". */
  updateNote: string | null;
}

export interface ConnectedGameView {
  gameName: string;
  songsFolderPath: string;
}

export interface FoundGameView {
  gameId: string;
  gameName: string;
  versionText: string | null;
  songsFolderPath: string;
  songCountText: string;
}

export interface PlayerGroupView {
  groupName: string;
  songCount: number;
}

export type MusicFolderScanState = 'scanned' | 'scanning' | 'waiting';

export interface MusicFolderView {
  folderPath: string;
  scanState: MusicFolderScanState;
  /** For example "1,240 files · 15 vault songs found". */
  summaryText: string;
}

export interface PickedFileView {
  vaultSongId: string;
  title: string;
  fileName: string;
  status: SongSyncStatus;
}

export type AddonHealth = { kind: 'working'; note: string } | { kind: 'not-answering'; note: string };

/** One addon setting the player picks from a short list, for example "What to get: Music only / Music and video". */
export interface AddonOptionView {
  optionId: string;
  label: string;
  choices: readonly { value: string; label: string }[];
  /** The player's current pick (the addon's default until they change it). */
  value: string;
}

export interface AddonView {
  addonId: string;
  name: string;
  version: string;
  author: string;
  providesText: string;
  isEnabled: boolean;
  health: AddonHealth;
  options: readonly AddonOptionView[];
  /** False for an addon that only brings new songs: it is never asked for a vault song's music. Missing means true. */
  isAudioSource?: boolean;
  isNew?: boolean;
}

/** What the addon's own description says about itself, shown before the player agrees to install it. */
export interface AddonInstallPreview {
  address: string;
  name: string;
  version: string;
  author: string;
  /** For example "Audio and video links"; what Sync will ask it for. */
  providesText?: string;
  /** Picked on the consent step, before installing; each starts at the addon's default. */
  options: readonly AddonOptionView[];
  /** True for a song source: it also sees what the player types in its tab on the Make a song page. */
  seesWhatYouType?: boolean;
  /** Desktop only: the command Sync runs to start an addon on this computer, as the player typed it. */
  startCommand?: string | null;
}

/** Step 1 of adding an addon or a generator. The start command is only for one on this computer, in the desktop app. */
export interface ServiceLookupRequest {
  address: string;
  startCommand: string | null;
}

export type AddonLookupResult = { kind: 'found'; addon: AddonInstallPreview } | { kind: 'failed'; message: string };

export interface LayoutPreviewGroup {
  groupName: string;
  /** Shown next to the group, for example "23 songs". */
  tagText?: string;
  songTitles: readonly string[];
  moreSongCount?: number;
  /** The "My groups" folder for songs in no group, drawn apart from the player's groups. */
  isUngrouped?: boolean;
  /** A "My groups" folder's colour as a hex, the group's colour on the site; the folder is cyan without one. */
  folderColorHex?: string;
  /** A party list's folder: pink, with its end time as the tag ("ends in 2d"). */
  isPartyFolder?: boolean;
  /** Shown after each song, for example "copy" in a party folder. */
  songTagText?: string;
}

export interface LayoutPreview {
  groups: readonly LayoutPreviewGroup[];
  /** For example "+ 5 more genres". */
  moreGroupsText?: string;
}

export type LayoutPreviewsByLayout = Readonly<Record<FolderLayout, LayoutPreview>>;

/** `write-failed`: a song couldn't be written (full disk, StepMania open…); its details say what to do. */
export type ActivityKind =
  | 'sync-finished' | 'added' | 'updated' | 'lined-up' | 'no-audio' | 'different-edit' | 'removed' | 'kept-edits' | 'addon-not-answering' | 'moved' | 'connected' | 'write-failed'
  /** Making a song with a generator: started or still going, in the game (or the vault), stopped by a problem, cancelled. */
  | 'generating' | 'generated' | 'generate-failed' | 'generate-cancelled';

export interface ActivityEntryView {
  entryId: string;
  kind: ActivityKind;
  dayText: string;
  timeText: string;
  /** The sentence is textBefore + highlightedText (bold) + textAfter, for example "Added " + "Cheap Thrills" + " to Pop". */
  textBefore: string;
  highlightedText: string;
  textAfter: string;
  summaryText: string;
  details: readonly { label: string; value: string }[];
}

/** A party list's folder in the game, as the Songs screen lists it. */
export interface PartyFolderView {
  partyListId: string;
  listName: string;
  /** For example "Songs/Party - Maya's birthday". */
  folderText: string;
  /** For example "5 songs in your game"; copies, so the same songs can be in their layout folders too. */
  songCountText: string;
  /** For example "2 need audio"; null when every ready song is in. */
  needsYouText: string | null;
  /** For example "Ends in 2d"; null when the list has no end, or has ended. */
  endsText: string | null;
  /** The list ended, was deleted or isn't synced any more: the folder goes on this sync or the next. */
  isLeaving: boolean;
}

export type TrayStatus = 'synced' | 'syncing' | 'needs-attention' | 'paused';

export interface LinkedComputerView {
  computerId: string;
  computerName: string;
  /** For example "Windows 11 · linked Oct 3, 2026". */
  systemText: string;
  isOnline: boolean;
  lastSyncText: string;
  gameName: string;
}

export type SignInState =
  | { kind: 'waiting-for-code'; code: string; expiresInText: string; computerName: string; systemName: string }
  | { kind: 'signed-in'; playerName: string; computerName: string };

export type LinkCodeState = 'typing' | 'miss' | 'great' | 'linked';

/** Where an addon or generator runs: on this computer the music stays here, on the internet it is sent there. */
export type ServiceLocationView = { kind: 'this-computer' } | { kind: 'internet'; address: string };

/** StepsVault's own generator: always listed first, and used when the player doesn't pick another one. */
export interface StepsVaultGeneratorView {
  /** The player's tokens; null when Sync doesn't know them. */
  tokenCount: number | null;
  /** Where the player buys tokens, opened in their browser. */
  tokensHref: string;
  /** What it can make; null while StepsVault can't be reached. */
  difficulties: readonly GeneratorDifficulty[] | null;
  /** The sentence to agree to before the first song, since StepsVault receives the music too; null once agreed. */
  musicUploadWarning: string | null;
}

/** A community generator the player added. */
export interface GeneratorView {
  generatorId: string;
  name: string;
  version: string;
  author: string;
  description: string;
  location: ServiceLocationView;
  /** Desktop only: the command Sync runs to start it, when the player gave one. */
  startCommand: string | null;
  /** What it can make, in game order. */
  difficulties: readonly GeneratorDifficulty[];
  options: readonly AddonOptionView[];
  /** The sentence to agree to before the next song, when the player hasn't agreed yet; null otherwise. */
  musicUploadWarning: string | null;
  isNew?: boolean;
}

/** What the generator's own description says about itself, shown before the player adds it. */
export interface GeneratorInstallPreview {
  address: string;
  name: string;
  version: string;
  author: string;
  description: string;
  location: ServiceLocationView;
  difficulties: readonly GeneratorDifficulty[];
  options: readonly AddonOptionView[];
  startCommand: string | null;
}

export type GeneratorLookupResult = { kind: 'found'; generator: GeneratorInstallPreview } | { kind: 'failed'; message: string };

/** Music the player picked for a new song: a file, a file from their music folders, or a song a song source found. */
export interface MusicChoiceView {
  /** The platform's id for this music; the screens never see a file path. */
  musicId: string;
  title: string;
  artist: string;
  /** Where it comes from, for example the file's folder, or "From YouTube Songs". */
  sourceText: string;
  /** For example "3:21"; null when not known. */
  lengthText: string | null;
  /** True when a video comes with it (from a song source): it plays behind the steps. */
  hasVideo: boolean;
}

/** One song-source addon's tab on the Make a song page, drawn by Sync from the addon's declared inputs. */
export interface SongSourceTabView {
  addonId: string;
  name: string;
  inputs: readonly SongSourceInput[];
}

export interface SongSourceSearchRequest {
  addonId: string;
  valuesByInputId: Readonly<Record<string, string>>;
}

export type SongSourceSearchResult =
  /** One song, or a few for the player to pick from, best first. */
  | { kind: 'found'; musics: readonly MusicChoiceView[] }
  /** The addon's own sentence: nothing found for what the player typed. */
  | { kind: 'not-found'; message: string }
  | { kind: 'not-answering'; message: string }
  /** What the player typed in one field breaks its rules; shown under that field. */
  | { kind: 'invalid-input'; inputId: string; message: string }
  | { kind: 'stopped' };

export interface MakeSongRequest {
  musicId: string;
  generatorId: string;
  difficulties: readonly GeneratorDifficulty[];
  /** True when the player saw "Your music file will be sent to …" and went on. */
  hasAgreedToMusicUpload: boolean;
  /** Set when the song was preselected (see PreselectedSongView), so the platform keeps where the request came from. */
  preselectionKey?: string;
}

/**
 * A song Make a song opens with, for example from a link on the website. Only its name is known: the player still picks
 * the music, so Make a song starts by searching their music folders for it.
 */
export interface PreselectedSongView {
  /** New for every link, so the same song asked for twice opens Make a song twice. */
  preselectionKey: string;
  title: string;
  artist: string | null;
}

export type MakeSongResult = { kind: 'started'; jobKey: string } | { kind: 'failed'; message: string };

/** working: sending the music or being made; the rest are where the job ended, or a question for the player. */
export type GeneratorJobStateView = 'working' | 'needs-vault-choice' | 'done' | 'failed' | 'cancelled';

/** A song being made, or recently made, with a generator. */
export interface GeneratorJobView {
  jobKey: string;
  songTitle: string;
  songArtist: string;
  generatorName: string;
  isStepsVault: boolean;
  state: GeneratorJobStateView;
  /** For example "Placing the steps"; the generator's own words when it gives them. */
  stageText: string;
  progressPercent: number | null;
  /** Why it failed, or why the generator couldn't stop it. */
  message: string | null;
  /** "Keep the vault song, or the generated one?", while the player hasn't answered. */
  vaultChoiceQuestion: string | null;
  /** Where the finished song went. */
  doneText: string | null;
}

export interface VaultChoiceAnswer {
  jobKey: string;
  choice: VaultSongChoice;
}

/** A song in "My generated songs" in the game. */
/** Desktop only: the website plays the player's generated songs from Sync on this computer, after a one-time pairing. */
export interface BrowserPairingView {
  /** Where the website reads the songs, like `http://127.0.0.1:47821`; null when Sync couldn't open it. */
  bridgeAddress: string | null;
  /** `ABCD-EFGH` while Sync waits for the player to type it on the website; null otherwise. */
  code: string | null;
  pairedBrowserCount: number;
}

export interface GeneratedSongView {
  songKey: string;
  title: string;
  artist: string;
  generatorName: string;
  /** For example "Easy, Medium and Hard". */
  difficultiesText: string;
  /** Each made chart's level, in game order; null when the song was written before Sync kept levels. */
  levels: DifficultyLevels | null;
  /** For example "Songs/My generated songs/Night Drive". */
  folderText: string;
  madeAtText: string;
  /** True when the generator said how it made the song ("How it was made"). */
  hasReport: boolean;
}

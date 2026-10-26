import { isOnThisComputer, loadSavedAddon, loadSavedGenerator, type ActivityLogEvent, type FolderLayout, type InstalledAddon, type InstalledGenerator } from '@stepsvault/sync-core';

export const DEFAULT_SITE_URL = 'https://dancedance.studio';
const MAX_ACTIVITY_EVENTS = 300;
const LAYOUTS: readonly FolderLayout[] = ['one-group', 'by-genre', 'by-artist'];

/** Everything the app remembers between runs, except the device token (kept encrypted on its own). */
export interface DesktopSettings {
  version: 1;
  game: { gameName: string; songsFolderPath: string } | null;
  musicFolders: string[];
  layout: FolderLayout;
  shouldUpdateAutomatically: boolean;
  isBackgroundSyncOn: boolean;
  /** Files the player chose with "Choose audio…", by vault song id. */
  pickedFilePathsBySongId: Record<string, string>;
  addons: InstalledAddon[];
  /** Community generators, each with the time the player agreed to send it their music (when it isn't on this computer). */
  generators: InstalledGenerator[];
  /** When the player agreed that their music goes to StepsVault's own generator; null until then. */
  stepsVaultMusicUploadConsentedAt: string | null;
  /** The start command the player typed and confirmed for an addon or generator on this computer, by its address. */
  startCommandsByBaseUrl: Record<string, string>;
  replaceEditedSongIds: string[];
  removeFromGameSongIds: string[];
  updateSongIds: string[];
  /** Newest last, at most MAX_ACTIVITY_EVENTS. */
  activity: ActivityLogEvent[];
  lastSyncAt: string | null;
}

export function buildDefaultSettings(): DesktopSettings {
  return {
    version: 1,
    game: null,
    musicFolders: [],
    layout: 'one-group',
    shouldUpdateAutomatically: true,
    isBackgroundSyncOn: true,
    pickedFilePathsBySongId: {},
    addons: [],
    generators: [],
    stepsVaultMusicUploadConsentedAt: null,
    startCommandsByBaseUrl: {},
    replaceEditedSongIds: [],
    removeFromGameSongIds: [],
    updateSongIds: [],
    activity: [],
    lastSyncAt: null,
  };
}

/** Keeps what is valid from a saved file and fills the rest with defaults, so an older or edited file still loads. */
export function parseSettings(value: unknown): DesktopSettings {
  const defaults = buildDefaultSettings();
  if (typeof value !== 'object' || value === null) return defaults;
  const saved = value as Record<string, unknown>;
  return {
    ...defaults,
    game: isSavedGame(saved.game) ? saved.game : null,
    musicFolders: getStrings(saved.musicFolders),
    layout: typeof saved.layout === 'string' && (LAYOUTS as readonly string[]).includes(saved.layout) ? (saved.layout as FolderLayout) : defaults.layout,
    shouldUpdateAutomatically: saved.shouldUpdateAutomatically !== false,
    isBackgroundSyncOn: saved.isBackgroundSyncOn !== false,
    pickedFilePathsBySongId: getStringsByKey(saved.pickedFilePathsBySongId),
    addons: Array.isArray(saved.addons) ? saved.addons.flatMap((addon) => loadSavedAddon(addon) ?? []) : [],
    generators: Array.isArray(saved.generators) ? saved.generators.flatMap((generator) => loadSavedGenerator(generator) ?? []) : [],
    stepsVaultMusicUploadConsentedAt: typeof saved.stepsVaultMusicUploadConsentedAt === 'string' ? saved.stepsVaultMusicUploadConsentedAt : null,
    // A start command runs a program, so only one for an address on this computer is ever kept.
    startCommandsByBaseUrl: Object.fromEntries(Object.entries(getStringsByKey(saved.startCommandsByBaseUrl)).filter(([baseUrl]) => isOnThisComputer(baseUrl))),
    replaceEditedSongIds: getStrings(saved.replaceEditedSongIds),
    removeFromGameSongIds: getStrings(saved.removeFromGameSongIds),
    updateSongIds: getStrings(saved.updateSongIds),
    activity: Array.isArray(saved.activity) ? (saved.activity as ActivityLogEvent[]).slice(-MAX_ACTIVITY_EVENTS) : [],
    lastSyncAt: typeof saved.lastSyncAt === 'string' ? saved.lastSyncAt : null,
  };
}

export function withActivity({ settings, events }: { settings: DesktopSettings; events: readonly ActivityLogEvent[] }): DesktopSettings {
  return { ...settings, activity: [...settings.activity, ...events].slice(-MAX_ACTIVITY_EVENTS) };
}

function isSavedGame(value: unknown): value is DesktopSettings['game'] {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).songsFolderPath === 'string' && typeof (value as Record<string, unknown>).gameName === 'string';
}

function getStringsByKey(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function getStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

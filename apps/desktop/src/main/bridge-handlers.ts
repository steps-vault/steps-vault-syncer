import type { FolderLayout } from '@stepsvault/sync-core';
import type { AddonInstallPreview, AddonOptionView, SongAction } from '@stepsvault/sync-ui';
import type { DesktopSyncBridge } from '../shared/bridge-types';
import type { SyncController } from './sync-controller';

type BridgeHandlers = Record<Exclude<keyof DesktopSyncBridge, 'onState'>, (argument: unknown) => Promise<unknown>>;

const LAYOUTS: readonly string[] = ['one-group', 'by-genre', 'by-artist'];
const SONG_ACTIONS: readonly string[] = ['sync', 'choose-audio', 'use-different-file', 'update', 'keep-mine', 'replace-with-stepsvault', 'remove-from-game', 'keep-in-game'];
const MAX_TEXT_LENGTH = 2_000;
const MAX_ADDON_OPTIONS = 8;
const MAX_ADDON_OPTION_CHOICES = 6;

export class InvalidBridgeArgumentError extends Error {}

/**
 * One handler per bridge method. The window is treated like any other caller: every argument is checked before it
 * reaches the controller, so even a compromised window can't pass anything unexpected.
 */
export function buildBridgeHandlers(controller: SyncController): BridgeHandlers {
  return {
    getState: () => controller.getState(),
    startSignIn: () => controller.startSignIn(),
    openLinkPage: () => controller.openLinkPage(),
    useFoundGame: (argument) => controller.useFoundGame(getText(argument)),
    chooseSongsFolder: () => controller.chooseSongsFolder(),
    addMusicFolder: () => controller.addMusicFolder(),
    removeMusicFolder: (argument) => controller.removeMusicFolder(getText(argument)),
    scanMusicAgain: () => controller.scanMusicAgain(),
    syncNow: () => controller.syncNow(),
    dismissFinishedSync: () => controller.dismissFinishedSync(),
    setBackgroundSync: (argument) => controller.setBackgroundSync(getBoolean(argument)),
    runSongAction: (argument) => controller.runSongAction(getSongActionRequest(argument)),
    lookUpAddon: (argument) => controller.lookUpAddon(getText(argument)),
    installAddon: (argument) => controller.installAddon(getAddonPreview(argument)),
    setAddonEnabled: (argument) => controller.setAddonEnabled(getAddonToggle(argument)),
    setAddonOption: (argument) => controller.setAddonOption(getAddonOptionChange(argument)),
    removeAddon: (argument) => controller.removeAddon(getText(argument)),
    setLayout: (argument) => controller.setLayout(getLayout(argument)),
    copyActivityDetails: () => controller.copyActivityDetails(),
    restartToUpdate: () => controller.restartToUpdate(),
    dismissUpdate: () => controller.dismissUpdate(),
  };
}

function getText(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) throw new InvalidBridgeArgumentError('Expected a short text.');
  return value;
}

function getBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new InvalidBridgeArgumentError('Expected true or false.');
  return value;
}

function getRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new InvalidBridgeArgumentError('Expected an object.');
  return value as Record<string, unknown>;
}

function getLayout(value: unknown): FolderLayout {
  if (typeof value !== 'string' || !LAYOUTS.includes(value)) throw new InvalidBridgeArgumentError('Expected a folder layout.');
  return value as FolderLayout;
}

function getSongActionRequest(value: unknown): { vaultSongId: string; action: SongAction } {
  const request = getRecord(value);
  if (typeof request.action !== 'string' || !SONG_ACTIONS.includes(request.action)) throw new InvalidBridgeArgumentError('Expected a song action.');
  return { vaultSongId: getText(request.vaultSongId), action: request.action as SongAction };
}

function getAddonPreview(value: unknown): AddonInstallPreview {
  const preview = getRecord(value);
  return { address: getText(preview.address), name: getText(preview.name), version: getText(preview.version), author: getText(preview.author), options: getList({ value: preview.options, maxLength: MAX_ADDON_OPTIONS }).map(getAddonOptionView) };
}

/** The controller still checks every picked value against the addon's own manifest; this only checks the shape. */
function getAddonOptionView(value: unknown): AddonOptionView {
  const option = getRecord(value);
  const choices = getList({ value: option.choices, maxLength: MAX_ADDON_OPTION_CHOICES }).map((choice) => ({ value: getText(getRecord(choice).value), label: getText(getRecord(choice).label) }));
  return { optionId: getText(option.optionId), label: getText(option.label), choices, value: getText(option.value) };
}

function getAddonOptionChange(value: unknown): { addonId: string; optionId: string; value: string } {
  const change = getRecord(value);
  return { addonId: getText(change.addonId), optionId: getText(change.optionId), value: getText(change.value) };
}

function getList({ value, maxLength }: { value: unknown; maxLength: number }): unknown[] {
  if (!Array.isArray(value) || value.length > maxLength) throw new InvalidBridgeArgumentError(`Expected a list of at most ${String(maxLength)} items.`);
  return value;
}

function getAddonToggle(value: unknown): { addonId: string; isEnabled: boolean } {
  const toggle = getRecord(value);
  return { addonId: getText(toggle.addonId), isEnabled: getBoolean(toggle.isEnabled) };
}

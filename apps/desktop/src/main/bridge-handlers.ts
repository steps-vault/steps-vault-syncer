import { FOLDER_LAYOUTS, GENERATOR_DIFFICULTIES, type FolderLayout, type GeneratorDifficulty, type VaultSongChoice } from '@stepsvault/sync-core';
import type { AddonInstallPreview, AddonOptionView, GeneratorInstallPreview, MakeSongRequest, ServiceLocationView, ServiceLookupRequest, SongAction, SongSourceSearchRequest, VaultChoiceAnswer } from '@stepsvault/sync-ui';
import type { DesktopSyncBridge } from '../shared/bridge-types';
import type { SyncController } from './sync-controller';

type BridgeHandlers = Record<Exclude<keyof DesktopSyncBridge, 'onState'>, (argument: unknown) => Promise<unknown>>;

const LAYOUTS: readonly string[] = FOLDER_LAYOUTS;
const SONG_ACTIONS: readonly string[] = ['sync', 'choose-audio', 'use-different-file', 'update', 'keep-mine', 'replace-with-stepsvault', 'remove-from-game', 'keep-in-game'];
const MAX_TEXT_LENGTH = 2_000;
const MAX_ADDON_OPTIONS = 8;
const MAX_ADDON_OPTION_CHOICES = 6;
const MAX_SONG_SOURCE_INPUTS = 3;
const VAULT_SONG_CHOICES: readonly string[] = ['keep-vault-song', 'keep-generated-song'];

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
    lookUpAddon: (argument) => controller.lookUpAddon(getLookupRequest(argument)),
    installAddon: (argument) => controller.installAddon(getAddonPreview(argument)),
    setAddonEnabled: (argument) => controller.setAddonEnabled(getAddonToggle(argument)),
    setAddonOption: (argument) => controller.setAddonOption(getAddonOptionChange(argument)),
    removeAddon: (argument) => controller.removeAddon(getText(argument)),
    lookUpGenerator: (argument) => controller.lookUpGenerator(getLookupRequest(argument)),
    installGenerator: (argument) => controller.installGenerator(getGeneratorPreview(argument)),
    removeGenerator: (argument) => controller.removeGenerator(getText(argument)),
    setGeneratorOption: (argument) => controller.setGeneratorOption(getGeneratorOptionChange(argument)),
    chooseMusicFileForSong: () => controller.chooseMusicFileForSong(),
    searchMusicFolders: (argument) => controller.searchMusicFolders(getText(argument)),
    findSongWithSource: (argument) => controller.findSongWithSource(getSongSourceSearch(argument)),
    stopFindingSong: () => controller.stopFindingSong(),
    makeSong: (argument) => controller.makeSong(getMakeSongRequest(argument)),
    dismissPreselectedSong: (argument) => controller.dismissPreselectedSong(getText(argument)),
    cancelGeneratorJob: (argument) => controller.cancelGeneratorJob(getText(argument)),
    answerVaultChoice: (argument) => controller.answerVaultChoice(getVaultChoiceAnswer(argument)),
    dismissGeneratorJob: (argument) => controller.dismissGeneratorJob(getText(argument)),
    fetchGeneratedSongReport: (argument) => controller.fetchGeneratedSongReport(getText(argument)),
    setLayout: (argument) => controller.setLayout(getLayout(argument)),
    copyActivityDetails: () => controller.copyActivityDetails(),
    restartToUpdate: () => controller.restartToUpdate(),
    dismissUpdate: () => controller.dismissUpdate(),
  };
}

function getTextOrNull(value: unknown): string | null {
  return value === null ? null : getText(value);
}

function getLookupRequest(value: unknown): ServiceLookupRequest {
  const request = getRecord(value);
  return { address: getText(request.address), startCommand: getTextOrNull(request.startCommand) };
}

/** Only the address and the option picks are used: the controller takes everything else from the manifest it read. */
function getGeneratorPreview(value: unknown): GeneratorInstallPreview {
  const preview = getRecord(value);
  return {
    address: getText(preview.address), name: getText(preview.name), version: getText(preview.version), author: getText(preview.author), description: getText(preview.description),
    location: getServiceLocation(preview.location), difficulties: getDifficulties(preview.difficulties), options: getList({ value: preview.options, maxLength: MAX_ADDON_OPTIONS }).map(getAddonOptionView), startCommand: getTextOrNull(preview.startCommand),
  };
}

function getServiceLocation(value: unknown): ServiceLocationView {
  const location = getRecord(value);
  if (location.kind === 'this-computer') return { kind: 'this-computer' };
  if (location.kind === 'internet') return { kind: 'internet', address: getText(location.address) };
  throw new InvalidBridgeArgumentError('Expected where the generator runs.');
}

function getDifficulties(value: unknown): GeneratorDifficulty[] {
  const difficulties = getList({ value, maxLength: GENERATOR_DIFFICULTIES.length });
  return difficulties.map((difficulty) => {
    const knownDifficulty = GENERATOR_DIFFICULTIES.find((candidate) => candidate === difficulty);
    if (!knownDifficulty) throw new InvalidBridgeArgumentError('Expected a difficulty.');
    return knownDifficulty;
  });
}

function getGeneratorOptionChange(value: unknown): { generatorId: string; optionId: string; value: string } {
  const change = getRecord(value);
  return { generatorId: getText(change.generatorId), optionId: getText(change.optionId), value: getText(change.value) };
}

function getSongSourceSearch(value: unknown): SongSourceSearchRequest {
  const search = getRecord(value);
  const entries = Object.entries(getRecord(search.valuesByInputId));
  if (entries.length > MAX_SONG_SOURCE_INPUTS) throw new InvalidBridgeArgumentError(`Expected at most ${String(MAX_SONG_SOURCE_INPUTS)} fields.`);
  return { addonId: getText(search.addonId), valuesByInputId: Object.fromEntries(entries.map(([inputId, text]) => [getText(inputId), getText(text)])) };
}

function getMakeSongRequest(value: unknown): MakeSongRequest {
  const request = getRecord(value);
  const makeSongRequest: MakeSongRequest = { musicId: getText(request.musicId), generatorId: getText(request.generatorId), difficulties: getDifficulties(request.difficulties), hasAgreedToMusicUpload: getBoolean(request.hasAgreedToMusicUpload) };
  if (request.preselectionKey !== undefined) makeSongRequest.preselectionKey = getText(request.preselectionKey);
  return makeSongRequest;
}

function getVaultChoiceAnswer(value: unknown): VaultChoiceAnswer {
  const answer = getRecord(value);
  if (typeof answer.choice !== 'string' || !VAULT_SONG_CHOICES.includes(answer.choice)) throw new InvalidBridgeArgumentError('Expected the vault song or the generated one.');
  return { jobKey: getText(answer.jobKey), choice: answer.choice as VaultSongChoice };
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

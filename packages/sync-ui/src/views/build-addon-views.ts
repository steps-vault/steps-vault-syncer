/** Builds what the addon screens show from installed addons; shared by the website and the desktop app. */
import { getAddonOptionValues, isAddonProviding, type AddonManifest, type AddonOption, type AddonOptionValues, type InstalledAddon } from '@stepsvault/sync-core';
import type { AddonInstallPreview, AddonOptionView, AddonView, SongSourceTabView } from '../sync-ui-types';

export function buildAddonView(addon: InstalledAddon): AddonView {
  const { manifest } = addon;
  return {
    addonId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    providesText: getProvidesText(manifest),
    isEnabled: addon.isEnabled,
    health: { kind: 'working', note: addon.baseUrl },
    options: buildAddonOptionViews({ options: manifest.options, values: addon.optionValues }),
    isAudioSource: isAddonProviding({ manifest, ability: 'audio-links' }),
  };
}

/** The consent step's preview: every option starts at the addon's default. */
export function buildAddonInstallPreview({ address, manifest, startCommand = null }: { address: string; manifest: AddonManifest; startCommand?: string | null }): AddonInstallPreview {
  return {
    address,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    providesText: getProvidesText(manifest),
    options: buildAddonOptionViews({ options: manifest.options, values: {} }),
    seesWhatYouType: isAddonProviding({ manifest, ability: 'song-source' }),
    startCommand,
  };
}

/** The picks from the consent step, as values for buildInstalledAddon (which checks them against the manifest). */
export function getAddonOptionValuesFromViews(options: readonly AddonOptionView[]): AddonOptionValues {
  return Object.fromEntries(options.map((option) => [option.optionId, option.value]));
}

/** One tab on the Make a song page for each song source that is turned on, drawn from its declared inputs. */
export function buildSongSourceTabs(addons: readonly InstalledAddon[]): SongSourceTabView[] {
  return addons
    .filter((addon) => addon.isEnabled && isAddonProviding({ manifest: addon.manifest, ability: 'song-source' }))
    .map((addon) => ({ addonId: addon.manifest.id, name: addon.manifest.name, inputs: addon.manifest.inputs }));
}

/** "Audio and video links · New songs to make": what Sync asks the addon for. */
function getProvidesText(manifest: AddonManifest): string {
  const providedTexts: string[] = [];
  if (isAddonProviding({ manifest, ability: 'audio-links' })) providedTexts.push(isAddonProviding({ manifest, ability: 'video-links' }) ? 'Audio and video links' : 'Audio links');
  if (isAddonProviding({ manifest, ability: 'song-source' })) providedTexts.push('New songs to make');
  return providedTexts.join(' · ');
}

export function buildAddonOptionViews({ options, values }: { options: readonly AddonOption[] | undefined; values: AddonOptionValues }): AddonOptionView[] {
  const checkedValues = getAddonOptionValues({ options, savedValues: values });
  return (options ?? []).map((option) => ({ optionId: option.id, label: option.label, choices: option.choices, value: checkedValues[option.id] ?? option.default }));
}

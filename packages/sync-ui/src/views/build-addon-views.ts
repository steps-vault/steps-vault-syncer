/** Builds what the addon screens show from installed addons; shared by the website and the desktop app. */
import { getAddonOptionValues, type AddonManifest, type AddonOption, type AddonOptionValues, type InstalledAddon } from '@stepsvault/sync-core';
import type { AddonInstallPreview, AddonOptionView, AddonView } from '../sync-ui-types';

export function buildAddonView(addon: InstalledAddon): AddonView {
  const { manifest } = addon;
  return {
    addonId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    providesText: manifest.provides.includes('video-links') ? 'Audio and video links' : 'Audio links',
    isEnabled: addon.isEnabled,
    health: { kind: 'working', note: addon.baseUrl },
    options: buildAddonOptionViews({ options: manifest.options, values: addon.optionValues }),
  };
}

/** The consent step's preview: every option starts at the addon's default. */
export function buildAddonInstallPreview({ address, manifest }: { address: string; manifest: AddonManifest }): AddonInstallPreview {
  return { address, name: manifest.name, version: manifest.version, author: manifest.author, options: buildAddonOptionViews({ options: manifest.options, values: {} }) };
}

/** The picks from the consent step, as values for buildInstalledAddon (which checks them against the manifest). */
export function getAddonOptionValuesFromViews(options: readonly AddonOptionView[]): AddonOptionValues {
  return Object.fromEntries(options.map((option) => [option.optionId, option.value]));
}

function buildAddonOptionViews({ options, values }: { options: readonly AddonOption[] | undefined; values: AddonOptionValues }): AddonOptionView[] {
  const checkedValues = getAddonOptionValues({ options, savedValues: values });
  return (options ?? []).map((option) => ({ optionId: option.id, label: option.label, choices: option.choices, value: checkedValues[option.id] ?? option.default }));
}

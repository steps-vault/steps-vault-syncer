import { buildInstalledAddon, type AddonManifest } from '@stepsvault/sync-core';
import { describe, expect, it } from 'vitest';
import { buildAddonInstallPreview, buildAddonView, getAddonOptionValuesFromViews } from './build-addon-views';

const MEDIA_CHOICES = [{ value: 'audio', label: 'Music only' }, { value: 'audio-and-video', label: 'Music and video' }];
const MANIFEST: AddonManifest = {
  protocol: 1, id: 'indie.tapes', name: 'Indie Tapes', version: '0.6.1', author: 'hyperpad', description: '', provides: ['audio-links', 'video-links'],
  options: [{ id: 'media', label: 'What to get', kind: 'choice', choices: MEDIA_CHOICES, default: 'audio-and-video' }],
};

describe('addon views', () => {
  it('shows each option with the player’s pick', () => {
    const addon = buildInstalledAddon({ baseUrl: 'https://tapes.example.org', manifest: MANIFEST, consentedAt: '', optionValues: { media: 'audio' } });
    expect(buildAddonView(addon)).toMatchObject({ addonId: 'indie.tapes', providesText: 'Audio and video links', options: [{ optionId: 'media', label: 'What to get', choices: MEDIA_CHOICES, value: 'audio' }] });
  });

  it('starts the consent step at the defaults, and turns the picks back into values', () => {
    const preview = buildAddonInstallPreview({ address: 'https://tapes.example.org', manifest: MANIFEST });
    expect(preview.options).toEqual([{ optionId: 'media', label: 'What to get', choices: MEDIA_CHOICES, value: 'audio-and-video' }]);
    expect(getAddonOptionValuesFromViews(preview.options.map((option) => ({ ...option, value: 'audio' })))).toEqual({ media: 'audio' });
  });

  it('shows no options for an addon without them', () => {
    const addon = buildInstalledAddon({ baseUrl: 'https://tapes.example.org', manifest: { ...MANIFEST, provides: ['audio-links'], options: [] }, consentedAt: '' });
    expect(buildAddonView(addon)).toMatchObject({ providesText: 'Audio links', options: [] });
  });
});

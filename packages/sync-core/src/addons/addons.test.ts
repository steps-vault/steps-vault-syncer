import { describe, expect, it } from 'vitest';
import { HttpRequestError, type HttpClient, type HttpRequest, type HttpResponse } from '../network/http-client';
import { getAddonBaseUrl, InvalidAddonAddressError } from './addon-address';
import { buildInstalledAddon, fetchAddonManifest, fetchAudioLinks, isAddonSetToMusicOnly, loadSavedAddon, withAddonOption } from './addon-client';
import { parseAddonOptions, type AddonChoiceOption } from './addon-options';
import type { AddonManifest, AddonSongFacts } from './addon-protocol';

const MANIFEST: AddonManifest = { protocol: 1, id: 'indie.tapes', name: 'Indie Tapes', version: '0.6.1', author: 'hyperpad', description: 'Links to files on our own server.', provides: ['audio-links'], options: [] };
const MEDIA_OPTION: AddonChoiceOption = { id: 'media', label: 'What to get', kind: 'choice', choices: [{ value: 'audio', label: 'Music only' }, { value: 'audio-and-video', label: 'Music and video' }], default: 'audio-and-video' };
const MANIFEST_WITH_OPTIONS: AddonManifest = { ...MANIFEST, provides: ['audio-links', 'video-links'], options: [MEDIA_OPTION] };
const SONG: AddonSongFacts = { title: 'Pulse Garden', artist: 'Kairo Lights', album: null, genre: 'Electronic', lengthSeconds: 201, youtubeId: 'abcdefghijk', youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk' };

/** Answers each request with the next canned answer, and remembers what was sent. */
class RecordedHttpClient implements HttpClient {
  readonly requests: HttpRequest[] = [];
  constructor(private readonly answers: (HttpResponse<unknown> | HttpRequestError)[]) {}

  requestJson(request: HttpRequest): Promise<HttpResponse<unknown>> {
    this.requests.push(request);
    const answer = this.answers.shift();
    if (!answer) return Promise.reject(new Error('No recorded answer left.'));
    return answer instanceof HttpRequestError ? Promise.reject(answer) : Promise.resolve(answer);
  }

  requestText(): Promise<HttpResponse<string>> {
    return Promise.reject(new Error('Not used by addons.'));
  }

  requestBytes(): Promise<HttpResponse<Uint8Array>> {
    return Promise.reject(new Error('Not used by addons.'));
  }
}

const ADDON = buildInstalledAddon({ baseUrl: 'https://addons.example.org/indie', manifest: MANIFEST, consentedAt: '2026-10-24T10:00:00Z' });

describe('addon addresses', () => {
  it('accepts https, and http only for an addon on this computer', () => {
    expect(getAddonBaseUrl(' https://addons.example.org/indie/ ')).toBe('https://addons.example.org/indie');
    expect(getAddonBaseUrl('http://127.0.0.1:47863')).toBe('http://127.0.0.1:47863');
  });

  it.each(['addons.example.org', 'http://addons.example.org', 'ftp://example.org', 'https://user:pass@example.org', 'https://example.org/?token=1', 'javascript:alert(1)'])('refuses %s', (address) => {
    expect(() => getAddonBaseUrl(address)).toThrow(InvalidAddonAddressError);
  });
});

describe('fetchAddonManifest', () => {
  it('reads a manifest for the consent screen', async () => {
    const httpClient = new RecordedHttpClient([{ status: 200, body: MANIFEST }]);
    const result = await fetchAddonManifest({ httpClient, address: 'https://addons.example.org/indie' });
    expect(result.manifest.name).toBe('Indie Tapes');
    expect(httpClient.requests[0]?.url).toBe('https://addons.example.org/indie/manifest.json');
  });

  it.each([
    [{ ...MANIFEST, protocol: 2 }, 'different version'],
    [{ ...MANIFEST, id: 'Bad Id!' }, 'no valid id'],
    [{ ...MANIFEST, provides: ['lyrics'] }, 'doesn’t provide audio links'],
    [{ ...MANIFEST, name: '' }, 'missing its name'],
  ])('refuses a bad manifest', async (manifest, message) => {
    const httpClient = new RecordedHttpClient([{ status: 200, body: manifest }]);
    await expect(fetchAddonManifest({ httpClient, address: 'https://addons.example.org' })).rejects.toThrow(message);
  });

  it('explains when nothing answers', async () => {
    const httpClient = new RecordedHttpClient([new HttpRequestError({ failure: 'network', message: 'offline' })]);
    await expect(fetchAddonManifest({ httpClient, address: 'https://addons.example.org' })).rejects.toThrow('No addon answered');
  });
});

describe('fetchAudioLinks', () => {
  it('sends only the song facts, and keeps only links that follow the rules', async () => {
    const links = [
      { kind: 'file-url', url: 'https://cdn.example.org/pulse.ogg', label: 'Pulse Garden (ogg)', fileName: 'pulse.ogg' },
      { kind: 'file-url', url: 'http://files.example.org/pulse.mp3', label: 'not https' },
      { kind: 'open-page', url: 'https://store.example.org/pulse', label: 'Buy it' },
      { kind: 'open-page', url: 'http://store.example.org/pulse', label: 'not https' },
      { kind: 'run-this', url: 'https://example.org/x.exe', label: 'unknown kind' },
    ];
    const httpClient = new RecordedHttpClient([{ status: 200, body: { links } }]);
    // Extra fields a caller might pass by mistake (here an e-mail) must never reach the addon.
    const songWithExtras = { ...SONG, accountEmail: 'player@example.org' };
    const result = await fetchAudioLinks({ httpClient, addon: ADDON, song: songWithExtras });
    expect(httpClient.requests[0]?.jsonBody).toEqual({ protocol: 1, song: SONG });
    expect(result).toEqual({
      kind: 'links',
      addonError: null,
      links: [
        { kind: 'file-url', media: 'audio', url: 'https://cdn.example.org/pulse.ogg', label: 'Pulse Garden (ogg)', fileName: 'pulse.ogg' },
        { kind: 'open-page', url: 'https://store.example.org/pulse', label: 'Buy it' },
      ],
    });
  });

  it('accepts a local file link from an addon on this computer', async () => {
    const localAddon = { ...ADDON, baseUrl: 'http://127.0.0.1:47863' };
    const httpClient = new RecordedHttpClient([{ status: 200, body: { links: [{ kind: 'file-url', url: 'http://127.0.0.1:47863/files/abcdefghijk.ogg', label: 'Local' }] } }]);
    expect(await fetchAudioLinks({ httpClient, addon: localAddon, song: SONG })).toMatchObject({ kind: 'links', links: [{ url: 'http://127.0.0.1:47863/files/abcdefghijk.ogg' }] });
  });

  it('waits when the addon is still working, within sane limits', async () => {
    const httpClient = new RecordedHttpClient([{ status: 202, body: { retryAfterSeconds: 5 } }, { status: 202, body: { retryAfterSeconds: 99_999 } }]);
    expect(await fetchAudioLinks({ httpClient, addon: ADDON, song: SONG })).toEqual({ kind: 'working', retryAfterSeconds: 5 });
    expect(await fetchAudioLinks({ httpClient, addon: ADDON, song: SONG })).toEqual({ kind: 'working', retryAfterSeconds: 600 });
  });

  it.each([
    [new HttpRequestError({ failure: 'timeout', message: 'slow' }), 'taking too long'],
    [new HttpRequestError({ failure: 'too-large', message: 'big' }), 'too much data'],
    [new HttpRequestError({ failure: 'network', message: 'offline' }), 'isn’t answering'],
    [{ status: 500, body: 'oops' }, 'can’t use'],
  ])('never crashes on a broken addon: the song just waits', async (answer, message) => {
    const httpClient = new RecordedHttpClient([answer]);
    const result = await fetchAudioLinks({ httpClient, addon: ADDON, song: SONG });
    expect(result.kind).toBe('not-answering');
    expect(result.kind === 'not-answering' && result.message).toContain(message);
  });

  it('asks for small answers with a timeout', async () => {
    const httpClient = new RecordedHttpClient([{ status: 200, body: { links: [], error: 'Video unavailable' } }]);
    expect(await fetchAudioLinks({ httpClient, addon: ADDON, song: SONG })).toEqual({ kind: 'links', links: [], addonError: 'Video unavailable' });
    expect(httpClient.requests[0]).toMatchObject({ timeoutMilliseconds: 20_000, maxResponseBytes: 65_536 });
  });
});

describe('video links', () => {
  it('reads a manifest that also provides videos, and marks each file link as audio or video', async () => {
    const httpClient = new RecordedHttpClient([
      { status: 200, body: { ...MANIFEST, provides: ['audio-links', 'video-links', 'lyrics'] } },
      { status: 200, body: { links: [{ kind: 'file-url', url: 'https://cdn.example.org/a.ogg', label: 'Audio' }, { kind: 'file-url', media: 'video', url: 'https://cdn.example.org/v.mp4', label: 'Video', fileName: 'v.mp4' }] } },
    ]);
    expect((await fetchAddonManifest({ httpClient, address: 'https://cdn.example.org' })).manifest.provides).toEqual(['audio-links', 'video-links']);
    expect(await fetchAudioLinks({ httpClient, addon: ADDON, song: SONG })).toMatchObject({ links: [{ media: 'audio', url: 'https://cdn.example.org/a.ogg' }, { media: 'video', url: 'https://cdn.example.org/v.mp4' }] });
  });
});

describe('addon options', () => {
  it('reads valid options from the manifest and drops broken ones without refusing the addon', async () => {
    const options = [
      MEDIA_OPTION,
      { ...MEDIA_OPTION, id: 'Bad Id' },
      { ...MEDIA_OPTION, id: 'quality', default: 'best' },
      { ...MEDIA_OPTION, id: 'one-choice', choices: [{ value: 'audio', label: 'Music only' }], default: 'audio' },
      { ...MEDIA_OPTION, id: 'free-text', kind: 'text' },
      { ...MEDIA_OPTION, id: 'duplicate-values', choices: [{ value: 'audio', label: 'A' }, { value: 'audio', label: 'B' }], default: 'audio' },
      { ...MEDIA_OPTION, label: 'A second option with the same id' },
    ];
    const httpClient = new RecordedHttpClient([{ status: 200, body: { ...MANIFEST, options } }]);
    expect((await fetchAddonManifest({ httpClient, address: 'https://addons.example.org' })).manifest.options).toEqual([MEDIA_OPTION]);
  });

  it('keeps at most 8 options, and an addon without options gets an empty list', () => {
    const options = Array.from({ length: 10 }, (_, index) => ({ ...MEDIA_OPTION, id: `option-${String(index)}` }));
    expect(parseAddonOptions(options).map((option) => option.id)).toEqual(['option-0', 'option-1', 'option-2', 'option-3', 'option-4', 'option-5', 'option-6', 'option-7']);
    expect(parseAddonOptions(undefined)).toEqual([]);
    expect(parseAddonOptions('media')).toEqual([]);
  });

  it('installs with the picked values, keeping only declared options and choices', () => {
    const addon = buildInstalledAddon({ baseUrl: 'https://addons.example.org', manifest: MANIFEST_WITH_OPTIONS, consentedAt: '2026-10-24T10:00:00Z', optionValues: { media: 'audio', email: 'player@example.org' } });
    expect(addon.optionValues).toEqual({ media: 'audio' });
    expect(buildInstalledAddon({ baseUrl: 'https://addons.example.org', manifest: MANIFEST_WITH_OPTIONS, consentedAt: '', optionValues: { media: 'everything' } }).optionValues).toEqual({ media: 'audio-and-video' });
  });

  it('sends the chosen values with every request, and no options field to an addon without options', async () => {
    const addon = buildInstalledAddon({ baseUrl: 'https://addons.example.org', manifest: MANIFEST_WITH_OPTIONS, consentedAt: '', optionValues: { media: 'audio' } });
    const httpClient = new RecordedHttpClient([{ status: 200, body: { links: [] } }, { status: 200, body: { links: [] } }]);
    await fetchAudioLinks({ httpClient, addon, song: SONG });
    await fetchAudioLinks({ httpClient, addon: ADDON, song: SONG });
    expect(httpClient.requests[0]?.jsonBody).toEqual({ protocol: 1, song: SONG, options: { media: 'audio' } });
    expect(httpClient.requests[1]?.jsonBody).toEqual({ protocol: 1, song: SONG });
  });

  it('changes one option only to a declared choice', () => {
    const addon = buildInstalledAddon({ baseUrl: 'https://addons.example.org', manifest: MANIFEST_WITH_OPTIONS, consentedAt: '' });
    expect(isAddonSetToMusicOnly(addon)).toBe(false);
    const musicOnly = withAddonOption({ addon, optionId: 'media', value: 'audio' });
    expect(musicOnly.optionValues).toEqual({ media: 'audio' });
    expect(isAddonSetToMusicOnly(musicOnly)).toBe(true);
    expect(withAddonOption({ addon: musicOnly, optionId: 'media', value: 'C:\\Windows' }).optionValues).toEqual({ media: 'audio' });
    expect(withAddonOption({ addon: musicOnly, optionId: 'unknown', value: 'audio' }).optionValues).toEqual({ media: 'audio' });
  });

  it('loads an addon saved before options existed with the defaults, and refuses broken saved addons', () => {
    const savedBeforeOptions = { baseUrl: 'https://addons.example.org', manifest: MANIFEST_WITH_OPTIONS, isEnabled: false, consentedAt: '2026-10-01T10:00:00Z' };
    expect(loadSavedAddon(savedBeforeOptions)).toEqual({ ...savedBeforeOptions, optionValues: { media: 'audio-and-video' } });
    const manifestWithoutOptions = Object.fromEntries(Object.entries(MANIFEST).filter(([key]) => key !== 'options'));
    expect(loadSavedAddon({ ...savedBeforeOptions, manifest: manifestWithoutOptions })?.manifest.options).toEqual([]);
    expect(loadSavedAddon({ ...savedBeforeOptions, optionValues: { media: 'audio' } })?.optionValues).toEqual({ media: 'audio' });
    expect(loadSavedAddon({ ...savedBeforeOptions, manifest: { ...MANIFEST, protocol: 2 } })).toBeNull();
    expect(loadSavedAddon({ baseUrl: 7 })).toBeNull();
    expect(loadSavedAddon(null)).toBeNull();
  });
});

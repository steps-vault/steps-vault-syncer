import { describe, expect, it } from 'vitest';
import { HttpRequestError, type HttpClient, type HttpRequest, type HttpResponse } from '../network/http-client';
import { getAddonBaseUrl, InvalidAddonAddressError } from './addon-address';
import { buildInstalledAddon, fetchAddonManifest, fetchAudioLinks, isAddonSetToMusicOnly, loadSavedAddon, withAddonOption } from './addon-client';
import { parseAddonOptions, type AddonChoiceOption } from './addon-options';
import { parseAddonManifest, type AddonManifest, type AddonSongFacts } from './addon-protocol';
import { fetchSongSource, waitForSongSource } from './song-source-client';
import { getCheckedSongSourceInputValue, getSongSourceInputValues, InvalidSongSourceInputError, type SongSourceInput } from './song-source-inputs';

const MANIFEST: AddonManifest = { protocol: 1, kind: 'addon', id: 'indie.tapes', name: 'Indie Tapes', version: '0.6.1', author: 'hyperpad', description: 'Links to files on our own server.', provides: ['audio-links'], inputs: [], options: [] };
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
    [{ ...MANIFEST, provides: ['lyrics'] }, 'doesn’t provide anything this version of Sync can use'],
    [{ ...MANIFEST, provides: ['video-links'] }, 'doesn’t provide anything this version of Sync can use'],
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

describe('addon kind', () => {
  it('needs kind addon, and refuses a generator or a manifest without kind', () => {
    const manifest = { protocol: 1, id: 'indie.tapes', name: 'Indie Tapes', version: '1.0.0', author: 'hyperpad', description: 'Our songs.', provides: ['audio-links'] };
    expect(parseAddonManifest({ ...manifest, kind: 'addon' }).kind).toBe('addon');
    expect(() => parseAddonManifest(manifest)).toThrow('This address isn’t an addon');
    expect(() => parseAddonManifest({ ...manifest, kind: 'generator' })).toThrow('This is a generator, not an addon. Add it under Generators instead.');
    expect(() => parseAddonManifest({ ...manifest, kind: 'theme' })).toThrow('This address isn’t an addon');
  });
});

const YOUTUBE_LINK_INPUT: SongSourceInput = { id: 'link', kind: 'link', label: 'YouTube link', placeholder: 'https://youtu.be/…', sites: ['youtube.com', 'youtu.be'] };
const SEARCH_INPUT: SongSourceInput = { id: 'search', kind: 'search', label: 'Title or artist', placeholder: null };
const SONG_SOURCE_MANIFEST = { protocol: 1, kind: 'addon', id: 'tube.source', name: 'Tube Source', version: '1.0.0', author: 'hyperpad', description: 'Songs from video links.', provides: ['song-source'], inputs: [YOUTUBE_LINK_INPUT] };
const SONG_SOURCE_ADDON = buildInstalledAddon({ baseUrl: 'https://tube.example.org', manifest: parseAddonManifest(SONG_SOURCE_MANIFEST), consentedAt: '2026-10-25T10:00:00Z' });
const FOUND_SONG = { title: 'Pulse Garden', artist: 'Kairo Lights', album: null, genre: null, lengthSeconds: 201, youtubeId: 'dQw4w9WgXcQ' };
const MUSIC_LINK = { kind: 'file-url', media: 'audio', url: 'https://files.tube.example.org/a.ogg', label: 'Music', fileName: 'a.ogg' };
const VIDEO_LINK = { kind: 'file-url', media: 'video', url: 'https://files.tube.example.org/v.mp4', label: 'Video', fileName: 'v.mp4' };
const PLAYER_LINK = { link: 'https://youtu.be/dQw4w9WgXcQ' };

function getInputProblem({ input, value }: { input: SongSourceInput; value: string }): string | null {
  try {
    getCheckedSongSourceInputValue({ input, value });
    return null;
  } catch (error) {
    if (error instanceof InvalidSongSourceInputError) return error.message;
    throw error;
  }
}

describe('song source manifests', () => {
  it('reads a song source with its inputs, and gives other addons no inputs', () => {
    const manifest = parseAddonManifest({ ...SONG_SOURCE_MANIFEST, provides: ['song-source', 'audio-links'], inputs: [{ ...YOUTUBE_LINK_INPUT, sites: ['YouTube.com', 'youtu.be'] }, SEARCH_INPUT] });
    expect(manifest.provides).toEqual(['audio-links', 'song-source']);
    expect(manifest.inputs).toEqual([YOUTUBE_LINK_INPUT, SEARCH_INPUT]);
    expect(parseAddonManifest({ ...MANIFEST, inputs: [SEARCH_INPUT] }).inputs).toEqual([]);
  });

  it('accepts a song source that provides nothing else, and loads it again from saved settings', () => {
    expect(parseAddonManifest(SONG_SOURCE_MANIFEST).provides).toEqual(['song-source']);
    expect(loadSavedAddon(JSON.parse(JSON.stringify(SONG_SOURCE_ADDON)))?.manifest.inputs).toEqual([YOUTUBE_LINK_INPUT]);
  });

  it('drops broken inputs without refusing the addon', () => {
    const inputs = [
      SEARCH_INPUT,
      { ...SEARCH_INPUT, id: 'Bad Id' },
      { ...SEARCH_INPUT, id: 'no-label', label: '  ' },
      { ...SEARCH_INPUT, id: 'free-form', kind: 'textarea' },
      { ...YOUTUBE_LINK_INPUT, id: 'no-sites', sites: [] },
      { ...YOUTUBE_LINK_INPUT, id: 'too-many-sites', sites: Array.from({ length: 11 }, (_, index) => `site${String(index)}.example.org`) },
      { ...YOUTUBE_LINK_INPUT, id: 'every-com-site', sites: ['com'] },
      { ...YOUTUBE_LINK_INPUT, id: 'address-as-site', sites: ['127.0.0.1'] },
      { ...SEARCH_INPUT, label: 'A second input with the same id' },
      { ...SEARCH_INPUT, id: 'long-texts', label: 'L'.repeat(50), placeholder: 'P'.repeat(100) },
    ];
    expect(parseAddonManifest({ ...SONG_SOURCE_MANIFEST, inputs }).inputs).toEqual([SEARCH_INPUT, { ...SEARCH_INPUT, id: 'long-texts', label: 'L'.repeat(40), placeholder: 'P'.repeat(80) }]);
  });

  it('keeps at most 3 inputs', () => {
    const inputs = Array.from({ length: 5 }, (_, index) => ({ ...SEARCH_INPUT, id: `search-${String(index)}` }));
    expect(parseAddonManifest({ ...SONG_SOURCE_MANIFEST, inputs }).inputs.map((input) => input.id)).toEqual(['search-0', 'search-1', 'search-2']);
  });

  it.each([[undefined], [[]], [[{ ...SEARCH_INPUT, id: 'Bad Id' }]]])('refuses a song source with no valid input', (inputs) => {
    expect(() => parseAddonManifest({ ...SONG_SOURCE_MANIFEST, inputs })).toThrow('has no valid field for you to fill in');
  });

  it('refuses an addon with no ability Sync knows', () => {
    expect(() => parseAddonManifest({ ...SONG_SOURCE_MANIFEST, provides: ['lyrics', 'video-links'] })).toThrow('doesn’t provide anything this version of Sync can use');
  });
});

describe('song source inputs', () => {
  it.each([
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    '  https://YOUTUBE.com/watch?v=dQw4w9WgXcQ  ',
  ])('accepts %s, on a listed site or a subdomain of one', (link) => {
    expect(getInputProblem({ input: YOUTUBE_LINK_INPUT, value: link })).toBeNull();
  });

  it.each([
    ['https://evil-youtube.com/watch?v=dQw4w9WgXcQ', 'Paste a link from youtube.com or youtu.be.'],
    ['https://youtube.com.evil.example/watch', 'Paste a link from youtube.com or youtu.be.'],
    ['https://vimeo.com/123', 'Paste a link from youtube.com or youtu.be.'],
    ['http://youtu.be/dQw4w9WgXcQ', 'Paste a link that starts with https://'],
    ['https://player:secret@youtu.be/dQw4w9WgXcQ', 'without a user name or password'],
    ['youtu.be/dQw4w9WgXcQ', 'doesn’t look like a link'],
    [`https://youtu.be/${'a'.repeat(2001)}`, 'doesn’t look like a link'],
    ['   ', 'Paste a link from youtube.com or youtu.be.'],
  ])('refuses %s with a sentence for the field', (link, message) => {
    expect(getInputProblem({ input: YOUTUBE_LINK_INPUT, value: link })).toContain(message);
  });

  it('trims a search and refuses one over 200 characters', () => {
    expect(getCheckedSongSourceInputValue({ input: SEARCH_INPUT, value: '  Pulse Garden  ' })).toBe('Pulse Garden');
    expect(getInputProblem({ input: SEARCH_INPUT, value: 'a'.repeat(200) })).toBeNull();
    expect(getInputProblem({ input: SEARCH_INPUT, value: 'a'.repeat(201) })).toBe('Make it shorter: at most 200 characters.');
  });

  it('leaves out empty fields, needs at least one, and names the field with a problem', () => {
    const inputs = [YOUTUBE_LINK_INPUT, SEARCH_INPUT];
    expect(getSongSourceInputValues({ inputs, valuesByInputId: { link: ' ', search: 'Pulse Garden', unknown: 'never sent' } })).toEqual({ search: 'Pulse Garden' });
    expect(() => getSongSourceInputValues({ inputs, valuesByInputId: {} })).toThrow(expect.objectContaining({ inputId: 'link' }) as Error);
    expect(() => getSongSourceInputValues({ inputs, valuesByInputId: { link: 'http://youtu.be/x', search: 'Pulse Garden' } })).toThrow(expect.objectContaining({ inputId: 'link', name: 'InvalidSongSourceInputError' }) as Error);
  });
});

describe('fetchSongSource', () => {
  it('sends only the checked inputs, and reads the found song and its files', async () => {
    const links = [VIDEO_LINK, { ...MUSIC_LINK, url: 'http://files.tube.example.org/a.ogg' }, MUSIC_LINK, { kind: 'open-page', url: 'https://tube.example.org', label: 'Page' }];
    const httpClient = new RecordedHttpClient([{ status: 200, body: { song: { ...FOUND_SONG, extra: 'ignored' }, links } }]);
    const result = await fetchSongSource({ httpClient, addon: SONG_SOURCE_ADDON, valuesByInputId: { link: ' https://youtu.be/dQw4w9WgXcQ ', other: 'never sent' } });
    expect(httpClient.requests[0]).toMatchObject({ url: 'https://tube.example.org/song-source', method: 'POST', timeoutMilliseconds: 20_000, maxResponseBytes: 65_536 });
    expect(httpClient.requests[0]?.jsonBody).toEqual({ protocol: 1, inputs: PLAYER_LINK });
    expect(result).toEqual({ kind: 'found', song: FOUND_SONG, musicLink: MUSIC_LINK, videoLink: VIDEO_LINK });
  });

  it('keeps title and artist when the other facts are missing or broken', async () => {
    const httpClient = new RecordedHttpClient([{ status: 200, body: { song: { title: ' Pulse Garden ', artist: 'Kairo Lights', lengthSeconds: -3, youtubeId: 'not an id' }, links: [{ ...MUSIC_LINK, media: undefined }] } }]);
    const result = await fetchSongSource({ httpClient, addon: SONG_SOURCE_ADDON, valuesByInputId: PLAYER_LINK });
    expect(result).toMatchObject({ kind: 'found', song: { title: 'Pulse Garden', artist: 'Kairo Lights', album: null, genre: null, lengthSeconds: null, youtubeId: null }, videoLink: null });
  });

  it('sends the options, and drops the video when the player chose music only', async () => {
    const manifest: AddonManifest = { ...SONG_SOURCE_ADDON.manifest, provides: ['video-links', 'song-source'], options: [MEDIA_OPTION] };
    const addon = buildInstalledAddon({ baseUrl: 'https://tube.example.org', manifest, consentedAt: '', optionValues: { media: 'audio' } });
    const httpClient = new RecordedHttpClient([{ status: 200, body: { song: FOUND_SONG, links: [MUSIC_LINK, VIDEO_LINK] } }]);
    expect(await fetchSongSource({ httpClient, addon, valuesByInputId: PLAYER_LINK })).toMatchObject({ kind: 'found', videoLink: null });
    expect(httpClient.requests[0]?.jsonBody).toEqual({ protocol: 1, inputs: PLAYER_LINK, options: { media: 'audio' } });
  });

  it('says the addon is still working, within sane limits', async () => {
    const httpClient = new RecordedHttpClient([{ status: 202, body: { retryAfterSeconds: 0 } }]);
    expect(await fetchSongSource({ httpClient, addon: SONG_SOURCE_ADDON, valuesByInputId: PLAYER_LINK })).toEqual({ kind: 'working', retryAfterSeconds: 1 });
  });

  it('passes on the addon’s sentence when it found nothing', async () => {
    const httpClient = new RecordedHttpClient([{ status: 200, body: { error: 'That video is private.' } }]);
    expect(await fetchSongSource({ httpClient, addon: SONG_SOURCE_ADDON, valuesByInputId: PLAYER_LINK })).toEqual({ kind: 'not-found', addonError: 'That video is private.' });
  });

  it.each([
    [{ status: 200, body: { song: { ...FOUND_SONG, artist: null }, links: [MUSIC_LINK] } }, 'didn’t say its title and artist'],
    [{ status: 200, body: { song: { artist: 'Kairo Lights' }, links: [MUSIC_LINK] } }, 'didn’t say its title and artist'],
    [{ status: 200, body: { song: FOUND_SONG, links: [VIDEO_LINK] } }, 'sent no music file'],
    [{ status: 200, body: { song: FOUND_SONG, links: [{ ...MUSIC_LINK, url: 'http://files.tube.example.org/a.ogg' }] } }, 'sent no music file'],
    [{ status: 200, body: { song: FOUND_SONG } }, 'sent no music file'],
    [{ status: 200, body: {} }, 'neither a song nor a reason'],
    [{ status: 404, body: {} }, 'answered with an error (404)'],
    [new HttpRequestError({ failure: 'timeout', message: 'slow' }), 'taking too long'],
    [new HttpRequestError({ failure: 'too-large', message: 'big' }), 'too much data'],
    [new HttpRequestError({ failure: 'network', message: 'offline' }), 'isn’t answering'],
  ])('never crashes on an answer it can’t use', async (answer, message) => {
    const httpClient = new RecordedHttpClient([answer]);
    const result = await fetchSongSource({ httpClient, addon: SONG_SOURCE_ADDON, valuesByInputId: PLAYER_LINK });
    expect(result.kind).toBe('not-answering');
    expect(result.kind === 'not-answering' && result.message).toContain(message);
    expect(result.kind === 'not-answering' && result.message).toContain('Tube Source');
  });

  it('checks the player’s input before sending anything', async () => {
    const httpClient = new RecordedHttpClient([]);
    await expect(fetchSongSource({ httpClient, addon: SONG_SOURCE_ADDON, valuesByInputId: { link: 'https://evil-youtube.com/watch?v=x' } })).rejects.toThrow(InvalidSongSourceInputError);
    expect(httpClient.requests).toEqual([]);
  });

  it('refuses to ask an addon that isn’t a song source', async () => {
    await expect(fetchSongSource({ httpClient: new RecordedHttpClient([]), addon: ADDON, valuesByInputId: PLAYER_LINK })).rejects.toThrow('doesn’t bring new songs');
  });
});

describe('waitForSongSource', () => {
  it('waits as long as the addon says, then returns its answer', async () => {
    const waitedSeconds: number[] = [];
    const httpClient = new RecordedHttpClient([{ status: 202, body: { retryAfterSeconds: 5 } }, { status: 202, body: { retryAfterSeconds: 99_999 } }, { status: 200, body: { song: FOUND_SONG, links: [MUSIC_LINK] } }]);
    const waitSeconds = (seconds: number): Promise<void> => {
      waitedSeconds.push(seconds);
      return Promise.resolve();
    };
    const result = await waitForSongSource({ httpClient, addon: SONG_SOURCE_ADDON, valuesByInputId: PLAYER_LINK, waitSeconds });
    expect(waitedSeconds).toEqual([5, 600]);
    expect(result).toMatchObject({ kind: 'found', musicLink: MUSIC_LINK });
  });

  it('stops when the player cancels while waiting', async () => {
    let isCancelled = false;
    const httpClient = new RecordedHttpClient([{ status: 202, body: { retryAfterSeconds: 5 } }]);
    const waitSeconds = (): Promise<void> => {
      isCancelled = true;
      return Promise.resolve();
    };
    const result = await waitForSongSource({ httpClient, addon: SONG_SOURCE_ADDON, valuesByInputId: PLAYER_LINK, shouldStop: () => isCancelled, waitSeconds });
    expect(result).toEqual({ kind: 'stopped' });
    expect(httpClient.requests).toHaveLength(1);
  });

  it('gives up on an addon that keeps working for too long', async () => {
    const httpClient = new RecordedHttpClient(Array.from({ length: 10 }, () => ({ status: 202, body: { retryAfterSeconds: 600 } })));
    const result = await waitForSongSource({ httpClient, addon: SONG_SOURCE_ADDON, valuesByInputId: PLAYER_LINK, waitSeconds: () => Promise.resolve() });
    expect(result).toEqual({ kind: 'not-answering', message: 'Tube Source is still working after 30 minutes. Try again later.' });
    expect(httpClient.requests).toHaveLength(4);
  });
});

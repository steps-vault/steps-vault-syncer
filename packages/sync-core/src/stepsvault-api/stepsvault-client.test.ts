import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../network/http-client';
import { SignedOutError, StepsVaultApiError } from './stepsvault-api-types';
import { buildSongsPath } from '../songs-folder/songs-path';
import { buildComputerSongReports, MAX_COMPUTER_SONGS_PER_REPORT } from './computer-songs';
import { buildAddonSongFacts, pollDeviceSignIn, startDeviceSignIn, StepsVaultClient } from './stepsvault-client';

const SITE_URL = 'https://stepsvault.com/';
const VAULT_SONG = {
  vaultSongId: 'song_7',
  slug: 'sakura-drive',
  title: '桜ドライブ',
  titleTransliteration: 'Sakura Drive',
  artistTransliteration: null,
  artist: 'Rei Hoshino',
  album: null,
  genre: 'J-Pop',
  lengthSeconds: 212,
  levels: [3, 5, 8, 11, 13],
  bpm: 174,
  youtubeId: 'abcdefghijk',
  chartVersion: '0f3a9c1d2e4b5a69',
  imageKinds: ['banner', 'background', 'jacket'],
  hasFingerprint: true,
};

/** Answers by URL, as the StepsVault API does (shapes recorded from the site's own API tests). */
class RecordedApi implements HttpClient {
  readonly requests: HttpRequest[] = [];
  constructor(private readonly answersByUrl: Record<string, HttpResponse<unknown>>) {}

  requestJson(request: HttpRequest): Promise<HttpResponse<unknown>> {
    return this.answer(request);
  }

  requestText(request: HttpRequest): Promise<HttpResponse<string>> {
    return this.answer(request) as Promise<HttpResponse<string>>;
  }

  requestBytes(request: HttpRequest): Promise<HttpResponse<Uint8Array>> {
    return this.answer(request) as Promise<HttpResponse<Uint8Array>>;
  }

  private answer(request: HttpRequest): Promise<HttpResponse<unknown>> {
    this.requests.push(request);
    const answer = this.answersByUrl[`${request.method} ${request.url}`];
    return answer ? Promise.resolve(answer) : Promise.reject(new Error(`No recorded answer for ${request.method} ${request.url}`));
  }
}

describe('signing the app in by code', () => {
  it('gets a code without an account, then waits, then receives the token once', async () => {
    const api = new RecordedApi({
      'POST https://stepsvault.com/api/sync/device-codes': { status: 201, body: { code: 'K7Q4ZP', deviceName: 'LIVING-ROOM-PC', operatingSystem: 'Windows 11', appVersion: '0.1.0', expiresAt: '2026-10-24T12:10:00Z', pollingId: 'secret-polling-id', pollIntervalSeconds: 3 } },
    });
    const deviceCode = await startDeviceSignIn({ httpClient: api, siteUrl: SITE_URL, device: { deviceName: 'LIVING-ROOM-PC', operatingSystem: 'Windows 11', appVersion: '0.1.0' } });
    expect(deviceCode).toEqual({ code: 'K7Q4ZP', expiresAt: '2026-10-24T12:10:00Z', pollingId: 'secret-polling-id', pollIntervalSeconds: 3 });
    expect(api.requests[0]?.headers).toBeUndefined();
  });

  it.each([
    [{ status: 202, body: { status: 'waiting' } }, { status: 'waiting' }],
    [{ status: 429, body: { message: 'Ask at most once every 3 seconds.' } }, { status: 'waiting' }],
    [{ status: 410, body: { message: 'This code has expired.' } }, { status: 'expired' }],
    [{ status: 200, body: { status: 'linked', deviceToken: 'device-token', device: { id: 'device_1', name: 'LIVING-ROOM-PC' } } }, { status: 'linked', deviceToken: 'device-token', deviceName: 'LIVING-ROOM-PC' }],
  ])('reads a poll answer', async (answer, expected) => {
    const api = new RecordedApi({ 'POST https://stepsvault.com/api/sync/device-codes/poll': answer });
    expect(await pollDeviceSignIn({ httpClient: api, siteUrl: SITE_URL, pollingId: 'secret-polling-id' })).toEqual(expected);
  });
});

describe('StepsVaultClient', () => {
  it('reads the vault with the device token', async () => {
    const api = new RecordedApi({ 'GET https://stepsvault.com/api/sync/vault': { status: 200, body: [VAULT_SONG] } });
    const client = new StepsVaultClient({ httpClient: api, siteUrl: SITE_URL, deviceToken: 'device-token' });
    expect(await client.fetchVault()).toEqual([VAULT_SONG]);
    expect(api.requests[0]?.headers).toEqual({ Authorization: 'Bearer device-token' });
  });

  it('fetches a song’s files for the writer: the song file and each image', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const api = new RecordedApi({
      'GET https://stepsvault.com/api/sync/vault': { status: 200, body: [{ ...VAULT_SONG, imageKinds: ['banner', 'jacket'] }] },
      'GET https://stepsvault.com/api/sync/songs/song_7/ssc': { status: 200, body: '#TITLE:Sakura Drive;\n#OFFSET:-0.1;\n' },
      'GET https://stepsvault.com/api/sync/songs/song_7/images/banner': { status: 200, body: png },
      'GET https://stepsvault.com/api/sync/songs/song_7/images/jacket': { status: 200, body: png },
    });
    const client = new StepsVaultClient({ httpClient: api, siteUrl: SITE_URL, deviceToken: null });
    await client.fetchVault();
    const files = await client.fetchSongFiles({ vaultSongId: 'song_7', chartVersion: VAULT_SONG.chartVersion });
    expect(files.sscText).toContain('#OFFSET:-0.1;');
    expect(files.images.map((image) => image.fileName)).toEqual(['banner.png', 'jacket.png']);
  });

  it('reads the fingerprint as little-endian floats at 100 frames a second', async () => {
    const bytes = new Uint8Array(new Float32Array([0, 0.5, 1]).buffer);
    const api = new RecordedApi({ 'GET https://stepsvault.com/api/sync/songs/song_7/fingerprint': { status: 200, body: bytes } });
    const fingerprint = await new StepsVaultClient({ httpClient: api, siteUrl: SITE_URL, deviceToken: 'device-token' }).fetchFingerprint('song_7');
    expect(Array.from(fingerprint.envelope)).toEqual([0, 0.5, 1]);
    expect(fingerprint.rateHertz).toBe(100);
  });

  it('asks to sign in again on 401, and passes on the site’s own message otherwise', async () => {
    const api = new RecordedApi({
      'GET https://stepsvault.com/api/sync/vault': { status: 401, body: { message: 'This computer is signed out.' } },
      'GET https://stepsvault.com/api/sync/songs/song_9/ssc': { status: 404, body: { message: 'This song is not in your vault. Sync again to get your current list of songs.' } },
    });
    const client = new StepsVaultClient({ httpClient: api, siteUrl: SITE_URL, deviceToken: 'old-token' });
    await expect(client.fetchVault()).rejects.toThrow(SignedOutError);
    await expect(client.fetchSongFiles({ vaultSongId: 'song_9', chartVersion: 'x' })).rejects.toThrow(new StepsVaultApiError({ status: 404, message: 'This song is not in your vault. Sync again to get your current list of songs.' }));
  });

  it('adds a song StepsVault already has to the vault, passing on the site’s sentence when it can’t', async () => {
    const api = new RecordedApi({
      'POST https://stepsvault.com/api/sync/vault/song_7': { status: 200, body: { isAdded: true } },
      'POST https://stepsvault.com/api/sync/vault/song_9': { status: 404, body: { error: 'This song isn’t in StepsVault.' } },
    });
    const client = new StepsVaultClient({ httpClient: api, siteUrl: SITE_URL, deviceToken: 'device-token' });
    await client.addToVault('song_7');
    expect(api.requests[0]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer device-token' }, jsonBody: undefined });
    await expect(client.addToVault('song_9')).rejects.toThrow(new StepsVaultApiError({ status: 404, message: 'This song isn’t in StepsVault.' }));
  });

  it('reads the player’s token balance, and asks to sign in again on 401', async () => {
    const me = { tokenBalance: 37, player: { handle: 'noa', initial: 'N', avatarColor: '#7405ec' }, device: { id: 'device_1', name: 'LIVING-ROOM-PC' } };
    const api = new RecordedApi({ 'GET https://stepsvault.com/api/sync/me': { status: 200, body: me } });
    expect(await new StepsVaultClient({ httpClient: api, siteUrl: SITE_URL, deviceToken: 'device-token' }).fetchAccount()).toEqual({ tokenBalance: 37, player: { handle: 'noa', initial: 'N', avatarColor: '#7405ec' } });
    const signedOut = new RecordedApi({ 'GET https://stepsvault.com/api/sync/me': { status: 401, body: { error: 'Sign in first.' } } });
    await expect(new StepsVaultClient({ httpClient: signedOut, siteUrl: SITE_URL, deviceToken: null }).fetchAccount()).rejects.toThrow(SignedOutError);
    const broken = new RecordedApi({ 'GET https://stepsvault.com/api/sync/me': { status: 200, body: { ...me, tokenBalance: -1 } } });
    await expect(new StepsVaultClient({ httpClient: broken, siteUrl: SITE_URL, deviceToken: 'device-token' }).fetchAccount()).rejects.toThrow(StepsVaultApiError);
  });

  it('reports the status counts for the phone view', async () => {
    const api = new RecordedApi({ 'POST https://stepsvault.com/api/sync/devices/me/seen': { status: 200, body: { isRecorded: true } } });
    await new StepsVaultClient({ httpClient: api, siteUrl: SITE_URL, deviceToken: 'device-token' }).reportSeen({ songCountsByStatus: { synced: 14 }, gameName: 'StepMania 5 LTEK' });
    expect(api.requests[0]?.jsonBody).toEqual({ songCountsByStatus: { synced: 14 }, gameName: 'StepMania 5 LTEK' });
  });
});

describe('reportComputerSongs', () => {
  it('posts the whole list with the device token to /api/computer-songs', async () => {
    const api = new RecordedApi({ 'POST https://stepsvault.com/api/computer-songs': { status: 200, body: { recordedSongCount: 1 } } });
    const song = { localId: 'youtube:abc', title: 'Low Tide', artistName: 'Marla Quinn', generatorName: 'Groove Lab', difficulties: ['Easy', 'Hard'], madeAt: '2026-10-24T10:00:00.000Z' };
    await new StepsVaultClient({ httpClient: api, siteUrl: SITE_URL, deviceToken: 'device-token' }).reportComputerSongs([song]);
    expect(api.requests[0]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer device-token' }, jsonBody: { songs: [song] } });
  });

  it('throws the site’s sentence when the report is refused', async () => {
    const api = new RecordedApi({ 'POST https://stepsvault.com/api/computer-songs': { status: 403, body: { message: 'Only the Sync app reports the songs made on its computer.' } } });
    await expect(new StepsVaultClient({ httpClient: api, siteUrl: SITE_URL, deviceToken: null }).reportComputerSongs([])).rejects.toThrow(StepsVaultApiError);
  });
});

describe('buildComputerSongReports', () => {
  it('lists the generated songs newest first, with the facts the site shows, and at most 500', () => {
    const older = { songKey: 'song:a', song: { title: 'Night Drive', artist: 'Lumen Park', album: null, genre: null, lengthSeconds: 201, youtubeId: null }, generatorId: 'tap', generatorVersion: '1.0.0', generatorName: 'Tap Forge', difficulties: ['Easy' as const], installId: 'i1', folderPath: buildSongsPath('My generated songs', 'Night Drive'), inPlaceOfVaultSongId: null, generatedAt: '2026-10-21T10:00:00.000Z' };
    const newer = { ...older, songKey: 'song:b', song: { ...older.song, title: 'Low Tide' }, generatedAt: '2026-10-24T10:00:00.000Z' };
    expect(buildComputerSongReports([older, newer])).toEqual([
      { localId: 'song:b', title: 'Low Tide', artistName: 'Lumen Park', generatorName: 'Tap Forge', difficulties: ['Easy'], madeAt: '2026-10-24T10:00:00.000Z' },
      { localId: 'song:a', title: 'Night Drive', artistName: 'Lumen Park', generatorName: 'Tap Forge', difficulties: ['Easy'], madeAt: '2026-10-21T10:00:00.000Z' },
    ]);
    const many = Array.from({ length: 501 }, (_, index) => ({ ...older, songKey: `song:${String(index)}` }));
    expect(buildComputerSongReports(many)).toHaveLength(MAX_COMPUTER_SONGS_PER_REPORT);
  });
});

describe('buildAddonSongFacts', () => {
  it('passes only the facts addons may see, with the YouTube link built from the id', () => {
    expect(buildAddonSongFacts(VAULT_SONG)).toEqual({ title: '桜ドライブ', artist: 'Rei Hoshino', album: null, genre: 'J-Pop', lengthSeconds: 212, youtubeId: 'abcdefghijk', youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk' });
  });
});

import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../network/http-client';
import { SignedOutError, StepsVaultApiError } from './stepsvault-api-types';
import { buildAddonSongFacts, pollDeviceSignIn, startDeviceSignIn, StepsVaultClient } from './stepsvault-client';

const SITE_URL = 'https://stepsvault.com/';
const VAULT_SONG = {
  vaultSongId: 'song_7',
  slug: 'sakura-drive',
  title: 'Sakura Drive',
  artist: 'Rei Hoshino',
  album: null,
  genre: 'J-Pop',
  lengthSeconds: 212,
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

  it('reports the status counts for the phone view', async () => {
    const api = new RecordedApi({ 'POST https://stepsvault.com/api/sync/devices/me/seen': { status: 200, body: { isRecorded: true } } });
    await new StepsVaultClient({ httpClient: api, siteUrl: SITE_URL, deviceToken: 'device-token' }).reportSeen({ songCountsByStatus: { synced: 14 }, gameName: 'StepMania 5 LTEK' });
    expect(api.requests[0]?.jsonBody).toEqual({ songCountsByStatus: { synced: 14 }, gameName: 'StepMania 5 LTEK' });
  });
});

describe('buildAddonSongFacts', () => {
  it('passes only the facts addons may see, with the YouTube link built from the id', () => {
    expect(buildAddonSongFacts(VAULT_SONG)).toEqual({ title: 'Sakura Drive', artist: 'Rei Hoshino', album: null, genre: 'J-Pop', lengthSeconds: 212, youtubeId: 'abcdefghijk', youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk' });
  });
});

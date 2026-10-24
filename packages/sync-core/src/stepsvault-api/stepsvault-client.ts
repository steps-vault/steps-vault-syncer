import type { AddonSongFacts } from '../addons/addon-protocol';
import type { AudioFingerprint } from '../audio-matching/audio-match';
import { ENVELOPE_RATE_HERTZ } from '../audio-matching/onset-envelope';
import type { HttpClient, HttpRequest, HttpResponse } from '../network/http-client';
import type { SongFiles, VaultFiles } from '../writing/song-writer';
import { SignedOutError, StepsVaultApiError, type DeviceCode, type DeviceDescription, type DeviceSignInPoll, type VaultSongDetails } from './stepsvault-api-types';

const TIMEOUT_MILLISECONDS = 30_000;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_SSC_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FINGERPRINT_BYTES = 16 * 1024 * 1024;
const BYTES_PER_FLOAT = 4;
const YOUTUBE_WATCH_URL = 'https://www.youtube.com/watch?v=';
/** Every StepsVault song has these; used when the vault hasn't been read in this session yet. */
const DEFAULT_IMAGE_KINDS = ['banner', 'background', 'jacket'];

/**
 * The StepsVault API as Sync uses it. The desktop app passes its device token; the website passes none and its
 * HttpClient sends the player's session cookie instead.
 */
export class StepsVaultClient implements VaultFiles {
  private readonly httpClient: HttpClient;
  private readonly apiUrl: string;
  private readonly deviceToken: string | null;
  private readonly imageKindsBySongId = new Map<string, string[]>();

  constructor({ httpClient, siteUrl, deviceToken }: { httpClient: HttpClient; siteUrl: string; deviceToken: string | null }) {
    this.httpClient = httpClient;
    this.apiUrl = `${siteUrl.replace(/\/+$/, '')}/api/sync`;
    this.deviceToken = deviceToken;
  }

  async fetchVault(): Promise<VaultSongDetails[]> {
    const response = await this.httpClient.requestJson(this.buildRequest({ path: '/vault', maxResponseBytes: MAX_JSON_BYTES }));
    assertOk(response);
    if (!Array.isArray(response.body)) throw new StepsVaultApiError({ status: response.status, message: 'StepsVault sent a song list Sync can’t read. Update Sync to the latest version.' });
    const songs = response.body.map((song) => parseVaultSong(song));
    for (const song of songs) this.imageKindsBySongId.set(song.vaultSongId, song.imageKinds);
    return songs;
  }

  /** The files of the song's current steps; if they changed since the vault was read, the next sync updates the song. */
  async fetchSongFiles({ vaultSongId }: { vaultSongId: string; chartVersion: string }): Promise<SongFiles> {
    const songPath = `/songs/${encodeURIComponent(vaultSongId)}`;
    const sscResponse = await this.httpClient.requestText(this.buildRequest({ path: `${songPath}/ssc`, maxResponseBytes: MAX_SSC_BYTES }));
    assertOk(sscResponse);
    const imageKinds = this.imageKindsBySongId.get(vaultSongId) ?? DEFAULT_IMAGE_KINDS;
    const images = await Promise.all(imageKinds.map(async (kind) => ({ fileName: `${kind}.png`, bytes: await this.fetchImage({ songPath, kind }) })));
    return { sscText: sscResponse.body, images };
  }

  async fetchFingerprint(vaultSongId: string): Promise<AudioFingerprint> {
    const response = await this.httpClient.requestBytes(this.buildRequest({ path: `/songs/${encodeURIComponent(vaultSongId)}/fingerprint`, maxResponseBytes: MAX_FINGERPRINT_BYTES }));
    assertOk(response);
    return { envelope: readLittleEndianFloats(response.body), rateHertz: ENVELOPE_RATE_HERTZ };
  }

  /** For the phone status view on the site. Only the app reports; the website never calls this. */
  async reportSeen({ songCountsByStatus, gameName }: { songCountsByStatus: Readonly<Record<string, number>>; gameName: string | null }): Promise<void> {
    const response = await this.httpClient.requestJson(this.buildRequest({ path: '/devices/me/seen', method: 'POST', jsonBody: { songCountsByStatus, gameName: gameName ?? undefined }, maxResponseBytes: MAX_JSON_BYTES }));
    assertOk(response);
  }

  private async fetchImage({ songPath, kind }: { songPath: string; kind: string }): Promise<Uint8Array> {
    const response = await this.httpClient.requestBytes(this.buildRequest({ path: `${songPath}/images/${encodeURIComponent(kind)}`, maxResponseBytes: MAX_IMAGE_BYTES }));
    assertOk(response);
    return response.body;
  }

  private buildRequest({ path, method = 'GET', jsonBody, maxResponseBytes }: { path: string; method?: 'GET' | 'POST'; jsonBody?: unknown; maxResponseBytes: number }): HttpRequest {
    const headers = this.deviceToken ? { Authorization: `Bearer ${this.deviceToken}` } : undefined;
    return { url: `${this.apiUrl}${path}`, method, headers, jsonBody, timeoutMilliseconds: TIMEOUT_MILLISECONDS, maxResponseBytes };
  }
}

/** Step 1 of signing the app in: get a code to show. Needs no account. */
export async function startDeviceSignIn({ httpClient, siteUrl, device }: { httpClient: HttpClient; siteUrl: string; device: DeviceDescription }): Promise<DeviceCode> {
  const response = await httpClient.requestJson({ url: `${siteUrl.replace(/\/+$/, '')}/api/sync/device-codes`, method: 'POST', jsonBody: device, timeoutMilliseconds: TIMEOUT_MILLISECONDS, maxResponseBytes: MAX_JSON_BYTES });
  assertOk(response);
  const body = asRecord(response.body);
  return { code: getString(body.code), expiresAt: getString(body.expiresAt), pollingId: getString(body.pollingId), pollIntervalSeconds: typeof body.pollIntervalSeconds === 'number' ? body.pollIntervalSeconds : 3 };
}

/** Step 2, every pollIntervalSeconds: has the player typed the code yet? */
export async function pollDeviceSignIn({ httpClient, siteUrl, pollingId }: { httpClient: HttpClient; siteUrl: string; pollingId: string }): Promise<DeviceSignInPoll> {
  const response = await httpClient.requestJson({ url: `${siteUrl.replace(/\/+$/, '')}/api/sync/device-codes/poll`, method: 'POST', jsonBody: { pollingId }, timeoutMilliseconds: TIMEOUT_MILLISECONDS, maxResponseBytes: MAX_JSON_BYTES });
  if (response.status === 202 || response.status === 429) return { status: 'waiting' };
  if (response.status === 410) return { status: 'expired' };
  assertOk(response);
  const body = asRecord(response.body);
  return { status: 'linked', deviceToken: getString(body.deviceToken), deviceName: getString(asRecord(body.device).name) };
}

/** Exactly the facts an addon may see (docs/addons.md). */
export function buildAddonSongFacts(song: VaultSongDetails): AddonSongFacts {
  return {
    title: song.title,
    artist: song.artist,
    album: song.album,
    genre: song.genre,
    lengthSeconds: song.lengthSeconds,
    youtubeId: song.youtubeId,
    youtubeUrl: song.youtubeId ? `${YOUTUBE_WATCH_URL}${song.youtubeId}` : null,
  };
}

function assertOk(response: HttpResponse<unknown>): void {
  if (response.status === 401) throw new SignedOutError();
  if (response.status >= 200 && response.status < 300) return;
  const message = typeof response.body === 'object' && response.body !== null && 'message' in response.body ? String((response.body).message) : null;
  throw new StepsVaultApiError({ status: response.status, message: message ?? `StepsVault answered with an error (${String(response.status)}). Try again in a minute.` });
}

function parseVaultSong(value: unknown): VaultSongDetails {
  const song = asRecord(value);
  return {
    vaultSongId: getString(song.vaultSongId),
    slug: getString(song.slug),
    title: getString(song.title),
    artist: getString(song.artist),
    album: typeof song.album === 'string' ? song.album : null,
    genre: typeof song.genre === 'string' ? song.genre : null,
    lengthSeconds: typeof song.lengthSeconds === 'number' ? song.lengthSeconds : 0,
    levels: Array.isArray(song.levels) ? song.levels.slice(0, 5).map((level) => (typeof level === 'number' && level > 0 ? level : null)) : [],
    bpm: typeof song.bpm === 'number' && song.bpm > 0 ? song.bpm : null,
    youtubeId: typeof song.youtubeId === 'string' ? song.youtubeId : null,
    chartVersion: getString(song.chartVersion),
    imageKinds: Array.isArray(song.imageKinds) ? song.imageKinds.filter((kind): kind is string => typeof kind === 'string' && /^[a-z]+$/.test(kind)) : [],
    hasFingerprint: song.hasFingerprint === true,
  };
}

function readLittleEndianFloats(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength % BYTES_PER_FLOAT !== 0) throw new StepsVaultApiError({ status: 200, message: 'The song’s fingerprint arrived broken. Sync again.' });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Float32Array.from({ length: bytes.byteLength / BYTES_PER_FLOAT }, (_, index) => view.getFloat32(index * BYTES_PER_FLOAT, true));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new StepsVaultApiError({ status: 200, message: 'StepsVault sent an answer Sync can’t read. Update Sync to the latest version.' });
  return value as Record<string, unknown>;
}

function getString(value: unknown): string {
  if (typeof value !== 'string') throw new StepsVaultApiError({ status: 200, message: 'StepsVault sent an answer Sync can’t read. Update Sync to the latest version.' });
  return value;
}

import type { InstalledSongsRecord } from '../ownership/installed-songs';
import type { SongsFolder } from '../songs-folder/songs-folder';
import type { LocalBridgePairing } from './local-bridge-pairing';
import {
  LOCAL_BRIDGE_FILE_KINDS,
  LOCAL_BRIDGE_PAIRING_PATH,
  LOCAL_BRIDGE_PROTOCOL_VERSION,
  LOCAL_BRIDGE_SONGS_PATH,
  type LocalBridgeErrorAnswer,
  type LocalBridgeErrorReason,
  type LocalBridgeFileKind,
} from './local-bridge-protocol';
import { getLocalBridgeSongFile, getLocalBridgeSongs, type LocalBridgeSongFile } from './local-bridge-songs';

/**
 * Answers one request to the local bridge. The checks run in this order, and a request that fails one gets no CORS
 * headers, so the browser hides even the refusal from the page that sent it:
 * 1. Host is the bridge's own loopback address (a page that rebinds its own name to 127.0.0.1 sends its name here).
 * 2. Origin is exactly one of the StepsVault site's (a request without one, from curl or another program, is refused).
 * 3. Every path but the pairing needs a paired browser's token.
 */

/** The pairing body is a short JSON object; the server stops reading after this. */
export const MAX_LOCAL_BRIDGE_BODY_BYTES = 1024;
const PREFLIGHT_MAX_AGE_SECONDS = 600;
const LOOPBACK_HOST_NAMES = ['127.0.0.1', 'localhost'];
const BEARER_PREFIX = 'Bearer ';

export interface LocalBridgeRequest {
  method: string;
  /** The request target as sent: the path and any query, like `/v1/songs`. */
  target: string;
  origin: string | null;
  host: string | null;
  authorization: string | null;
  /** Chrome's Private Network Access preflight asks with `Access-Control-Request-Private-Network: true`. */
  isPrivateNetworkPreflight: boolean;
  /** Read only for the pairing; null when there is none. */
  bodyText: string | null;
}

export type LocalBridgeResponseBody = { kind: 'json'; value: unknown } | { kind: 'empty' } | { kind: 'file'; file: LocalBridgeSongFile };

export interface LocalBridgeResponse {
  status: number;
  headers: Record<string, string>;
  body: LocalBridgeResponseBody;
}

export interface LocalBridgeRequestDependencies {
  pairing: LocalBridgePairing;
  getRecord: () => InstalledSongsRecord;
  /** null until the player connects their game. */
  getSongsFolder: () => SongsFolder | null;
  allowedOrigins: readonly string[];
  /** The port the bridge listens on, to check the Host header. */
  port: number;
}

const ERROR_TEXTS_BY_REASON: Record<LocalBridgeErrorReason, string> = {
  'origin-refused': 'DanceDance Sync answers only the StepsVault website.',
  'host-refused': 'DanceDance Sync answers only at its own address on this computer.',
  'not-paired': 'This browser isn’t paired with DanceDance Sync. In Sync, open Generators › Play on the website, choose "Pair a browser", then type the code here.',
  'no-pairing-code': 'Sync isn’t waiting for a code. In Sync, open Generators › Play on the website and choose "Pair a browser" first.',
  'wrong-code': 'That isn’t the code Sync shows. Check it and type it again.',
  'code-expired': 'That code expired. In Sync, choose "Pair a browser" again for a new one.',
  'too-many-tries': 'Too many wrong codes. In Sync, choose "Pair a browser" again for a new code, then type it carefully.',
  'bad-request': 'Sync couldn’t read this request. Reload the page and try again.',
  'not-found': 'Sync has no such song or file. Reload the page to see your songs again.',
  'method-not-allowed': 'Sync only lets the website read your songs here.',
  'no-game': 'Connect your game in DanceDance Sync first, then reload this page.',
};

const STATUSES_BY_REASON: Record<LocalBridgeErrorReason, number> = {
  'origin-refused': 403,
  'host-refused': 403,
  'not-paired': 401,
  'no-pairing-code': 409,
  'wrong-code': 403,
  'code-expired': 410,
  'too-many-tries': 429,
  'bad-request': 400,
  'not-found': 404,
  'method-not-allowed': 405,
  'no-game': 503,
};

/** Never cached (songs change and every answer depends on the token), and never sniffed into something else. */
const COMMON_HEADERS: Readonly<Record<string, string>> = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function handleLocalBridgeRequest({ request, dependencies }: { request: LocalBridgeRequest; dependencies: LocalBridgeRequestDependencies }): Promise<LocalBridgeResponse> {
  if (!isOwnHost({ host: request.host, port: dependencies.port })) return buildErrorResponse({ reason: 'host-refused', corsHeaders: {} });
  const origin = request.origin;
  if (origin === null || !dependencies.allowedOrigins.includes(origin)) return buildErrorResponse({ reason: 'origin-refused', corsHeaders: {} });
  const corsHeaders = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  if (request.method === 'OPTIONS') return buildPreflightResponse({ corsHeaders, isPrivateNetworkPreflight: request.isPrivateNetworkPreflight });
  const path = getPath(request.target);
  if (path === LOCAL_BRIDGE_PAIRING_PATH) return handlePairing({ request, dependencies, corsHeaders });
  if (!isPairedRequest({ request, dependencies })) return buildErrorResponse({ reason: 'not-paired', corsHeaders });
  if (request.method !== 'GET') return buildErrorResponse({ reason: 'method-not-allowed', corsHeaders });
  return handleSongsRequest({ path, dependencies, corsHeaders });
}

function isOwnHost({ host, port }: { host: string | null; port: number }): boolean {
  if (host === null) return false;
  const lowerHost = host.toLowerCase();
  return LOOPBACK_HOST_NAMES.some((hostName) => lowerHost === `${hostName}:${String(port)}`);
}

function buildPreflightResponse({ corsHeaders, isPrivateNetworkPreflight }: { corsHeaders: Record<string, string>; isPrivateNetworkPreflight: boolean }): LocalBridgeResponse {
  const headers: Record<string, string> = {
    ...COMMON_HEADERS,
    ...corsHeaders,
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': String(PREFLIGHT_MAX_AGE_SECONDS),
  };
  if (isPrivateNetworkPreflight) headers['Access-Control-Allow-Private-Network'] = 'true';
  return { status: 204, headers, body: { kind: 'empty' } };
}

function getPath(target: string): string {
  return target.split('?')[0] ?? target;
}

function isPairedRequest({ request, dependencies }: { request: LocalBridgeRequest; dependencies: LocalBridgeRequestDependencies }): boolean {
  const authorization = request.authorization;
  if (authorization === null || !authorization.startsWith(BEARER_PREFIX)) return false;
  return dependencies.pairing.isPairedToken(authorization.slice(BEARER_PREFIX.length).trim());
}

async function handlePairing({ request, dependencies, corsHeaders }: { request: LocalBridgeRequest; dependencies: LocalBridgeRequestDependencies; corsHeaders: Record<string, string> }): Promise<LocalBridgeResponse> {
  if (request.method !== 'POST') return buildErrorResponse({ reason: 'method-not-allowed', corsHeaders });
  const typedCode = getTypedCode(request.bodyText);
  if (typedCode === null) return buildErrorResponse({ reason: 'bad-request', corsHeaders });
  const result = await dependencies.pairing.pair(typedCode);
  if (result.kind === 'refused') return buildErrorResponse({ reason: result.reason, corsHeaders });
  return buildJsonResponse({ status: 200, corsHeaders, value: { protocol: LOCAL_BRIDGE_PROTOCOL_VERSION, token: result.token } });
}

function getTypedCode(bodyText: string | null): string | null {
  if (bodyText === null) return null;
  try {
    const body: unknown = JSON.parse(bodyText);
    if (typeof body !== 'object' || body === null) return null;
    const { code } = body as Record<string, unknown>;
    return typeof code === 'string' && code.length <= 32 ? code : null;
  } catch {
    return null;
  }
}

async function handleSongsRequest({ path, dependencies, corsHeaders }: { path: string; dependencies: LocalBridgeRequestDependencies; corsHeaders: Record<string, string> }): Promise<LocalBridgeResponse> {
  const songsFolder = dependencies.getSongsFolder();
  if (path === LOCAL_BRIDGE_SONGS_PATH) {
    if (!songsFolder) return buildErrorResponse({ reason: 'no-game', corsHeaders });
    const songs = await getLocalBridgeSongs({ record: dependencies.getRecord(), songsFolder });
    return buildJsonResponse({ status: 200, corsHeaders, value: { protocol: LOCAL_BRIDGE_PROTOCOL_VERSION, songs } });
  }
  const fileRequest = readFileRequest(path);
  if (fileRequest === 'unreadable') return buildErrorResponse({ reason: 'bad-request', corsHeaders });
  if (fileRequest === null) return buildErrorResponse({ reason: 'not-found', corsHeaders });
  if (!songsFolder) return buildErrorResponse({ reason: 'no-game', corsHeaders });
  const file = await getLocalBridgeSongFile({ record: dependencies.getRecord(), songsFolder, ...fileRequest });
  if (!file) return buildErrorResponse({ reason: 'not-found', corsHeaders });
  return { status: 200, headers: { ...COMMON_HEADERS, ...corsHeaders, 'Content-Type': file.contentType }, body: { kind: 'file', file } };
}

/** `/v1/songs/<song key, URI-encoded>/<file kind>`; null for any other path. */
function readFileRequest(path: string): { songKey: string; fileKind: LocalBridgeFileKind } | null | 'unreadable' {
  const prefix = `${LOCAL_BRIDGE_SONGS_PATH}/`;
  if (!path.startsWith(prefix)) return null;
  const parts = path.slice(prefix.length).split('/');
  const [encodedSongKey, fileKind] = parts;
  if (parts.length !== 2 || !encodedSongKey || !isFileKind(fileKind)) return null;
  try {
    return { songKey: decodeURIComponent(encodedSongKey), fileKind };
  } catch {
    return 'unreadable';
  }
}

function isFileKind(value: string | undefined): value is LocalBridgeFileKind {
  return LOCAL_BRIDGE_FILE_KINDS.some((fileKind) => fileKind === value);
}

function buildJsonResponse({ status, corsHeaders, value }: { status: number; corsHeaders: Record<string, string>; value: unknown }): LocalBridgeResponse {
  return { status, headers: { ...COMMON_HEADERS, ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }, body: { kind: 'json', value } };
}

function buildErrorResponse({ reason, corsHeaders }: { reason: LocalBridgeErrorReason; corsHeaders: Record<string, string> }): LocalBridgeResponse {
  const value: LocalBridgeErrorAnswer = { protocol: LOCAL_BRIDGE_PROTOCOL_VERSION, reason, error: ERROR_TEXTS_BY_REASON[reason] };
  return buildJsonResponse({ status: STATUSES_BY_REASON[reason], corsHeaders, value });
}

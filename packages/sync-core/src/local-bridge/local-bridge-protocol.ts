import type { GeneratorDifficulty } from '../generators/generator-protocol';

/**
 * The local bridge (protocol 1): Sync on the player's computer answers the StepsVault website, in the player's own
 * browser, at http://127.0.0.1:<port>, so the site can list and play the songs the player's own generators made
 * without them ever leaving the computer. Read only, apart from the one-time pairing.
 *
 * - `POST /v1/pairing` with `{ "code": "ABCD-EFGH" }`: the code Sync shows, typed on the site, for a long token.
 * - `GET /v1/songs` (with `Authorization: Bearer <token>`): the generated songs.
 * - `GET /v1/songs/<song key>/<file kind>` (with the token): one of the song's files.
 */

export const LOCAL_BRIDGE_PROTOCOL_VERSION = 1;
/**
 * The site tries these in order; Sync takes the first one free. They are fixed so the site can find Sync without
 * asking any server.
 */
export const LOCAL_BRIDGE_PORTS = [47821, 47822, 47823] as const;
/** Loopback only: nothing else on the network may reach the bridge. */
export const LOCAL_BRIDGE_HOST = '127.0.0.1';
export const LOCAL_BRIDGE_PAIRING_PATH = '/v1/pairing';
export const LOCAL_BRIDGE_SONGS_PATH = '/v1/songs';
/** The site's address; a development build of Sync may add the address of a site running on this computer. */
export const STEPSVAULT_SITE_ORIGIN = 'https://dancedance.studio';

/** The only files the bridge serves. A request names one of these, never a file or a path. */
export const LOCAL_BRIDGE_FILE_KINDS = ['chart', 'music', 'video', 'banner', 'background', 'jacket'] as const;
export type LocalBridgeFileKind = (typeof LOCAL_BRIDGE_FILE_KINDS)[number];

export interface LocalBridgeSongLevel {
  difficulty: GeneratorDifficulty;
  /** null for songs written before Sync kept the levels. */
  level: number | null;
}

/** One song in `GET /v1/songs`. */
export interface LocalBridgeSong {
  /** Sync's key for the song (the same as `localId` in the site's "This PC" list), used in the file addresses. */
  songKey: string;
  title: string;
  artist: string;
  generatorName: string;
  difficulties: LocalBridgeSongLevel[];
  /** Where it is in the Songs folder, so the site names it the same way whether it reads the folder or the bridge. */
  location: { groupName: string; folderName: string };
  /** The file kinds this song has. */
  fileKinds: LocalBridgeFileKind[];
  generatedAt: string;
}

export interface LocalBridgeSongList {
  protocol: typeof LOCAL_BRIDGE_PROTOCOL_VERSION;
  songs: LocalBridgeSong[];
}

export interface LocalBridgePairingAnswer {
  protocol: typeof LOCAL_BRIDGE_PROTOCOL_VERSION;
  token: string;
}

/** Every error answer: a sentence for the player and a stable reason for the site. */
export interface LocalBridgeErrorAnswer {
  protocol: typeof LOCAL_BRIDGE_PROTOCOL_VERSION;
  reason: LocalBridgeErrorReason;
  error: string;
}

export type LocalBridgeErrorReason =
  | 'origin-refused'
  | 'host-refused'
  | 'not-paired'
  | 'no-pairing-code'
  | 'wrong-code'
  | 'code-expired'
  | 'too-many-tries'
  | 'bad-request'
  | 'not-found'
  | 'method-not-allowed'
  | 'no-game';

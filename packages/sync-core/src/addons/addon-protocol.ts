import { getRetryAfterSeconds } from '../network/retry-after';
import { isAllowedPageUrl } from '../network/service-address';
import { isAllowedAddonLinkUrl } from './addon-address';
import type { AddonOptionValues } from './addon-options';
import { parseManifestIdentity, type ManifestIdentity } from './manifest-identity';

export const ADDON_PROTOCOL_VERSION = 1;
const MAX_ADDON_ERROR_LENGTH = 300;
const MAX_LINKS = 10;
const MAX_LABEL_LENGTH = 80;
const KNOWN_PROVIDES = ['audio-links', 'video-links'] as const;

export type AddonProvides = (typeof KNOWN_PROVIDES)[number];

/** GET <address>/manifest.json */
export interface AddonManifest extends ManifestIdentity {
  protocol: typeof ADDON_PROTOCOL_VERSION;
  /** Always 'audio-links'; 'video-links' too when the addon can also give the song's video. */
  provides: readonly AddonProvides[];
}

/**
 * Everything an addon ever learns about the player: the facts of the song being synced. Never the account, the
 * computer, or other songs.
 */
export interface AddonSongFacts {
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  lengthSeconds: number | null;
  youtubeId: string | null;
  youtubeUrl: string | null;
}

export type AudioLink =
  /**
   * A file Sync may download. Music is used only if its sound matches the song; a video only comes with music that
   * matched in the same answer (so both are the same upload and share its timing), and must already play in
   * StepMania (H.264 .mp4, no sound).
   */
  | { kind: 'file-url'; media: 'audio' | 'video'; url: string; label: string; fileName: string | null }
  /** A page the player can open themselves (a store, a library); Sync never follows it. */
  | { kind: 'open-page'; url: string; label: string };

export type AudioLinksAnswer =
  | { kind: 'links'; links: AudioLink[]; addonError: string | null }
  /** 202: the addon is working on it (a download, a search); ask again after this many seconds. */
  | { kind: 'working'; retryAfterSeconds: number };

export class InvalidAddonAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAddonAnswerError';
  }
}

export interface AudioLinksRequestBody {
  protocol: number;
  song: AddonSongFacts;
  /** Only for an addon that declares options, so an addon without them gets exactly the body it always got. */
  options?: AddonOptionValues;
}

/**
 * Builds the request body from exactly the allowed facts, so nothing else can slip in. The option values must already
 * be checked against the manifest (getAddonOptionValues).
 */
export function buildAudioLinksRequestBody({ song, optionValues }: { song: AddonSongFacts; optionValues: AddonOptionValues }): AudioLinksRequestBody {
  const { title, artist, album, genre, lengthSeconds, youtubeId, youtubeUrl } = song;
  const body: AudioLinksRequestBody = { protocol: ADDON_PROTOCOL_VERSION, song: { title, artist, album, genre, lengthSeconds, youtubeId, youtubeUrl } };
  return Object.keys(optionValues).length === 0 ? body : { ...body, options: { ...optionValues } };
}

export function parseAddonManifest(value: unknown): AddonManifest {
  if (!isRecord(value) || value.protocol !== ADDON_PROTOCOL_VERSION) throw new InvalidAddonAnswerError('This addon speaks a different version of the addon protocol. Ask its maker for an update.');
  const identityResult = parseManifestIdentity({ manifest: value, serviceName: 'addon' });
  if (identityResult.kind === 'invalid') throw new InvalidAddonAnswerError(identityResult.problem);
  const provides = Array.isArray(value.provides) ? (value.provides as unknown[]) : [];
  if (!provides.includes('audio-links')) throw new InvalidAddonAnswerError('This addon doesn’t provide audio links, so Sync can’t use it.');
  return { protocol: ADDON_PROTOCOL_VERSION, ...identityResult.identity, provides: KNOWN_PROVIDES.filter((provided) => provides.includes(provided)) };
}

export function parseAudioLinksAnswer({ status, body }: { status: number; body: unknown }): AudioLinksAnswer {
  if (status === 202) return { kind: 'working', retryAfterSeconds: getRetryAfterSeconds(body) };
  if (status !== 200 || !isRecord(body) || !Array.isArray(body.links)) throw new InvalidAddonAnswerError(`The addon answered with an error (${String(status)}).`);
  const links = body.links.slice(0, MAX_LINKS).flatMap((link) => parseAudioLinkOrNothing(link));
  const addonError = typeof body.error === 'string' ? body.error.slice(0, MAX_ADDON_ERROR_LENGTH) : null;
  return { kind: 'links', links, addonError };
}

/** A link that breaks the rules (http to another computer, a bad label) is dropped, not trusted. */
function parseAudioLinkOrNothing(value: unknown): AudioLink[] {
  if (!isRecord(value) || typeof value.url !== 'string' || typeof value.label !== 'string') return [];
  const label = value.label.slice(0, MAX_LABEL_LENGTH);
  if (value.kind === 'file-url' && isAllowedAddonLinkUrl(value.url)) {
    return [{ kind: 'file-url', media: value.media === 'video' ? 'video' : 'audio', url: value.url, label, fileName: typeof value.fileName === 'string' ? value.fileName.slice(0, 200) : null }];
  }
  if (value.kind === 'open-page' && isAllowedPageUrl(value.url)) return [{ kind: 'open-page', url: value.url, label }];
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

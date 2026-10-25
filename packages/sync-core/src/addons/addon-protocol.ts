import { getRetryAfterSeconds } from '../network/retry-after';
import { isAllowedPageUrl } from '../network/service-address';
import { isAllowedAddonLinkUrl } from './addon-address';
import type { AddonOptionValues } from './addon-options';
import { parseManifestIdentity, type ManifestIdentity } from './manifest-identity';
import { parseSongSourceInputs, type SongSourceInput } from './song-source-inputs';

export const ADDON_PROTOCOL_VERSION = 1;
const MAX_ADDON_ERROR_LENGTH = 300;
const MAX_LINKS = 10;
const MAX_LABEL_LENGTH = 80;
const KNOWN_PROVIDES = ['audio-links', 'video-links', 'song-source'] as const;
// video-links only adds to audio-links, so on its own it gives Sync nothing to use.
const USABLE_PROVIDES: readonly AddonProvides[] = ['audio-links', 'song-source'];

export type AddonProvides = (typeof KNOWN_PROVIDES)[number];

/** GET <address>/manifest.json */
export interface AddonManifest extends ManifestIdentity {
  protocol: typeof ADDON_PROTOCOL_VERSION;
  kind: 'addon';
  /**
   * 'audio-links' (music for a song in the vault, with 'video-links' its video too) and/or 'song-source' (a new song
   * to make with a generator). Names Sync doesn't know are dropped.
   */
  provides: readonly AddonProvides[];
  /** The fields of the addon's "Make a song" tab: 1 to 3 when it provides 'song-source', otherwise none. */
  inputs: readonly SongSourceInput[];
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
  if (value.kind === 'generator') throw new InvalidAddonAnswerError('This is a generator, not an addon. Add it under Generators instead.');
  if (value.kind !== 'addon') throw new InvalidAddonAnswerError('This address isn’t an addon (its manifest has no "kind": "addon"). Check the address with whoever made it.');
  const identityResult = parseManifestIdentity({ manifest: value, serviceName: 'addon' });
  if (identityResult.kind === 'invalid') throw new InvalidAddonAnswerError(identityResult.problem);
  const provides = getKnownProvides(value.provides);
  const inputs = provides.includes('song-source') ? parseSongSourceInputs(value.inputs) : [];
  if (provides.includes('song-source') && inputs.length === 0) throw new InvalidAddonAnswerError('This addon brings new songs but has no valid field for you to fill in. Ask its maker to fix its inputs.');
  return { protocol: ADDON_PROTOCOL_VERSION, kind: 'addon', ...identityResult.identity, provides, inputs };
}

/** True when the addon can do this, for example 'audio-links' before asking it for a song's music. */
export function isAddonProviding({ manifest, ability }: { manifest: AddonManifest; ability: AddonProvides }): boolean {
  return manifest.provides.includes(ability);
}

function getKnownProvides(value: unknown): AddonProvides[] {
  const provides = Array.isArray(value) ? (value as unknown[]) : [];
  const knownProvides = KNOWN_PROVIDES.filter((provided) => provides.includes(provided));
  if (!knownProvides.some((provided) => USABLE_PROVIDES.includes(provided))) throw new InvalidAddonAnswerError('This addon doesn’t provide anything this version of Sync can use. Check for a Sync update, or ask the addon’s maker.');
  return knownProvides;
}

export function parseAudioLinksAnswer({ status, body }: { status: number; body: unknown }): AudioLinksAnswer {
  if (status === 202) return { kind: 'working', retryAfterSeconds: getRetryAfterSeconds(body) };
  if (status !== 200 || !isRecord(body) || !Array.isArray(body.links)) throw new InvalidAddonAnswerError(`The addon answered with an error (${String(status)}).`);
  return { kind: 'links', links: parseAudioLinks(body.links), addonError: getAddonErrorOrNull(body.error) };
}

/** Links from an addon's answer: at most 10, keeping only those that follow the rules. */
export function parseAudioLinks(value: readonly unknown[]): AudioLink[] {
  return value.slice(0, MAX_LINKS).flatMap((link) => parseAudioLinkOrNothing(link));
}

/** The addon's own short sentence for the player, cut to 300 characters, or null when it sent none. */
export function getAddonErrorOrNull(value: unknown): string | null {
  const addonError = typeof value === 'string' ? value.trim() : '';
  return addonError === '' ? null : addonError.slice(0, MAX_ADDON_ERROR_LENGTH);
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

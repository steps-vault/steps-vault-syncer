import { getRetryAfterSeconds } from '../network/retry-after';
import type { AddonOptionValues } from './addon-options';
import { ADDON_PROTOCOL_VERSION, getAddonErrorOrNull, InvalidAddonAnswerError, parseAudioLinks, type AudioLink } from './addon-protocol';
import type { SongSourceInputValues } from './song-source-inputs';

const MAX_SONG_TEXT_LENGTH = 200;
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
// No real song is longer; a bigger number is a broken answer, not a song.
const MAX_SONG_LENGTH_SECONDS = 60 * 60;

/** The song a song source found. Sync shows it so the player can check it before making it. */
export interface SongSourceSong {
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  lengthSeconds: number | null;
  youtubeId: string | null;
}

export type SongSourceFileLink = Extract<AudioLink, { kind: 'file-url' }>;

export type SongSourceAnswer =
  /** The song and its files. Sync trusts them without a sound check: there is nothing to compare a new song with. */
  | { kind: 'found'; song: SongSourceSong; musicLink: SongSourceFileLink; videoLink: SongSourceFileLink | null }
  /** The addon found nothing for this input; addonError is its sentence for the player. */
  | { kind: 'not-found'; addonError: string }
  /** 202: the addon is working on it (a download, a search); ask again after this many seconds. */
  | { kind: 'working'; retryAfterSeconds: number };

export interface SongSourceRequestBody {
  protocol: number;
  inputs: SongSourceInputValues;
  /** Only for an addon that declares options, as for /audio-links. */
  options?: AddonOptionValues;
}

/** The input values must already be checked (getSongSourceInputValues), and the option values against the manifest. */
export function buildSongSourceRequestBody({ inputValues, optionValues }: { inputValues: SongSourceInputValues; optionValues: AddonOptionValues }): SongSourceRequestBody {
  const body: SongSourceRequestBody = { protocol: ADDON_PROTOCOL_VERSION, inputs: { ...inputValues } };
  return Object.keys(optionValues).length === 0 ? body : { ...body, options: { ...optionValues } };
}

/** Throws InvalidAddonAnswerError, with a sentence for the player, for an answer Sync can't use. */
export function parseSongSourceAnswer({ status, body }: { status: number; body: unknown }): SongSourceAnswer {
  if (status === 202) return { kind: 'working', retryAfterSeconds: getRetryAfterSeconds(body) };
  if (status !== 200 || !isRecord(body)) throw new InvalidAddonAnswerError(`The addon answered with an error (${String(status)}).`);
  const addonError = getAddonErrorOrNull(body.error);
  const hasSong = body.song !== undefined && body.song !== null;
  if (!hasSong && addonError !== null) return { kind: 'not-found', addonError };
  if (!hasSong) throw new InvalidAddonAnswerError('The addon answered with neither a song nor a reason.');
  const song = parseSongOrNull(body.song);
  if (!song) throw new InvalidAddonAnswerError('The addon found a song but didn’t say its title and artist.');
  const fileLinks = Array.isArray(body.links) ? parseAudioLinks(body.links).filter((link) => link.kind === 'file-url') : [];
  const musicLink = fileLinks.find((link) => link.media === 'audio');
  if (!musicLink) throw new InvalidAddonAnswerError('The addon found a song but sent no music file for it.');
  return { kind: 'found', song, musicLink, videoLink: fileLinks.find((link) => link.media === 'video') ?? null };
}

function parseSongOrNull(value: unknown): SongSourceSong | null {
  if (!isRecord(value)) return null;
  const title = getSongTextOrNull(value.title);
  const artist = getSongTextOrNull(value.artist);
  if (title === null || artist === null) return null;
  return { title, artist, album: getSongTextOrNull(value.album), genre: getSongTextOrNull(value.genre), lengthSeconds: getLengthSecondsOrNull(value.lengthSeconds), youtubeId: getYoutubeIdOrNull(value.youtubeId) };
}

function getSongTextOrNull(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? null : text.slice(0, MAX_SONG_TEXT_LENGTH);
}

function getLengthSecondsOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value > 0 && value <= MAX_SONG_LENGTH_SECONDS ? value : null;
}

function getYoutubeIdOrNull(value: unknown): string | null {
  return typeof value === 'string' && YOUTUBE_ID_PATTERN.test(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

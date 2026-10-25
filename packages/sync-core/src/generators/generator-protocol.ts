import type { AddonOptionValues } from '../addons/addon-options';
import { parseManifestIdentity, type ManifestIdentity } from '../addons/manifest-identity';
import type { HttpResponse } from '../network/http-client';
import { getRetryAfterSeconds } from '../network/retry-after';
import { GeneratorError } from './generator-error';

export const GENERATOR_PROTOCOL_VERSION = 1;
export const GENERATOR_DIFFICULTIES = ['Beginner', 'Easy', 'Medium', 'Hard', 'Challenge'] as const;
const MUSIC_TYPE_PATTERN = /^audio\/[a-z0-9][a-z0-9.+-]{0,39}$/;
const MAX_MUSIC_TYPES = 10;
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const VAULT_SONG_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_GENERATOR_ERROR_LENGTH = 300;
const MEBIBYTE = 1024 * 1024;
/** The largest music file Sync ever sends, and the default when a manifest doesn't say. */
export const MAX_GENERATOR_MUSIC_BYTES = 100 * MEBIBYTE;
export const MAX_GENERATOR_VIDEO_BYTES = 500 * MEBIBYTE;

export type GeneratorDifficulty = (typeof GENERATOR_DIFFICULTIES)[number];

/** GET <address>/manifest.json */
export interface GeneratorManifest extends ManifestIdentity {
  protocol: typeof GENERATOR_PROTOCOL_VERSION;
  kind: 'generator';
  /** The difficulties it can make, in game order; never empty. Sync asks only for these. */
  difficulties: readonly GeneratorDifficulty[];
  /** The music file types it accepts, like 'audio/ogg'; never empty. */
  musicTypes: readonly string[];
  /** True if it wants the song's video; Sync sends one only then. */
  usesVideo: boolean;
  /** The largest music file it takes; never more than MAX_GENERATOR_MUSIC_BYTES. */
  maxMusicBytes: number;
}

/**
 * Everything a generator learns about the song. Never the account, the computer, or other songs. The caller fills
 * title, artist and length even when unknown: the file's name, "Unknown artist", and the measured length.
 */
export interface GeneratorSongFacts {
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  lengthSeconds: number;
  youtubeId: string | null;
}

/** The `request` part of POST <address>/jobs. */
export interface GeneratorJobRequestBody {
  protocol: typeof GENERATOR_PROTOCOL_VERSION;
  song: GeneratorSongFacts;
  difficulties: GeneratorDifficulty[];
  options: AddonOptionValues;
}

/** A job the generator took. */
export interface GeneratorJob {
  jobId: string;
  retryAfterSeconds: number;
}

export type GeneratorStartResult =
  | { kind: 'started'; job: GeneratorJob }
  /**
   * 409: the song already exists, or is being made right now. The message is a full sentence for the player.
   * vaultSongId is set only by StepsVault's own generator: add that vault song instead.
   */
  | { kind: 'already-exists'; message: string; vaultSongId: string | null };

/** Only the facts a message or a link check needs, so these functions don't depend on how a generator is saved. */
export interface GeneratorReference {
  name: string;
  baseUrl: string;
}

export function parseGeneratorManifest(value: unknown): GeneratorManifest {
  if (!isRecord(value)) throw buildInvalidManifestError('This address didn’t send a generator manifest. Check the address with whoever made the generator.');
  if (value.kind !== 'generator') throw buildInvalidManifestError(value.provides === undefined ? 'This address isn’t a generator. Check the address with whoever made it.' : 'This is an addon, not a generator. Add it under Addons instead.');
  if (value.protocol !== GENERATOR_PROTOCOL_VERSION) throw buildInvalidManifestError('This generator speaks a different version of the generator protocol. Ask its maker for an update.');
  const identityResult = parseManifestIdentity({ manifest: value, serviceName: 'generator' });
  if (identityResult.kind === 'invalid') throw buildInvalidManifestError(identityResult.problem);
  const difficulties = parseDifficulties(value.difficulties);
  if (difficulties.length === 0) throw buildInvalidManifestError('This generator’s manifest lists no difficulty Sync knows (Beginner, Easy, Medium, Hard, Challenge). Ask its maker to fix it.');
  const musicTypes = parseMusicTypes(value.musicTypes);
  if (musicTypes.length === 0) throw buildInvalidManifestError('This generator’s manifest doesn’t say which music files it takes. Ask its maker to fix it.');
  const maxMusicBytes = parseMaxMusicBytes(value.maxMusicBytes);
  return { protocol: GENERATOR_PROTOCOL_VERSION, kind: 'generator', ...identityResult.identity, difficulties, musicTypes, usesVideo: value.usesVideo === true, maxMusicBytes };
}

/**
 * Builds the request from exactly the allowed facts, so nothing else can slip in. The difficulties and option values
 * must already be checked against the manifest.
 */
export function buildGeneratorJobRequestBody({ song, difficulties, optionValues }: { song: GeneratorSongFacts; difficulties: readonly GeneratorDifficulty[]; optionValues: AddonOptionValues }): GeneratorJobRequestBody {
  const { title, artist, album, genre, lengthSeconds, youtubeId } = song;
  return { protocol: GENERATOR_PROTOCOL_VERSION, song: { title, artist, album, genre, lengthSeconds, youtubeId }, difficulties: [...difficulties], options: { ...optionValues } };
}

export type GeneratorCancelResult =
  | { kind: 'cancelled' }
  /** Too late to stop it (StepsVault's generator still makes the song and spends the token). A sentence for the player. */
  | { kind: 'not-cancelled'; message: string }
  /** No answer Sync understands (offline, an error page): the job may or may not have stopped. */
  | { kind: 'unknown' };

/** vaultSongId is trusted only from StepsVault's own generator (isFromStepsVault), so another can't plant a vault song. */
export function parseStartJobAnswer({ answer, generator, isFromStepsVault }: { answer: HttpResponse<unknown>; generator: GeneratorReference; isFromStepsVault: boolean }): GeneratorStartResult {
  const { status, body } = answer;
  if (status === 409) return { kind: 'already-exists', message: describeExistingSong({ body, generatorName: generator.name }), vaultSongId: isFromStepsVault ? getVaultSongIdOrNull(body) : null };
  if (status !== 202) throw new GeneratorError({ reason: 'refused-job', message: describeRefusedJob({ status, body, generatorName: generator.name }) });
  const jobId = isRecord(body) ? body.jobId : undefined;
  if (typeof jobId !== 'string' || !JOB_ID_PATTERN.test(jobId)) throw new GeneratorError({ reason: 'invalid-answer', message: `${generator.name} took the song but sent no valid job id. Ask its maker to fix it.` });
  return { kind: 'started', job: { jobId, retryAfterSeconds: getRetryAfterSeconds(body) } };
}

export function parseCancelAnswer({ answer, generator }: { answer: HttpResponse<unknown>; generator: GeneratorReference }): GeneratorCancelResult {
  const { status, body } = answer;
  if (status !== 200 || !isRecord(body)) return { kind: 'unknown' };
  if (body.cancelled === true) return { kind: 'cancelled' };
  if (body.cancelled !== false) return { kind: 'unknown' };
  const generatorSentence = getGeneratorErrorSentence(body);
  return { kind: 'not-cancelled', message: generatorSentence === null ? `${generator.name} couldn’t stop this song; it is already being made.` : `${generator.name} couldn’t stop this song: ${generatorSentence}` };
}

/** The generator's own sentence, cut to a sane length; null when it sent none. */
export function getGeneratorErrorSentence(body: unknown): string | null {
  const error = isRecord(body) && typeof body.error === 'string' ? body.error.trim() : '';
  return error === '' ? null : error.slice(0, MAX_GENERATOR_ERROR_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeExistingSong({ body, generatorName }: { body: unknown; generatorName: string }): string {
  return getGeneratorErrorSentence(body) ?? `${generatorName} already has this song, or is making it right now.`;
}

function getVaultSongIdOrNull(body: unknown): string | null {
  const vaultSongId = isRecord(body) ? body.vaultSongId : undefined;
  return typeof vaultSongId === 'string' && VAULT_SONG_ID_PATTERN.test(vaultSongId) ? vaultSongId : null;
}

function describeRefusedJob({ status, body, generatorName }: { status: number; body: unknown; generatorName: string }): string {
  const generatorSentence = getGeneratorErrorSentence(body);
  if (generatorSentence !== null) return `${generatorName} couldn’t take this song: ${generatorSentence}`;
  return `${generatorName} couldn’t take this song (${status}). Try again later, or ask its maker.`;
}

/** Unknown names are dropped, like unknown addon `provides`, so a newer generator still works. */
function parseDifficulties(value: unknown): GeneratorDifficulty[] {
  if (!Array.isArray(value)) return [];
  return GENERATOR_DIFFICULTIES.filter((difficulty) => value.includes(difficulty));
}

function parseMusicTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const musicTypes = value.filter((candidate): candidate is string => typeof candidate === 'string' && MUSIC_TYPE_PATTERN.test(candidate));
  return [...new Set(musicTypes)].slice(0, MAX_MUSIC_TYPES);
}

/** Missing means the default; a bigger value is held to the cap; anything else is a broken manifest. */
function parseMaxMusicBytes(value: unknown): number {
  if (value === undefined || value === null) return MAX_GENERATOR_MUSIC_BYTES;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw buildInvalidManifestError('This generator’s manifest has an invalid maxMusicBytes. Ask its maker to fix it.');
  return Math.min(value, MAX_GENERATOR_MUSIC_BYTES);
}

function buildInvalidManifestError(message: string): GeneratorError {
  return new GeneratorError({ reason: 'invalid-manifest', message });
}

import { getAddonOptionValues } from '../addons/addon-options';
import { HttpRequestError, type HttpClient, type MultipartHttpClient, type MultipartPart } from '../network/http-client';
import { getGeneratorReference, getMusicUploadWarningOrNull, type InstalledGenerator } from './generator-client';
import { GeneratorError } from './generator-error';
import { parseJobStatusAnswer, type GeneratorFileLink, type GeneratorJobStatus } from './generator-job-status';
import { buildGeneratorJobRequestBody, MAX_GENERATOR_VIDEO_BYTES, parseCancelAnswer, parseStartJobAnswer, type GeneratorCancelResult, type GeneratorDifficulty, type GeneratorJob, type GeneratorSongFacts, type GeneratorStartResult } from './generator-protocol';
import { getSignInHeaders, isOnSignInSite, type GeneratorSignIn } from './generator-sign-in';

const VIDEO_CONTENT_TYPE = 'video/mp4';
const UPLOAD_BASE_TIMEOUT_MILLISECONDS = 60_000;
// A slow home connection (about 1 Mbit/s up) can still send the largest music file before the timeout.
const SLOWEST_UPLOAD_BYTES_PER_MILLISECOND = 100;
const STATUS_TIMEOUT_MILLISECONDS = 20_000;
const CANCEL_TIMEOUT_MILLISECONDS = 10_000;
const MAX_ANSWER_BYTES = 64 * 1024;
const MAX_POLL_FAILURES_IN_A_ROW = 3;
// No song should take this long; a generator stuck in 'working' must not keep Sync waiting forever.
const MAX_JOB_WAIT_SECONDS = 2 * 60 * 60;

/** A file Sync uploads; the platform reads it by sourceId (see MusicFile). */
export interface GeneratorUploadFile {
  sourceId: string;
  fileName: string;
  contentType: string;
  bytes: number;
}

/** What every call to a generator needs. signIn is set by the app for StepsVault's own generator only. */
export interface GeneratorCallOptions {
  httpClient: HttpClient;
  generator: InstalledGenerator;
  signIn?: GeneratorSignIn | null;
}

export interface StartGeneratorJobOptions extends Omit<GeneratorCallOptions, 'httpClient'> {
  httpClient: MultipartHttpClient;
  song: GeneratorSongFacts;
  /** Difficulties the generator doesn't make are left out. */
  difficulties: readonly GeneratorDifficulty[];
  /** Must be one of the manifest's musicTypes; convert it to Ogg Vorbis first otherwise. */
  music: GeneratorUploadFile;
  /** Sent only when the generator uses video and it is an .mp4 within the size limit. */
  video: GeneratorUploadFile | null;
}

export type GeneratorJobOutcome = { kind: 'done'; files: GeneratorFileLink[] } | { kind: 'cancelled'; cancelResult: GeneratorCancelResult };

export interface WaitForGeneratorJobOptions extends GeneratorCallOptions {
  job: GeneratorJob;
  /** Resolves after this many seconds; the platform may resolve it early when the player cancels. */
  waitSeconds: (seconds: number) => Promise<void>;
  /** Checked around every wait; true cancels the job on the generator. */
  shouldStop?: () => boolean;
  onProgress?: (status: Extract<GeneratorJobStatus, { state: 'queued' | 'working' }>) => void;
}

/**
 * Sends the song to the generator. Refuses, before uploading anything, to send music to another computer the player
 * hasn't agreed to, or music the generator can't take.
 */
export async function startGeneratorJob(options: StartGeneratorJobOptions): Promise<GeneratorStartResult> {
  const { httpClient, generator, music, signIn } = options;
  const video = getVideoToSendOrNull(options);
  const parts = buildJobParts({ ...options, video });
  const url = `${generator.baseUrl}/jobs`;
  const timeoutMilliseconds = getUploadTimeoutMilliseconds(music.bytes + (video?.bytes ?? 0));
  try {
    const answer = await httpClient.requestJsonWithFiles({ url, method: 'POST', headers: getSignInHeaders({ signIn, url }), parts, timeoutMilliseconds, maxResponseBytes: MAX_ANSWER_BYTES });
    return parseStartJobAnswer({ answer, generator: getGeneratorReference(generator), isFromStepsVault: isOnSignInSite({ signIn, url }) });
  } catch (error) {
    if (error instanceof HttpRequestError) throw buildNotAnsweringError({ generator, error });
    throw error;
  }
}

/** Asks once how the job goes. */
export async function fetchGeneratorJobStatus({ httpClient, generator, signIn, jobId }: GeneratorCallOptions & { jobId: string }): Promise<GeneratorJobStatus> {
  const url = getJobUrl({ generator, jobId });
  try {
    const answer = await httpClient.requestJson({ url, method: 'GET', headers: getSignInHeaders({ signIn, url }), timeoutMilliseconds: STATUS_TIMEOUT_MILLISECONDS, maxResponseBytes: MAX_ANSWER_BYTES });
    return parseJobStatusAnswer({ answer, generator: getGeneratorReference(generator) });
  } catch (error) {
    if (error instanceof HttpRequestError) throw buildNotAnsweringError({ generator, error });
    throw error;
  }
}

/**
 * Asks how the job goes, as often as the generator says, until it is done. A failed job throws a GeneratorError with
 * the generator's reason; a few missed answers in a row are tolerated, since a song takes minutes.
 */
export async function waitForGeneratorJob(options: WaitForGeneratorJobOptions): Promise<GeneratorJobOutcome> {
  const shouldStop = options.shouldStop ?? (() => false);
  const progress = { retryAfterSeconds: options.job.retryAfterSeconds, waitedSeconds: 0, pollFailuresInARow: 0 };
  for (;;) {
    if (shouldStop()) return cancelAndReport(options);
    if (progress.waitedSeconds >= MAX_JOB_WAIT_SECONDS) await giveUpWaiting(options);
    await options.waitSeconds(progress.retryAfterSeconds);
    progress.waitedSeconds += progress.retryAfterSeconds;
    if (shouldStop()) return cancelAndReport(options);
    const status = await fetchStatusOrNullWhenMissed({ options, progress });
    if (status?.state === 'done') return { kind: 'done', files: status.files };
    if (status?.state === 'failed') throw new GeneratorError({ reason: 'job-failed', message: status.message });
    if (status) {
      progress.retryAfterSeconds = status.retryAfterSeconds;
      options.onProgress?.(status);
    }
  }
}

/** Tells the generator the player cancelled, and whether it could stop. Never throws. */
export async function cancelGeneratorJob({ httpClient, generator, signIn, jobId }: GeneratorCallOptions & { jobId: string }): Promise<GeneratorCancelResult> {
  const url = getJobUrl({ generator, jobId });
  try {
    const answer = await httpClient.requestJson({ url, method: 'DELETE', headers: getSignInHeaders({ signIn, url }), timeoutMilliseconds: CANCEL_TIMEOUT_MILLISECONDS, maxResponseBytes: MAX_ANSWER_BYTES });
    return parseCancelAnswer({ answer, generator: getGeneratorReference(generator) });
  } catch {
    return { kind: 'unknown' };
  }
}

function buildJobParts({ generator, song, difficulties, music, video }: StartGeneratorJobOptions): MultipartPart[] {
  checkMusicCanBeSent({ generator, music });
  const requestedDifficulties = generator.manifest.difficulties.filter((difficulty) => difficulties.includes(difficulty));
  if (requestedDifficulties.length === 0) throw new GeneratorError({ reason: 'invalid-request', message: `Pick at least one difficulty ${generator.manifest.name} can make: ${generator.manifest.difficulties.join(', ')}.` });
  const optionValues = getAddonOptionValues({ options: generator.manifest.options, savedValues: generator.optionValues });
  const parts: MultipartPart[] = [
    { kind: 'json', name: 'request', value: buildGeneratorJobRequestBody({ song, difficulties: requestedDifficulties, optionValues }) },
    { kind: 'file', name: 'music', sourceId: music.sourceId, fileName: music.fileName, contentType: music.contentType },
  ];
  if (video) parts.push({ kind: 'file', name: 'video', sourceId: video.sourceId, fileName: video.fileName, contentType: VIDEO_CONTENT_TYPE });
  return parts;
}

/** The video is a nice extra for the generator, so one it can't take is left out rather than refusing the song. */
function getVideoToSendOrNull({ generator, video }: StartGeneratorJobOptions): GeneratorUploadFile | null {
  if (!video || !generator.manifest.usesVideo) return null;
  return video.contentType === VIDEO_CONTENT_TYPE && video.bytes <= MAX_GENERATOR_VIDEO_BYTES ? video : null;
}

function checkMusicCanBeSent({ generator, music }: { generator: InstalledGenerator; music: GeneratorUploadFile }): void {
  const { name, musicTypes, maxMusicBytes } = generator.manifest;
  if (getMusicUploadWarningOrNull(generator) !== null) throw new GeneratorError({ reason: 'needs-music-upload-consent', message: `Agree to send your music to ${generator.baseUrl} first, or use a generator on this computer.` });
  if (!musicTypes.includes(music.contentType)) throw new GeneratorError({ reason: 'invalid-request', message: `${name} doesn’t take ${music.contentType} files. Convert the music to one of: ${musicTypes.join(', ')}.` });
  if (music.fileName.trim() === '') throw new GeneratorError({ reason: 'invalid-request', message: 'The music file has no name, so Sync can’t send it. Pick the file again.' });
  if (music.bytes > maxMusicBytes) throw new GeneratorError({ reason: 'invalid-request', message: `This music file is bigger than ${name} takes (${describeMegabytes(maxMusicBytes)}). Pick a smaller file.` });
}

async function fetchStatusOrNullWhenMissed({ options, progress }: { options: WaitForGeneratorJobOptions; progress: { pollFailuresInARow: number } }): Promise<GeneratorJobStatus | null> {
  try {
    const status = await fetchGeneratorJobStatus({ ...options, jobId: options.job.jobId });
    progress.pollFailuresInARow = 0;
    return status;
  } catch (error) {
    const isMissedAnswer = error instanceof GeneratorError && error.reason === 'not-answering';
    if (!isMissedAnswer || progress.pollFailuresInARow + 1 >= MAX_POLL_FAILURES_IN_A_ROW) throw error;
    progress.pollFailuresInARow += 1;
    return null;
  }
}

async function cancelAndReport(options: WaitForGeneratorJobOptions): Promise<GeneratorJobOutcome> {
  return { kind: 'cancelled', cancelResult: await cancelGeneratorJob({ ...options, jobId: options.job.jobId }) };
}

async function giveUpWaiting(options: WaitForGeneratorJobOptions): Promise<never> {
  await cancelGeneratorJob({ ...options, jobId: options.job.jobId });
  throw new GeneratorError({ reason: 'took-too-long', message: `${options.generator.manifest.name} worked on this song for over 2 hours, so Sync stopped it. Try again later, or ask its maker.` });
}

function getJobUrl({ generator, jobId }: { generator: InstalledGenerator; jobId: string }): string {
  return `${generator.baseUrl}/jobs/${encodeURIComponent(jobId)}`;
}

function getUploadTimeoutMilliseconds(uploadBytes: number): number {
  return UPLOAD_BASE_TIMEOUT_MILLISECONDS + Math.ceil(uploadBytes / SLOWEST_UPLOAD_BYTES_PER_MILLISECOND);
}

function describeMegabytes(bytes: number): string {
  return `${Math.floor((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

function buildNotAnsweringError({ generator, error }: { generator: InstalledGenerator; error: HttpRequestError }): GeneratorError {
  const name = generator.manifest.name;
  if (error.failure === 'timeout') return new GeneratorError({ reason: 'not-answering', message: `${name} is taking too long to answer. Check that it is running, then try again.`, cause: error });
  if (error.failure === 'network') return new GeneratorError({ reason: 'not-answering', message: `${name} isn’t answering. Check that it is running, then try again.`, cause: error });
  // A proxy in front of the generator answers a hiccup with an HTML error page, which is worth asking again.
  if (error.failure === 'not-json') return new GeneratorError({ reason: 'not-answering', message: `${name} answered with something Sync can’t read. Check that it is running, then try again.`, cause: error });
  return new GeneratorError({ reason: 'invalid-answer', message: `${name} sent an answer Sync can’t use. Ask its maker to fix it.`, cause: error });
}

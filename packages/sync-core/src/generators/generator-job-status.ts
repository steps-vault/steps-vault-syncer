import type { HttpResponse } from '../network/http-client';
import { getRetryAfterSeconds } from '../network/retry-after';
import { isAllowedServiceLinkUrl, isOnThisComputer } from '../network/service-address';
import { GeneratorError } from './generator-error';
import { getGeneratorErrorSentence, MAX_GENERATOR_MUSIC_BYTES, MAX_GENERATOR_VIDEO_BYTES, type GeneratorReference } from './generator-protocol';

const MAX_STAGE_LENGTH = 60;
const MAX_FILE_LINKS = 20;
const MEBIBYTE = 1024 * 1024;

/** The most Sync accepts of each file a generator sends; see "What Sync checks" in generators.md. */
export const MAX_BYTES_BY_GENERATOR_FILE_KIND = {
  chart: 2 * MEBIBYTE,
  banner: 5 * MEBIBYTE,
  background: 5 * MEBIBYTE,
  jacket: 5 * MEBIBYTE,
  video: MAX_GENERATOR_VIDEO_BYTES,
  music: MAX_GENERATOR_MUSIC_BYTES,
  report: 256 * 1024,
} as const;

export type GeneratorFileKind = keyof typeof MAX_BYTES_BY_GENERATOR_FILE_KIND;

/** A file of a finished job, already checked: an allowed link, within its size limit. */
export interface GeneratorFileLink {
  kind: GeneratorFileKind;
  url: string;
  bytes: number;
}

export type GeneratorJobStatus =
  | { state: 'queued' | 'working'; progress: number | null; stage: string | null; retryAfterSeconds: number }
  /** The message is a full sentence for the player, with the generator's own reason when it gave one. */
  | { state: 'failed'; message: string }
  /** Always has exactly one chart; at most one file of each other kind. */
  | { state: 'done'; files: GeneratorFileLink[] };

export function parseJobStatusAnswer({ answer, generator }: { answer: HttpResponse<unknown>; generator: GeneratorReference }): GeneratorJobStatus {
  const { status, body } = answer;
  if (status === 404) throw new GeneratorError({ reason: 'job-lost', message: `${generator.name} no longer knows this song, maybe because it restarted. Make the song again.` });
  if (status !== 200) throw new GeneratorError({ reason: 'not-answering', message: `${generator.name} isn’t answering (${status}). Check that it is running, then make the song again.` });
  if (!isRecord(body)) throw buildInvalidAnswerError(generator);
  if (body.state === 'queued' || body.state === 'working') return parseWaitingStatus({ state: body.state, body });
  if (body.state === 'failed') return { state: 'failed', message: describeFailedJob({ body, generator }) };
  if (body.state === 'done') return { state: 'done', files: parseFileLinks({ value: body.files, generator }) };
  throw buildInvalidAnswerError(generator);
}

/** True when a file link of this generator may be downloaded: only a generator on this computer may link there. */
export function isAllowedGeneratorFileUrl({ url, generator }: { url: string; generator: GeneratorReference }): boolean {
  if (!isAllowedServiceLinkUrl(url)) return false;
  return isOnThisComputer(generator.baseUrl) || !isOnThisComputer(url);
}

export function buildFileTooLargeError({ kind, generator }: { kind: GeneratorFileKind; generator: GeneratorReference }): GeneratorError {
  const limitText = describeByteCount(MAX_BYTES_BY_GENERATOR_FILE_KIND[kind]);
  return new GeneratorError({ reason: 'file-too-large', message: `${generator.name} sent a ${kind} file bigger than ${limitText}, so Sync refused the song. Ask its maker to fix it.` });
}

export function buildMissingChartError(generator: GeneratorReference): GeneratorError {
  return new GeneratorError({ reason: 'missing-chart', message: `${generator.name} finished without sending the song file. Make the song again, or ask its maker.` });
}

function parseWaitingStatus({ state, body }: { state: 'queued' | 'working'; body: Record<string, unknown> }): GeneratorJobStatus {
  const progress = typeof body.progress === 'number' && Number.isFinite(body.progress) ? Math.min(1, Math.max(0, body.progress)) : null;
  const stage = typeof body.stage === 'string' ? body.stage.trim().slice(0, MAX_STAGE_LENGTH) : '';
  return { state, progress, stage: stage === '' ? null : stage, retryAfterSeconds: getRetryAfterSeconds(body) };
}

function describeFailedJob({ body, generator }: { body: unknown; generator: GeneratorReference }): string {
  const generatorSentence = getGeneratorErrorSentence(body);
  if (generatorSentence !== null) return `${generator.name} couldn’t make this song: ${generatorSentence}`;
  return `${generator.name} couldn’t make this song. Try again, or ask its maker why.`;
}

/** Unknown kinds are ignored, so a newer generator still works; a broken link or size refuses the whole song. */
function parseFileLinks({ value, generator }: { value: unknown; generator: GeneratorReference }): GeneratorFileLink[] {
  if (!Array.isArray(value)) throw buildInvalidAnswerError(generator);
  const files: GeneratorFileLink[] = [];
  for (const candidate of value.slice(0, MAX_FILE_LINKS)) {
    const file = parseFileLinkOrNull({ value: candidate, generator });
    if (file && !files.some((existing) => existing.kind === file.kind)) files.push(file);
  }
  if (!files.some((file) => file.kind === 'chart')) throw buildMissingChartError(generator);
  return files;
}

function parseFileLinkOrNull({ value, generator }: { value: unknown; generator: GeneratorReference }): GeneratorFileLink | null {
  if (!isRecord(value) || !isGeneratorFileKind(value.kind)) return null;
  const { kind, url, bytes } = value;
  if (typeof url !== 'string' || !isAllowedGeneratorFileUrl({ url, generator })) throw new GeneratorError({ reason: 'invalid-answer', message: `${generator.name} sent a file link Sync doesn’t allow. Ask its maker to fix it.` });
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 0) throw buildInvalidAnswerError(generator);
  if (bytes > MAX_BYTES_BY_GENERATOR_FILE_KIND[kind]) throw buildFileTooLargeError({ kind, generator });
  return { kind, url, bytes };
}

function isGeneratorFileKind(value: unknown): value is GeneratorFileKind {
  return typeof value === 'string' && Object.hasOwn(MAX_BYTES_BY_GENERATOR_FILE_KIND, value);
}

function buildInvalidAnswerError(generator: GeneratorReference): GeneratorError {
  return new GeneratorError({ reason: 'invalid-answer', message: `${generator.name} sent an answer Sync can’t use. Ask its maker to fix it.` });
}

function describeByteCount(bytes: number): string {
  return bytes >= MEBIBYTE ? `${bytes / MEBIBYTE} MB` : `${bytes / 1024} KB`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

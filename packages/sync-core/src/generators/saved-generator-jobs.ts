import { GENERATOR_DIFFICULTIES, type GeneratorDifficulty, type GeneratorSongFacts } from './generator-protocol';

// Finished jobs stay listed for a while so the player sees how they ended; older ones are dropped.
const MAX_FINISHED_JOBS = 20;
const SAVED_JOB_STATES = ['sending', 'waiting', 'needs-vault-choice', 'done', 'failed', 'cancelled'] as const;
const JOB_RESULTS = ['written', 'added-to-vault', 'kept-vault-song', 'already-in-vault'] as const;

/**
 * - sending: the music is being uploaded; a job interrupted here can't be resumed, since Sync never got a job id.
 * - waiting: the generator took it; Sync asks how it goes, and again after a restart.
 * - needs-vault-choice: the files are downloaded and the player must pick the vault song or the generated one.
 */
export type SavedGeneratorJobState = (typeof SAVED_JOB_STATES)[number];

export type GeneratorJobResult = (typeof JOB_RESULTS)[number];

/** A song being made, saved so Sync can go on asking about it after a restart. */
export interface SavedGeneratorJob {
  /** Sync's own id for the job, known before the generator gives its job id. */
  jobKey: string;
  generatorBaseUrl: string;
  generatorName: string;
  isStepsVault: boolean;
  /** The generator's job id; null while the music is being sent. */
  jobId: string | null;
  song: GeneratorSongFacts;
  difficulties: GeneratorDifficulty[];
  state: SavedGeneratorJobState;
  /** 0 to 1 when the generator says. */
  progress: number | null;
  stage: string | null;
  retryAfterSeconds: number;
  /** A sentence for the player: why it failed, or why it couldn't be cancelled. */
  message: string | null;
  vaultChoice: { vaultSongId: string; question: string } | null;
  result: GeneratorJobResult | null;
  /** Where the platform finds the player's music and video again after a restart; opaque to the core. */
  playerMusicLocation: string;
  playerVideoLocation: string | null;
  /** Where the platform keeps the files of a finished job until the song is written; opaque to the core. */
  collectedFilesLocation: string | null;
  startedAt: string;
  updatedAt: string;
}

/** True while Sync still has something to do for the job. */
export function isGeneratorJobOpen(job: Pick<SavedGeneratorJob, 'state'>): boolean {
  return job.state === 'sending' || job.state === 'waiting' || job.state === 'needs-vault-choice';
}

/** Adds the job, or replaces the saved one with the same key, and drops the oldest finished jobs. */
export function withSavedGeneratorJob({ jobs, job }: { jobs: readonly SavedGeneratorJob[]; job: SavedGeneratorJob }): SavedGeneratorJob[] {
  const updatedJobs = jobs.some((saved) => saved.jobKey === job.jobKey) ? jobs.map((saved) => (saved.jobKey === job.jobKey ? job : saved)) : [...jobs, job];
  const finishedJobKeys = updatedJobs.filter((saved) => !isGeneratorJobOpen(saved)).map((saved) => saved.jobKey);
  const droppedJobKeys = new Set(finishedJobKeys.slice(0, Math.max(0, finishedJobKeys.length - MAX_FINISHED_JOBS)));
  return updatedJobs.filter((saved) => !droppedJobKeys.has(saved.jobKey));
}

/**
 * Jobs as Sync finds them after a restart. A job that was still sending its music never got a job id, so it can't be
 * found again: it is marked failed, with a sentence telling the player to make the song again.
 */
export function getGeneratorJobsAfterRestart({ jobs, now }: { jobs: readonly SavedGeneratorJob[]; now: string }): SavedGeneratorJob[] {
  return jobs.map((job) => (job.state === 'sending' ? { ...job, state: 'failed', message: 'Sync closed while it was sending the music, so the song wasn’t made. Make it again.', updatedAt: now } : job));
}

/** Reads saved jobs, keeping only those that are complete and valid. */
export function loadSavedGeneratorJobs(value: unknown): SavedGeneratorJob[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => loadSavedGeneratorJobOrNull(candidate) ?? []);
}

function loadSavedGeneratorJobOrNull(value: unknown): SavedGeneratorJob | null {
  if (!isRecord(value)) return null;
  const song = loadSongFactsOrNull(value.song);
  const difficulties = Array.isArray(value.difficulties) ? GENERATOR_DIFFICULTIES.filter((difficulty) => (value.difficulties as unknown[]).includes(difficulty)) : [];
  const state = getOneOfOrNull({ value: value.state, values: SAVED_JOB_STATES });
  if (!song || difficulties.length === 0 || state === null) return null;
  const texts = [value.jobKey, value.generatorBaseUrl, value.generatorName, value.playerMusicLocation, value.startedAt, value.updatedAt];
  if (!texts.every((text) => typeof text === 'string') || typeof value.isStepsVault !== 'boolean') return null;
  return {
    jobKey: value.jobKey as string,
    generatorBaseUrl: value.generatorBaseUrl as string,
    generatorName: value.generatorName as string,
    isStepsVault: value.isStepsVault,
    jobId: getTextOrNull(value.jobId),
    song,
    difficulties,
    state,
    progress: typeof value.progress === 'number' ? value.progress : null,
    stage: getTextOrNull(value.stage),
    retryAfterSeconds: typeof value.retryAfterSeconds === 'number' && value.retryAfterSeconds > 0 ? value.retryAfterSeconds : 10,
    message: getTextOrNull(value.message),
    vaultChoice: loadVaultChoiceOrNull(value.vaultChoice),
    result: getOneOfOrNull({ value: value.result, values: JOB_RESULTS }),
    playerMusicLocation: value.playerMusicLocation as string,
    playerVideoLocation: getTextOrNull(value.playerVideoLocation),
    collectedFilesLocation: getTextOrNull(value.collectedFilesLocation),
    startedAt: value.startedAt as string,
    updatedAt: value.updatedAt as string,
  };
}

function loadSongFactsOrNull(value: unknown): GeneratorSongFacts | null {
  if (!isRecord(value) || typeof value.title !== 'string' || typeof value.artist !== 'string' || typeof value.lengthSeconds !== 'number') return null;
  return { title: value.title, artist: value.artist, album: getTextOrNull(value.album), genre: getTextOrNull(value.genre), lengthSeconds: value.lengthSeconds, youtubeId: getTextOrNull(value.youtubeId) };
}

function loadVaultChoiceOrNull(value: unknown): SavedGeneratorJob['vaultChoice'] {
  if (!isRecord(value) || typeof value.vaultSongId !== 'string' || typeof value.question !== 'string') return null;
  return { vaultSongId: value.vaultSongId, question: value.question };
}

function getOneOfOrNull<Value extends string>({ value, values }: { value: unknown; values: readonly Value[] }): Value | null {
  return values.find((candidate) => candidate === value) ?? null;
}

function getTextOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

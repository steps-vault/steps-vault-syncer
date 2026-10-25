/** Builds what the Generators screens show; shared by the website and the desktop app. */
import { getMusicUploadWarningOrNull, isOnThisComputer, type GeneratedSong, type GeneratorManifest, type InstalledGenerator, type SavedGeneratorJob } from '@stepsvault/sync-core';
import type { GeneratedSongView, GeneratorInstallPreview, GeneratorJobStateView, GeneratorJobView, GeneratorView, ServiceLocationView } from '../sync-ui-types';
import { buildAddonOptionViews } from './build-addon-views';

/** The id Sync gives StepsVault's own generator; a manifest id can't contain ':', so no generator can take it. */
export const STEPSVAULT_GENERATOR_ID = 'stepsvault:default';

const DONE_TEXTS_BY_RESULT: Readonly<Record<NonNullable<SavedGeneratorJob['result']>, string>> = {
  'written': 'Added to My generated songs in your game.',
  'added-to-vault': 'Added to the vault. Sync puts it in your game with your music.',
  'kept-vault-song': 'You kept the vault song, so your game didn’t change.',
  'already-in-vault': 'This song is already in the vault, so no token was spent.',
};
const MADE_AT_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const LIST_FORMAT = new Intl.ListFormat('en', { type: 'conjunction' });

export function getServiceLocationView(baseUrl: string): ServiceLocationView {
  return isOnThisComputer(baseUrl) ? { kind: 'this-computer' } : { kind: 'internet', address: baseUrl };
}

export function buildGeneratorView({ generator, startCommand = null }: { generator: InstalledGenerator; startCommand?: string | null }): GeneratorView {
  const { manifest } = generator;
  return {
    generatorId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    description: manifest.description,
    location: getServiceLocationView(generator.baseUrl),
    startCommand,
    difficulties: manifest.difficulties,
    options: buildAddonOptionViews({ options: manifest.options, values: generator.optionValues }),
    musicUploadWarning: getMusicUploadWarningOrNull(generator),
  };
}

/** The confirm step's preview: every option starts at the generator's default. */
export function buildGeneratorInstallPreview({ address, baseUrl, manifest, startCommand }: { address: string; baseUrl: string; manifest: GeneratorManifest; startCommand: string | null }): GeneratorInstallPreview {
  return {
    address,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    description: manifest.description,
    location: getServiceLocationView(baseUrl),
    difficulties: manifest.difficulties,
    options: buildAddonOptionViews({ options: manifest.options, values: {} }),
    startCommand,
  };
}

export function buildGeneratorJobView(job: SavedGeneratorJob): GeneratorJobView {
  return {
    jobKey: job.jobKey,
    songTitle: job.song.title,
    songArtist: job.song.artist,
    generatorName: job.generatorName,
    isStepsVault: job.isStepsVault,
    state: getJobStateView(job),
    stageText: getStageText(job),
    progressPercent: job.state === 'waiting' && job.progress !== null ? Math.round(job.progress * 100) : null,
    message: job.message,
    vaultChoiceQuestion: job.state === 'needs-vault-choice' ? (job.vaultChoice?.question ?? null) : null,
    doneText: job.state === 'done' && job.result !== null ? DONE_TEXTS_BY_RESULT[job.result] : null,
  };
}

/** Newest first, as the player last made them. */
export function buildGeneratedSongViews({ generatedSongs, reportSongKeys }: { generatedSongs: readonly GeneratedSong[]; reportSongKeys: ReadonlySet<string> }): GeneratedSongView[] {
  return [...generatedSongs]
    .sort((first, second) => second.generatedAt.localeCompare(first.generatedAt))
    .map((generatedSong) => ({
      songKey: generatedSong.songKey,
      title: generatedSong.song.title,
      artist: generatedSong.song.artist,
      generatorName: generatedSong.generatorName,
      difficultiesText: LIST_FORMAT.format(generatedSong.difficulties),
      folderText: ['Songs', ...generatedSong.folderPath].join('/'),
      madeAtText: formatMadeAt(generatedSong.generatedAt),
      hasReport: reportSongKeys.has(generatedSong.songKey),
    }));
}

function getJobStateView(job: SavedGeneratorJob): GeneratorJobStateView {
  if (job.state === 'sending' || job.state === 'waiting') return 'working';
  return job.state;
}

function getStageText(job: SavedGeneratorJob): string {
  if (job.state === 'sending') return 'Sending the music';
  if (job.state === 'waiting') return job.stage ?? `Waiting for ${job.generatorName}`;
  if (job.state === 'needs-vault-choice') return 'Waiting for your answer';
  if (job.state === 'done') return 'Done';
  return job.state === 'failed' ? 'Not made' : 'Cancelled';
}

function formatMadeAt(isoTime: string): string {
  const time = new Date(isoTime);
  return Number.isNaN(time.getTime()) ? '' : MADE_AT_FORMAT.format(time);
}

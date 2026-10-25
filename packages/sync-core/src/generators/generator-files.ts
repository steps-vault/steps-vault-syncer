import { HttpRequestError, type HttpClient } from '../network/http-client';
import { getGeneratorReference, type InstalledGenerator } from './generator-client';
import { GeneratorError } from './generator-error';
import { buildFileTooLargeError, buildMissingChartError, MAX_BYTES_BY_GENERATOR_FILE_KIND, type GeneratorFileKind, type GeneratorFileLink } from './generator-job-status';
import { getSignInHeaders, isOnSignInSite, type GeneratorSignIn } from './generator-sign-in';

const TEXT_DOWNLOAD_TIMEOUT_MILLISECONDS = 60_000;

/** Files the platform downloads to a temporary place, because they can be large; the core never holds them in memory. */
export type DownloadedGeneratorFileKind = Exclude<GeneratorFileKind, 'chart' | 'report'>;

export interface GeneratorFileDownload {
  url: string;
  kind: DownloadedGeneratorFileKind;
  maxBytes: number;
  generatorName: string;
  /** Send these with the request: the sign-in for StepsVault's own generator, otherwise none. */
  headers: Readonly<Record<string, string>>;
}

/**
 * Downloads one file and returns the sourceId it can be read by. Must stop and throw HttpRequestError 'too-large' as
 * soon as the file is bigger than maxBytes, whatever size the generator claimed.
 */
export type DownloadGeneratorFile = (download: GeneratorFileDownload) => Promise<string>;

export interface CollectGeneratorFilesOptions {
  httpClient: HttpClient;
  generator: InstalledGenerator;
  /** Set by the app for StepsVault's own generator only. */
  signIn?: GeneratorSignIn | null;
  files: readonly GeneratorFileLink[];
  downloadGeneratorFile: DownloadGeneratorFile;
}

/** What a finished job made, ready for the checks before a song reaches the game. */
export interface GeneratedSongFiles {
  chartText: string;
  /** "How it was made", Markdown; null when the generator sent none. */
  reportText: string | null;
  /** Kinds the generator didn't send are missing: Sync makes plain pictures and uses the player's own music. */
  sourceIdByKind: Partial<Record<DownloadedGeneratorFileKind, string>>;
}

/** Downloads every file of a finished job, each held to its size limit. Any file that fails refuses the whole song. */
export async function collectGeneratorFiles(options: CollectGeneratorFilesOptions): Promise<GeneratedSongFiles> {
  const { generator, files } = options;
  checkSignedInFilesStayOnGenerator(options);
  const chartFile = files.find((file) => file.kind === 'chart');
  if (!chartFile) throw buildMissingChartError(getGeneratorReference(generator));
  const reportFile = files.find((file) => file.kind === 'report');
  const chartText = await fetchTextFile({ options, file: chartFile });
  const reportText = reportFile ? await fetchTextFile({ options, file: reportFile }) : null;
  return { chartText, reportText, sourceIdByKind: await downloadLargeFiles(options) };
}

/** StepsVault's generator serves its files on its own address, behind the same sign-in; anywhere else is refused. */
function checkSignedInFilesStayOnGenerator({ generator, signIn, files }: CollectGeneratorFilesOptions): void {
  if (!isOnSignInSite({ signIn, url: generator.baseUrl })) return;
  if (files.every((file) => isOnSignInSite({ signIn, url: file.url }))) return;
  throw new GeneratorError({ reason: 'invalid-answer', message: `${generator.manifest.name} sent a file link outside its own address. Update Sync, or try again later.` });
}

async function downloadLargeFiles({ generator, signIn, files, downloadGeneratorFile }: CollectGeneratorFilesOptions): Promise<GeneratedSongFiles['sourceIdByKind']> {
  const sourceIdByKind: GeneratedSongFiles['sourceIdByKind'] = {};
  for (const file of files) {
    if (file.kind === 'chart' || file.kind === 'report') continue;
    const kind = file.kind;
    const download = () => downloadGeneratorFile({ url: file.url, kind, maxBytes: MAX_BYTES_BY_GENERATOR_FILE_KIND[kind], generatorName: generator.manifest.name, headers: getSignInHeaders({ signIn, url: file.url }) });
    sourceIdByKind[kind] = await withDownloadErrors({ generator, kind, download });
  }
  return sourceIdByKind;
}

async function fetchTextFile({ options, file }: { options: CollectGeneratorFilesOptions; file: GeneratorFileLink }): Promise<string> {
  const { httpClient, generator, signIn } = options;
  const request = { url: file.url, method: 'GET' as const, headers: getSignInHeaders({ signIn, url: file.url }), timeoutMilliseconds: TEXT_DOWNLOAD_TIMEOUT_MILLISECONDS, maxResponseBytes: MAX_BYTES_BY_GENERATOR_FILE_KIND[file.kind] };
  const response = await withDownloadErrors({ generator, kind: file.kind, download: () => httpClient.requestText(request) });
  if (response.status !== 200) throw buildDownloadFailedError({ generator, kind: file.kind });
  return response.body;
}

async function withDownloadErrors<Result>({ generator, kind, download }: { generator: InstalledGenerator; kind: GeneratorFileKind; download: () => Promise<Result> }): Promise<Result> {
  try {
    return await download();
  } catch (error) {
    if (!(error instanceof HttpRequestError)) throw error;
    if (error.failure === 'too-large') throw buildFileTooLargeError({ kind, generator: getGeneratorReference(generator) });
    throw buildDownloadFailedError({ generator, kind, cause: error });
  }
}

function buildDownloadFailedError({ generator, kind, cause }: { generator: InstalledGenerator; kind: GeneratorFileKind; cause?: unknown }): GeneratorError {
  return new GeneratorError({ reason: 'download-failed', message: `Sync couldn’t download the ${kind} file from ${generator.manifest.name}. Make the song again; the files may have expired.`, cause });
}

import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpRequestError, type DownloadGeneratorFile, type DownloadedGeneratorFileKind, type GeneratedSongFiles } from '@stepsvault/sync-core';
import type { MusicSourceRegistry } from './music-source-registry';
import { downloadToFile } from './node-file-download';
import { getUserAgentHeader } from './node-http-client';

// A download that sends nothing for this long is stuck; a slow one that keeps sending is fine, however big.
const DOWNLOAD_IDLE_TIMEOUT_MILLISECONDS = 60_000;
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;
const CHART_FILE_NAME = 'chart.ssc';
const REPORT_FILE_NAME = 'report.md';
/** Sync's own names for a generator's files: music is Ogg Vorbis, the video .mp4, pictures PNG (generators.md). */
const FILE_NAMES_BY_KIND: Readonly<Record<DownloadedGeneratorFileKind, string>> = { music: 'music.ogg', video: 'video.mp4', banner: 'banner.png', background: 'background.png', jacket: 'jacket.png' };
const JOB_KEY_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export interface FileDownload {
  url: string;
  filePath: string;
  maxBytes: number;
  headers?: Readonly<Record<string, string>>;
}

/**
 * The files of each song being made, one folder per job inside the app's own data folder (never the player's music
 * folders). Every file is registered as a music source, so the songs folder can copy it by sourceId.
 */
export class GeneratorJobFiles {
  private readonly jobsFolder: string;
  private readonly musicSources: MusicSourceRegistry;
  private readonly appVersion: string;

  constructor({ jobsFolder, musicSources, appVersion }: { jobsFolder: string; musicSources: MusicSourceRegistry; appVersion: string }) {
    this.jobsFolder = jobsFolder;
    this.musicSources = musicSources;
    this.appVersion = appVersion;
  }

  getJobFolder(jobKey: string): string {
    if (!JOB_KEY_PATTERN.test(jobKey)) throw new Error('A job key can only have letters, digits and -. This is a bug in Sync; please report it.');
    return path.join(this.jobsFolder, jobKey);
  }

  /** The DownloadGeneratorFile port for one job: each file lands in the job's folder under Sync's own name. */
  buildDownloadGeneratorFile(jobKey: string): DownloadGeneratorFile {
    return async ({ url, kind, maxBytes, headers }) => {
      const filePath = path.join(this.getJobFolder(jobKey), FILE_NAMES_BY_KIND[kind]);
      await this.downloadFile({ url, filePath, maxBytes, headers });
      return this.musicSources.register(filePath);
    };
  }

  /** Streams one file to disk, stopping as soon as it is bigger than maxBytes. A failed download leaves no file. */
  async downloadFile({ url, filePath, maxBytes, headers = {} }: FileDownload): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    try {
      await downloadToFile({ url, filePath, maxBytes, headers: { ...getUserAgentHeader(this.appVersion), ...headers }, idleTimeoutMilliseconds: DOWNLOAD_IDLE_TIMEOUT_MILLISECONDS });
    } catch (error) {
      await rm(filePath, { force: true });
      throw toHttpRequestError({ error, url });
    }
  }

  /** Keeps a finished job's song file and report next to its downloads, so the song can be written after a restart. */
  async saveCollectedFiles({ jobKey, files }: { jobKey: string; files: GeneratedSongFiles }): Promise<string> {
    const jobFolder = this.getJobFolder(jobKey);
    await mkdir(jobFolder, { recursive: true });
    await writeFile(path.join(jobFolder, CHART_FILE_NAME), files.chartText, 'utf8');
    if (files.reportText !== null) await writeFile(path.join(jobFolder, REPORT_FILE_NAME), files.reportText, 'utf8');
    return jobFolder;
  }

  /** Reads back what saveCollectedFiles kept, registering the downloads again (sourceIds don't survive a restart). */
  async loadCollectedFiles(jobFolder: string): Promise<GeneratedSongFiles> {
    const chartText = await readFile(path.join(jobFolder, CHART_FILE_NAME), 'utf8');
    const reportText = await readFile(path.join(jobFolder, REPORT_FILE_NAME), 'utf8').catch(() => null);
    const fileNames = new Set(await readdir(jobFolder));
    const sourceIdByKind: GeneratedSongFiles['sourceIdByKind'] = {};
    for (const [kind, fileName] of Object.entries(FILE_NAMES_BY_KIND) as [DownloadedGeneratorFileKind, string][]) {
      if (fileNames.has(fileName)) sourceIdByKind[kind] = this.musicSources.register(path.join(jobFolder, fileName));
    }
    return { chartText, reportText, sourceIdByKind };
  }

  /** A picture is read whole, so it is held to the picture size limit again here. */
  async readDownloadedPicture(sourceId: string): Promise<Uint8Array> {
    const source = this.musicSources.getSource(sourceId);
    if (!source) throw new Error('The picture from the generator is gone. Make the song again.');
    if ((await stat(source.filePath)).size > MAX_PICTURE_BYTES) return new Uint8Array(0);
    return new Uint8Array(await readFile(source.filePath));
  }

  /** Deletes everything downloaded for the job; the player's own files are never in a job folder. */
  async removeJobFiles(jobKey: string): Promise<void> {
    const jobFolder = this.getJobFolder(jobKey);
    const fileNames = await readdir(jobFolder).catch((): string[] => []);
    for (const fileName of fileNames) this.musicSources.forget(this.musicSources.register(path.join(jobFolder, fileName)));
    await rm(jobFolder, { recursive: true, force: true });
  }
}

function toHttpRequestError({ error, url }: { error: unknown; url: string }): HttpRequestError {
  if (error instanceof HttpRequestError) return error;
  return new HttpRequestError({ failure: 'network', message: `${url} could not be downloaded.`, cause: error });
}

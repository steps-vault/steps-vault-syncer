import type { BrowserWindow, IpcMain, IpcMainEvent } from 'electron';
import type { AudioFingerprint, AudioMatch, PictureMaker, PlainPictureRequest } from '@stepsvault/sync-core';
import { AUDIO_JOB_CHANNEL, AUDIO_RESULT_CHANNEL, type AudioJob, type AudioJobResult } from '../shared/bridge-types';

const JOB_TIMEOUT_MILLISECONDS = 120_000;

type JobInput = AudioJob extends infer Job ? (Job extends AudioJob ? Omit<Job, 'jobId'> : never) : never;

/**
 * Sends decoding and drawing work to the hidden audio window (Chromium's decoder and canvas) and waits for the answer.
 * Answers are accepted only from that window, and every job has a time limit, so a file that hangs the decoder can't
 * stop a sync.
 */
export class AudioBridge implements PictureMaker {
  private readonly getAudioWindow: () => BrowserWindow;
  private nextJobId = 1;
  private readonly waitingJobsById = new Map<number, { resolve: (result: AudioJobResult) => void; timer: NodeJS.Timeout }>();

  constructor({ ipcMain, getAudioWindow }: { ipcMain: IpcMain; getAudioWindow: () => BrowserWindow }) {
    this.getAudioWindow = getAudioWindow;
    ipcMain.on(AUDIO_RESULT_CHANNEL, (event, result: AudioJobResult) => {
      this.handleResult({ event, result });
    });
  }

  async checkAudio({ sourceId, bytes, fingerprint }: { sourceId: string; bytes: Uint8Array; fingerprint: AudioFingerprint }): Promise<AudioMatch> {
    const result = await this.runJob({ kind: 'check', sourceId, bytes, fingerprint: Array.from(fingerprint.envelope), fingerprintRateHertz: fingerprint.rateHertz });
    if (result.kind === 'check') return result.match;
    // A file Chromium can't decode is not the song's audio; it is reported like another edit.
    return { kind: 'different-edit', sourceId };
  }

  async convertToWav(bytes: Uint8Array): Promise<Uint8Array> {
    const result = await this.runJob({ kind: 'convert-to-wav', bytes });
    if (result.kind === 'convert-to-wav') return result.bytes;
    throw new Error(result.kind === 'failed' ? result.message : 'The music could not be converted for StepMania.');
  }

  /** The song's length in seconds, as Chromium decodes it. */
  async measureLength(bytes: Uint8Array): Promise<number> {
    const result = await this.runJob({ kind: 'measure', bytes });
    if (result.kind === 'measure') return result.lengthSeconds;
    throw new Error('Sync can’t read this music file. Pick an mp3, ogg, wav or flac file.');
  }

  /** A plain PNG with the title and artist, for a picture the generator didn't send. */
  async makePlainPicture({ width, height, title, artist }: PlainPictureRequest): Promise<Uint8Array> {
    const result = await this.runJob({ kind: 'make-picture', width, height, title, artist });
    if (result.kind === 'make-picture') return result.bytes;
    throw new Error(result.kind === 'failed' ? result.message : 'Sync couldn’t draw the song’s picture.');
  }

  private runJob(input: JobInput): Promise<AudioJobResult> {
    const jobId = this.nextJobId;
    this.nextJobId += 1;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waitingJobsById.delete(jobId);
        resolve({ jobId, kind: 'failed', message: 'Reading this music file took too long.' });
      }, JOB_TIMEOUT_MILLISECONDS);
      this.waitingJobsById.set(jobId, { resolve, timer });
      const job: AudioJob = { ...input, jobId };
      this.getAudioWindow().webContents.send(AUDIO_JOB_CHANNEL, job);
    });
  }

  private handleResult({ event, result }: { event: IpcMainEvent; result: AudioJobResult }): void {
    if (event.sender !== this.getAudioWindow().webContents) return;
    const waitingJob = this.waitingJobsById.get(result.jobId);
    if (!waitingJob) return;
    clearTimeout(waitingJob.timer);
    this.waitingJobsById.delete(result.jobId);
    waitingJob.resolve(result);
  }
}

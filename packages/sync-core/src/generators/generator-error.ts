/** Why a generator call failed, so the app can tell "try again later" from "this generator is broken". */
export type GeneratorErrorReason =
  /** Offline, slow, or answering with a server error. Worth trying again later. */
  | 'not-answering'
  | 'invalid-manifest'
  /** An answer that breaks the protocol (a bad job id, a file link Sync doesn't allow…). */
  | 'invalid-answer'
  /** The generator is not on this computer and the player hasn't agreed to send it their music yet. */
  | 'needs-music-upload-consent'
  /** What the app asked for can't be sent (no difficulty the generator makes, a music file too big…). */
  | 'invalid-request'
  | 'refused-job'
  | 'job-failed'
  /** The generator no longer knows the job, for example because it restarted. */
  | 'job-lost'
  | 'took-too-long'
  | 'missing-chart'
  | 'file-too-large'
  | 'download-failed';

/** Every generator failure. The message is a full sentence for the player, telling them what to do. */
export class GeneratorError extends Error {
  readonly reason: GeneratorErrorReason;

  constructor({ reason, message, cause }: { reason: GeneratorErrorReason; message: string; cause?: unknown }) {
    super(message, { cause });
    this.name = 'GeneratorError';
    this.reason = reason;
  }
}

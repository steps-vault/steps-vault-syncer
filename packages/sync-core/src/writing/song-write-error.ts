import { InvalidSscError } from '../ssc/player-ssc';
import { SongsFolderError, type SongsFolderFailure } from '../songs-folder/songs-folder';

export type SongWriteFailure = 'disk-full' | 'locked' | 'no-permission' | 'music-missing' | 'download-failed' | 'not-ours' | 'bad-song-file' | 'other';

/** A song that couldn't be written, with a message the player can act on; the other songs carry on. */
export class SongWriteError extends Error {
  readonly failure: SongWriteFailure;

  constructor({ failure, message, cause }: { failure: SongWriteFailure; message: string; cause?: unknown }) {
    super(message, { cause });
    this.name = 'SongWriteError';
    this.failure = failure;
  }
}

const MESSAGES_BY_FOLDER_FAILURE: Record<SongsFolderFailure, { failure: SongWriteFailure; message: string }> = {
  'disk-full': { failure: 'disk-full', message: 'Your disk is full. Free up some space, then sync again. Nothing was half-written.' },
  locked: { failure: 'locked', message: 'StepMania is using this song. Close StepMania and sync again.' },
  'no-permission': { failure: 'no-permission', message: 'Sync isn’t allowed to change your Songs folder any more. Reconnect your game, then sync again.' },
  'not-found': { failure: 'music-missing', message: 'The music file for this song is gone. Choose its audio again.' },
  'already-exists': { failure: 'other', message: 'Something new appeared where this song was going. Sync again to pick another folder.' },
  other: { failure: 'other', message: 'This song couldn’t be written to your game. Sync again; if it keeps failing, copy the details from Activity and report it.' },
};

export function toSongWriteError(error: unknown): SongWriteError {
  if (error instanceof SongWriteError) return error;
  if (error instanceof SongsFolderError) return new SongWriteError({ ...MESSAGES_BY_FOLDER_FAILURE[error.failure], cause: error });
  if (error instanceof InvalidSscError) return new SongWriteError({ failure: 'bad-song-file', message: error.message, cause: error });
  return new SongWriteError({ ...MESSAGES_BY_FOLDER_FAILURE.other, cause: error });
}

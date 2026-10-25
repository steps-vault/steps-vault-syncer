import type { ActivityEvent } from '../writing/sync-executor';

/** One step of making a song with a generator, as the Activity screen tells it. */
export type GeneratedSongActivityStep =
  | 'started'
  /** Sync restarted and went back to asking about a job it had started. */
  | 'resumed'
  /** The song is in "My generated songs" in the game. */
  | 'written'
  /** StepsVault's generator made it: it is in the vault and installs with a sync. */
  | 'added-to-vault'
  /** The same song was in the vault and the player kept that one. */
  | 'kept-vault-song'
  | 'failed'
  | 'cancelled'
  /** The player cancelled, but the generator could no longer stop. */
  | 'not-cancelled';

/**
 * A generated song has no vault song id, so it is its own kind of Activity line. Kept apart from ActivityEvent so code
 * that reads a sync's events (which always have a vaultSongId) keeps working unchanged.
 */
export interface GeneratedSongActivityEvent {
  kind: 'generated-song';
  step: GeneratedSongActivityStep;
  at: string;
  songTitle: string;
  generatorName: string;
  /** `[group, song folder]` once the song is in the game; empty before. */
  folderPath: readonly string[];
  /** A sentence for the player: why it failed, or why it couldn't be cancelled. */
  message?: string;
}

/** Every line of the Activity log: a sync's events and the steps of making songs. */
export type ActivityLogEvent = ActivityEvent | GeneratedSongActivityEvent;

export function isGeneratedSongActivityEvent(event: ActivityLogEvent): event is GeneratedSongActivityEvent {
  return event.kind === 'generated-song';
}

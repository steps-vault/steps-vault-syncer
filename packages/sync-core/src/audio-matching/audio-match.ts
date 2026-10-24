import type { AudioMatch } from '../planner/sync-plan-types';
import type { AudioDecoder, DecodedAudio } from './audio-decoder';
import { buildOnsetEnvelope, ENVELOPE_RATE_HERTZ } from './onset-envelope';
import { realignOffset } from './realign-offset';

/** A song's fingerprint as StepsVault sends it: its onset envelope, never its audio. */
export interface AudioFingerprint {
  envelope: ArrayLike<number>;
  rateHertz: number;
}

/** The engine's fingerprint of a decoded file, at the same rate as the songs' stored fingerprints. */
export function buildFingerprint(audio: DecodedAudio): AudioFingerprint {
  return { envelope: buildOnsetEnvelope(audio), rateHertz: ENVELOPE_RATE_HERTZ };
}

/**
 * Whether a decoded file is the song's edit, and how far to shift the steps. Pure and CPU-heavy (about a second for a
 * long song), so the platforms run it in a Web Worker or worker thread to keep the screen responsive.
 */
export function getAudioMatch({ sourceId, audio, storedFingerprint }: { sourceId: string; audio: DecodedAudio; storedFingerprint: AudioFingerprint }): AudioMatch {
  if (storedFingerprint.rateHertz !== ENVELOPE_RATE_HERTZ) throw new Error(`The song's fingerprint has ${storedFingerprint.rateHertz} frames a second, but Sync reads ${ENVELOPE_RATE_HERTZ}. Update Sync to the latest version.`);
  const result = realignOffset({ storedEnvelope: storedFingerprint.envelope, playerEnvelope: buildOnsetEnvelope(audio), envelopeRateHertz: ENVELOPE_RATE_HERTZ });
  if (!result.isSameEdit) return { kind: 'different-edit', sourceId };
  return { kind: 'matched', sourceId, shiftSeconds: result.shiftSeconds };
}

export async function checkAudioSource({ audioDecoder, sourceId, storedFingerprint }: { audioDecoder: AudioDecoder; sourceId: string; storedFingerprint: AudioFingerprint }): Promise<AudioMatch> {
  const audio = await audioDecoder.decodeMono({ sourceId });
  return getAudioMatch({ sourceId, audio, storedFingerprint });
}

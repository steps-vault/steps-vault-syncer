import { getAudioMatch } from '@stepsvault/sync-core';
import type { AudioJob, AudioJobResult } from '../../shared/bridge-types';
import { encodeWav } from './wav-encoder';

/** The engine's fingerprints are made from 44.1 kHz audio; decoding at the same rate keeps the comparison fair. */
const DECODE_SAMPLE_RATE = 44_100;
const MAX_WAV_CHANNELS = 2;

interface AudioHost {
  onJob(handleJob: (job: AudioJob) => void): void;
  sendResult(result: AudioJobResult): void;
}

declare global {
  interface Window {
    stepsVaultAudio: AudioHost;
  }
}

/** Chromium's own decoder (mp3, ogg, wav, flac, AAC, Opus), resampled to 44.1 kHz. */
async function decodeAudio(bytes: Uint8Array): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(1, 1, DECODE_SAMPLE_RATE);
  return context.decodeAudioData(bytes.slice().buffer);
}

/** The mean of the channels, as the engine makes its mono, so a stereo file keeps its level. */
function getMonoSamples(audio: AudioBuffer): Float32Array {
  const samples = new Float32Array(audio.length);
  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
    const channelSamples = audio.getChannelData(channel);
    for (let index = 0; index < audio.length; index += 1) samples[index] = (samples[index] ?? 0) + (channelSamples[index] ?? 0) / audio.numberOfChannels;
  }
  return samples;
}

async function runJob(job: AudioJob): Promise<AudioJobResult> {
  const audio = await decodeAudio(job.bytes);
  if (job.kind === 'convert-to-wav') {
    const channels = Array.from({ length: Math.min(MAX_WAV_CHANNELS, audio.numberOfChannels) }, (_, channel) => audio.getChannelData(channel));
    return { jobId: job.jobId, kind: 'convert-to-wav', bytes: encodeWav({ channels, sampleRate: audio.sampleRate }) };
  }
  const match = getAudioMatch({ sourceId: job.sourceId, audio: { samples: getMonoSamples(audio), sampleRate: audio.sampleRate }, storedFingerprint: { envelope: job.fingerprint, rateHertz: job.fingerprintRateHertz } });
  if (match.kind === 'not-found') return { jobId: job.jobId, kind: 'failed', message: 'The audio could not be checked.' };
  return { jobId: job.jobId, kind: 'check', match };
}

window.stepsVaultAudio.onJob((job) => {
  runJob(job).then(
    (result) => {
      window.stepsVaultAudio.sendResult(result);
    },
    (error: unknown) => {
      window.stepsVaultAudio.sendResult({ jobId: job.jobId, kind: 'failed', message: error instanceof Error ? error.message : 'This file can’t be read as audio.' });
    },
  );
});

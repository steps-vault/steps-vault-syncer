import { getAudioMatch } from '@stepsvault/sync-core';
import type { AudioJob, AudioJobResult } from '../../shared/bridge-types';
import { encodeWav } from './wav-encoder';

/** The engine's fingerprints are made from 44.1 kHz audio; decoding at the same rate keeps the comparison fair. */
const DECODE_SAMPLE_RATE = 44_100;
const MAX_WAV_CHANNELS = 2;
const PICTURE_BACKGROUND = '#161a26';
const PICTURE_TITLE_COLOUR = '#ffffff';
const PICTURE_ARTIST_COLOUR = '#aab3c9';
const PICTURE_FONT_FAMILY = 'Saira, Rubik, "Segoe UI", system-ui, sans-serif';
const PICTURE_TEXT_WIDTH_SHARE = 0.86;
const SMALLEST_FONT_SIZE = 10;

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

/** The size that fits the text in the width, from `largestSize` down; the text is cut with "…" if even the smallest is too wide. */
function fitText({ context, text, largestSize, maxWidth, fontStyle }: { context: OffscreenCanvasRenderingContext2D; text: string; largestSize: number; maxWidth: number; fontStyle: string }): string {
  for (let size = Math.round(largestSize); size >= SMALLEST_FONT_SIZE; size -= 1) {
    context.font = `${fontStyle} ${String(size)}px ${PICTURE_FONT_FAMILY}`;
    if (context.measureText(text).width <= maxWidth) return text;
  }
  let shortText = text;
  while (shortText.length > 1 && context.measureText(`${shortText}…`).width > maxWidth) shortText = shortText.slice(0, -1);
  return `${shortText}…`;
}

/** A solid background with the title and artist centred: what a song gets when its generator sent no picture. */
async function makePlainPicture({ width, height, title, artist }: Extract<AudioJob, { kind: 'make-picture' }>): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Sync couldn’t draw the song’s picture.');
  context.fillStyle = PICTURE_BACKGROUND;
  context.fillRect(0, 0, width, height);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const maxWidth = width * PICTURE_TEXT_WIDTH_SHARE;
  const titleSize = Math.min(height * 0.2, width * 0.1);
  context.fillStyle = PICTURE_TITLE_COLOUR;
  context.fillText(fitText({ context, text: title, largestSize: titleSize, maxWidth, fontStyle: 'italic 800' }), width / 2, height / 2 - titleSize * 0.35);
  context.fillStyle = PICTURE_ARTIST_COLOUR;
  context.fillText(fitText({ context, text: artist, largestSize: titleSize * 0.5, maxWidth, fontStyle: '500' }), width / 2, height / 2 + titleSize * 0.6);
  const picture = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await picture.arrayBuffer());
}

async function runJob(job: AudioJob): Promise<AudioJobResult> {
  if (job.kind === 'make-picture') return { jobId: job.jobId, kind: 'make-picture', bytes: await makePlainPicture(job) };
  const audio = await decodeAudio(job.bytes);
  if (job.kind === 'measure') return { jobId: job.jobId, kind: 'measure', lengthSeconds: audio.duration };
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

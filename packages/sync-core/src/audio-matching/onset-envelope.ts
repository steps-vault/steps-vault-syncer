import type { DecodedAudio } from './audio-decoder';
import { buildMelFilterBank, type MelBand } from './mel-filter-bank';
import { RealPowerSpectrum } from './real-power-spectrum';

export const ENGINE_SAMPLE_RATE = 44100;
/** Hop of 441 samples at 44.1 kHz: the fingerprint has 100 frames a second. */
export const ENVELOPE_RATE_HERTZ = 100;
const HOP_SAMPLES = ENGINE_SAMPLE_RATE / ENVELOPE_RATE_HERTZ;
const FRAME_SIZE = 2048;
const MEL_BAND_COUNT = 128;
const POWER_FLOOR = 1e-10;
const DYNAMIC_RANGE_DECIBELS = 80;
/**
 * librosa's onset_strength pads its flux by the lag (1) plus n_fft / (2 · hop_length) frames to undo framing. When it
 * is given a spectrogram it still uses its own defaults (n_fft 2048, hop 512), not ours, so the pad is 1 + 2 = 3
 * frames: frame t holds the flux between spectrogram frames t − 3 and t − 2, and frames 0 to 2 are 0.
 */
const FLUX_DELAY_FRAMES = 3;

/**
 * How strongly new sounds start, 100 times a second, exactly as the StepsVault engine computes a song's
 * fingerprint: a centred (zero-padded) STFT with a 2048-sample periodic Hann window, 128-band mel power, decibels
 * clipped to 80 dB below the loudest value in the song, then positive spectral flux averaged over the bands.
 */
export function buildOnsetEnvelope(audio: DecodedAudio): Float32Array {
  if (audio.sampleRate !== ENGINE_SAMPLE_RATE) throw new Error(`The audio decoder returned ${audio.sampleRate} Hz audio, but audio matching needs ${ENGINE_SAMPLE_RATE} Hz. Resample it to ${ENGINE_SAMPLE_RATE} Hz when decoding.`);
  if (audio.samples.length === 0) throw new Error('The music file has no sound in it. Choose another file for this song.');
  const frameCount = 1 + Math.floor(audio.samples.length / HOP_SAMPLES);
  const melDecibels = getMelDecibels({ samples: audio.samples, frameCount });
  clipDynamicRange(melDecibels);
  return getSpectralFlux({ melDecibels, frameCount });
}

/** Row-major: frame t's bands are at t · MEL_BAND_COUNT … Kept in float32 because the engine's values are float32. */
function getMelDecibels({ samples, frameCount }: { samples: Float32Array; frameCount: number }): Float32Array {
  const spectrum = new RealPowerSpectrum(FRAME_SIZE);
  const melBands = buildMelFilterBank({ sampleRate: ENGINE_SAMPLE_RATE, frameSize: FRAME_SIZE, bandCount: MEL_BAND_COUNT });
  const window = buildPeriodicHannWindow(FRAME_SIZE);
  const frame = new Float64Array(FRAME_SIZE);
  const powers = new Float64Array(spectrum.binCount);
  const melDecibels = new Float32Array(frameCount * MEL_BAND_COUNT);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    loadWindowedFrame({ samples, window, frame, centerSample: frameIndex * HOP_SAMPLES });
    spectrum.writePowers({ frame, powers });
    writeBandDecibels({ powers, melBands, melDecibels, offset: frameIndex * MEL_BAND_COUNT });
  }
  return melDecibels;
}

/** Samples before the start and after the end count as silence (librosa's default "constant" pad mode). */
function loadWindowedFrame({ samples, window, frame, centerSample }: { samples: Float32Array; window: Float64Array; frame: Float64Array; centerSample: number }): void {
  const firstSample = centerSample - FRAME_SIZE / 2;
  const firstInside = Math.max(0, -firstSample);
  const endInside = Math.min(FRAME_SIZE, samples.length - firstSample);
  frame.fill(0);
  for (let index = firstInside; index < endInside; index += 1) frame[index] = (samples[firstSample + index] ?? 0) * (window[index] ?? 0);
}

function writeBandDecibels({ powers, melBands, melDecibels, offset }: { powers: Float64Array; melBands: MelBand[]; melDecibels: Float32Array; offset: number }): void {
  melBands.forEach((band, bandIndex) => {
    let bandPower = 0;
    for (let index = 0; index < band.weights.length; index += 1) bandPower += (band.weights[index] ?? 0) * (powers[band.firstBin + index] ?? 0);
    melDecibels[offset + bandIndex] = 10 * Math.log10(Math.max(POWER_FLOOR, bandPower));
  });
}

/** librosa's power_to_db top_db: one ceiling for the whole song, so it needs every frame first. */
function clipDynamicRange(melDecibels: Float32Array): void {
  let loudest = -Infinity;
  for (const value of melDecibels) loudest = Math.max(loudest, value);
  const floor = loudest - DYNAMIC_RANGE_DECIBELS;
  for (let index = 0; index < melDecibels.length; index += 1) melDecibels[index] = Math.max(melDecibels[index] ?? 0, floor);
}

function getSpectralFlux({ melDecibels, frameCount }: { melDecibels: Float32Array; frameCount: number }): Float32Array {
  const envelope = new Float32Array(frameCount);
  for (let frameIndex = FLUX_DELAY_FRAMES; frameIndex < frameCount; frameIndex += 1) {
    const currentOffset = (frameIndex - FLUX_DELAY_FRAMES + 1) * MEL_BAND_COUNT;
    const previousOffset = currentOffset - MEL_BAND_COUNT;
    let risingTotal = 0;
    for (let band = 0; band < MEL_BAND_COUNT; band += 1) risingTotal += Math.max(0, (melDecibels[currentOffset + band] ?? 0) - (melDecibels[previousOffset + band] ?? 0));
    envelope[frameIndex] = risingTotal / MEL_BAND_COUNT;
  }
  return envelope;
}

function buildPeriodicHannWindow(size: number): Float64Array {
  return Float64Array.from({ length: size }, (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / size));
}

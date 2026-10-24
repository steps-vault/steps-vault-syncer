/**
 * Renders the synthetic test audio that the engine's fixtures were made from: seeded kicks, clicks, noise and tones
 * described by integer sample positions. It mirrors the fixture script's maths operation by operation, so both sides
 * get the same float32 samples (checked against the fixture's render checks before anything else).
 */

export const SYNTHETIC_SAMPLE_RATE = 44100;

export type SyntheticEvent =
  | { kind: 'kick'; startSample: number; sampleCount: number; amplitude: number }
  | { kind: 'click'; startSample: number; sampleCount: number; amplitude: number }
  | { kind: 'tone'; startSample: number; sampleCount: number; amplitude: number; frequencyHertz: number }
  | { kind: 'noise'; startSample: number; sampleCount: number; amplitude: number; seed: number; decaySamples: number };

export interface SyntheticSong {
  sampleCount: number;
  events: SyntheticEvent[];
}

export type ClipOperation =
  | { kind: 'pad-start'; sampleCount: number }
  | { kind: 'pad-end'; sampleCount: number }
  | { kind: 'take'; fromSample: number; sampleCount: number }
  | { kind: 'remove'; fromSample: number; toSample: number }
  | { kind: 'gain'; factor: number };

export function renderSyntheticSong(song: SyntheticSong): Float32Array {
  const samples = new Float64Array(song.sampleCount);
  for (const event of song.events) {
    const rendered = renderEvent(event);
    const length = Math.min(rendered.length, Math.max(0, song.sampleCount - event.startSample));
    for (let index = 0; index < length; index += 1) samples[event.startSample + index] = (samples[event.startSample + index] ?? 0) + (rendered[index] ?? 0);
  }
  return Float32Array.from(samples);
}

export function applyClipOperations({ samples, operations }: { samples: Float32Array; operations: readonly ClipOperation[] }): Float32Array {
  return operations.reduce((current, operation) => applyClipOperation({ samples: current, operation }), samples);
}

function applyClipOperation({ samples, operation }: { samples: Float32Array; operation: ClipOperation }): Float32Array {
  switch (operation.kind) {
    case 'pad-start':
      return joinSamples([new Float32Array(operation.sampleCount), samples]);
    case 'pad-end':
      return joinSamples([samples, new Float32Array(operation.sampleCount)]);
    case 'take':
      return samples.slice(operation.fromSample, operation.fromSample + operation.sampleCount);
    case 'remove':
      return joinSamples([samples.subarray(0, operation.fromSample), samples.subarray(operation.toSample)]);
    case 'gain':
      return samples.map((sample) => sample * Math.fround(operation.factor));
  }
}

function joinSamples(parts: Float32Array[]): Float32Array {
  const joined = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

function renderEvent(event: SyntheticEvent): Float64Array {
  const rendered = new Float64Array(event.sampleCount);
  const getSample = buildSampleRenderer(event);
  for (let index = 0; index < event.sampleCount; index += 1) rendered[index] = getSample(index);
  return rendered;
}

function buildSampleRenderer(event: SyntheticEvent): (index: number) => number {
  const amplitude = event.amplitude;
  switch (event.kind) {
    case 'kick':
      return (index) => {
        const seconds = index / SYNTHETIC_SAMPLE_RATE;
        const phase = 2 * Math.PI * (50 * seconds + 100 * 0.03 * (1 - Math.exp(-seconds / 0.03)));
        return amplitude * Math.sin(phase) * Math.exp(-seconds / 0.12);
      };
    case 'click':
      return (index) => amplitude * Math.sin((2 * Math.PI * 3000 * index) / SYNTHETIC_SAMPLE_RATE) * Math.exp(-index / 35);
    case 'tone':
      return (index) => amplitude * Math.min(1, index / 220) * Math.min(1, (event.sampleCount - index) / 882) * Math.sin((2 * Math.PI * event.frequencyHertz * index) / SYNTHETIC_SAMPLE_RATE);
    case 'noise': {
      const getNextRandom = buildSeededRandom(event.seed);
      if (event.decaySamples === 0) return () => amplitude * (2 * getNextRandom() - 1);
      return (index) => amplitude * (2 * getNextRandom() - 1) * Math.exp(-index / event.decaySamples);
    }
  }
}

/** mulberry32: tiny, fast and identical in Python and TypeScript. Call it once per sample, in order. */
export function buildSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

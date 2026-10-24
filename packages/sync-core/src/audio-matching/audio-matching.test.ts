import { describe, expect, it } from 'vitest';
import type { AudioDecoder, DecodedAudio } from './audio-decoder';
import { buildFingerprint, checkAudioSource, getAudioMatch } from './audio-match';
import engineFixtures from './fixtures/engine-fingerprints.json';
import { buildOnsetEnvelope, ENVELOPE_RATE_HERTZ } from './onset-envelope';
import { realignOffset } from './realign-offset';
import { applyClipOperations, buildSeededRandom, renderSyntheticSong, SYNTHETIC_SAMPLE_RATE, type ClipOperation, type SyntheticEvent, type SyntheticSong } from './testing/synthetic-audio';

const ENVELOPE_TOLERANCE = 1e-3;
const SHIFT_TOLERANCE_SECONDS = 0.001;
const RENDER_TOLERANCE = 1e-6;
const FOUR_MINUTES_SECONDS = 240;
const MATCH_TIME_BUDGET_MILLISECONDS = 3000;
/** Rendering the synthetic song and its stored fingerprint take time too, and CI machines are slower than ours. */
const RENDER_AND_MATCH_TIMEOUT_MILLISECONDS = 30_000;

interface EngineClip {
  name: string;
  song: string;
  operations: ClipOperation[];
  renderCheck: { sampleCount: number; absoluteSum: number; sampleIndexes: number[]; sampleValues: number[] };
  envelope: number[];
}

interface EngineRealignCase {
  storedClip: string;
  playerClip: string;
  shiftSeconds: number;
  correlation: number;
  isSameEdit: boolean;
}

interface EngineFixtures {
  sampleRate: number;
  envelopeRateHertz: number;
  songs: Record<string, SyntheticSong>;
  clips: EngineClip[];
  realignCases: EngineRealignCase[];
}

const fixtures = engineFixtures as EngineFixtures;
const clipsByName = new Map(fixtures.clips.map((clip) => [clip.name, clip]));
const renderedSongsByName = new Map(Object.entries(fixtures.songs).map(([name, song]) => [name, renderSyntheticSong(song)]));
const clipSamplesByName = new Map(fixtures.clips.map((clip) => [clip.name, renderClip(clip)]));
const envelopesByClipName = new Map(fixtures.clips.map((clip) => [clip.name, buildOnsetEnvelope(buildAudio(getClipSamples(clip.name)))]));

function renderClip(clip: EngineClip): Float32Array {
  const songSamples = renderedSongsByName.get(clip.song);
  if (!songSamples) throw new Error(`The fixture clip ${clip.name} uses the unknown song ${clip.song}.`);
  return applyClipOperations({ samples: songSamples, operations: clip.operations });
}

function getClip(name: string): EngineClip {
  const clip = clipsByName.get(name);
  if (!clip) throw new Error(`The fixtures have no clip called ${name}.`);
  return clip;
}

function getClipSamples(name: string): Float32Array {
  const samples = clipSamplesByName.get(name);
  if (!samples) throw new Error(`The fixtures have no clip called ${name}.`);
  return samples;
}

function getClipEnvelope(name: string): Float32Array {
  const envelope = envelopesByClipName.get(name);
  if (!envelope) throw new Error(`The fixtures have no clip called ${name}.`);
  return envelope;
}

function buildAudio(samples: Float32Array): DecodedAudio {
  return { samples, sampleRate: SYNTHETIC_SAMPLE_RATE };
}

function getLargestDifference({ actual, expected }: { actual: ArrayLike<number>; expected: ArrayLike<number> }): number {
  let largest = 0;
  for (let index = 0; index < expected.length; index += 1) largest = Math.max(largest, Math.abs((actual[index] ?? Infinity) - (expected[index] ?? 0)));
  return largest;
}

describe('synthetic fixture audio', () => {
  it.for(fixtures.clips)('renders $name exactly as the fixture script did', (clip) => {
    const samples = getClipSamples(clip.name);
    expect(samples.length).toBe(clip.renderCheck.sampleCount);
    const checkedValues = clip.renderCheck.sampleIndexes.map((sampleIndex) => samples[sampleIndex] ?? Infinity);
    expect(getLargestDifference({ actual: checkedValues, expected: clip.renderCheck.sampleValues })).toBeLessThanOrEqual(RENDER_TOLERANCE);
    const absoluteSum = samples.reduce((total, sample) => total + Math.abs(sample), 0);
    expect(absoluteSum).toBeCloseTo(clip.renderCheck.absoluteSum, 1);
  });
});

describe('buildOnsetEnvelope', () => {
  it.for(fixtures.clips)('matches the engine envelope of $name within 1e-3', async (clip, { annotate }) => {
    const expected = clip.envelope;
    const actual = getClipEnvelope(clip.name);
    expect(actual.length).toBe(expected.length);
    const largestDifference = getLargestDifference({ actual, expected });
    await annotate(`largest envelope difference ${largestDifference.toExponential(2)}`);
    expect(largestDifference).toBeLessThanOrEqual(ENVELOPE_TOLERANCE);
  });

  it('refuses audio that was not decoded at 44.1 kHz', () => {
    expect(() => buildOnsetEnvelope({ samples: new Float32Array(48000), sampleRate: 48000 })).toThrow(/Resample it to 44100 Hz/);
  });

  it('refuses a file without samples', () => {
    expect(() => buildOnsetEnvelope(buildAudio(new Float32Array(0)))).toThrow(/no sound/);
  });
});

describe('realignOffset', () => {
  it.for(fixtures.realignCases)('agrees with the engine on the engine envelopes of $playerClip', (realignCase) => {
    const result = realignOffset({ storedEnvelope: getClip(realignCase.storedClip).envelope, playerEnvelope: getClip(realignCase.playerClip).envelope, envelopeRateHertz: fixtures.envelopeRateHertz });
    expect(Math.abs(result.shiftSeconds - realignCase.shiftSeconds)).toBeLessThanOrEqual(SHIFT_TOLERANCE_SECONDS);
    expect(result.correlation).toBeCloseTo(realignCase.correlation, 5);
    expect(result.isSameEdit).toBe(realignCase.isSameEdit);
  });

  it.for(fixtures.realignCases)('agrees with the engine on our own envelopes of $playerClip', async (realignCase, { annotate }) => {
    const result = realignOffset({ storedEnvelope: getClip(realignCase.storedClip).envelope, playerEnvelope: getClipEnvelope(realignCase.playerClip), envelopeRateHertz: ENVELOPE_RATE_HERTZ });
    const shiftDifferenceSeconds = Math.abs(result.shiftSeconds - realignCase.shiftSeconds);
    await annotate(`shift difference ${shiftDifferenceSeconds.toExponential(2)} s`);
    expect(shiftDifferenceSeconds).toBeLessThanOrEqual(SHIFT_TOLERANCE_SECONDS);
    expect(result.correlation).toBeCloseTo(realignCase.correlation, 3);
    expect(result.isSameEdit).toBe(realignCase.isSameEdit);
  });

  it('refuses an empty envelope', () => {
    expect(() => realignOffset({ storedEnvelope: [], playerEnvelope: [1, 2], envelopeRateHertz: ENVELOPE_RATE_HERTZ })).toThrow(/empty/);
  });
});

describe('getAudioMatch', () => {
  const storedFingerprint = { envelope: getClip('original').envelope, rateHertz: ENVELOPE_RATE_HERTZ };

  it('matches the same edit and says how much later its music starts', () => {
    const match = getAudioMatch({ sourceId: 'music/song.ogg', audio: buildAudio(getClipSamples('later-start')), storedFingerprint });
    expect(match).toEqual({ kind: 'matched', sourceId: 'music/song.ogg', shiftSeconds: expect.closeTo(1.2311, 3) as number });
  });

  it('calls a file with a section cut out a different edit', () => {
    expect(getAudioMatch({ sourceId: 'cut.ogg', audio: buildAudio(getClipSamples('cut-middle')), storedFingerprint })).toEqual({ kind: 'different-edit', sourceId: 'cut.ogg' });
  });

  it('calls another song a different edit', () => {
    expect(getAudioMatch({ sourceId: 'other.ogg', audio: buildAudio(getClipSamples('different-song')), storedFingerprint })).toEqual({ kind: 'different-edit', sourceId: 'other.ogg' });
  });

  it('refuses a fingerprint at another rate', () => {
    expect(() => getAudioMatch({ sourceId: 'a.ogg', audio: buildAudio(getClipSamples('original')), storedFingerprint: { ...storedFingerprint, rateHertz: 200 } })).toThrow(/Update Sync/);
  });
});

describe('checkAudioSource', () => {
  it('decodes the file through the decoder port, then matches it', async () => {
    const decodedSourceIds: string[] = [];
    const audioDecoder: AudioDecoder = {
      decodeMono: ({ sourceId }) => {
        decodedSourceIds.push(sourceId);
        return Promise.resolve(buildAudio(getClipSamples('cut-start')));
      },
    };
    const match = await checkAudioSource({ audioDecoder, sourceId: 'cut-start.mp3', storedFingerprint: buildFingerprint(buildAudio(getClipSamples('original'))) });
    expect(decodedSourceIds).toEqual(['cut-start.mp3']);
    expect(match).toEqual({ kind: 'matched', sourceId: 'cut-start.mp3', shiftSeconds: expect.closeTo(-0.42, 3) as number });
  });
});

describe('a four-minute song', () => {
  it(`is enveloped and matched in under ${MATCH_TIME_BUDGET_MILLISECONDS / 1000} s`, { timeout: RENDER_AND_MATCH_TIMEOUT_MILLISECONDS }, async ({ annotate }) => {
    const songSamples = renderSyntheticSong(buildLongSong(FOUR_MINUTES_SECONDS));
    const storedFingerprint = buildFingerprint(buildAudio(songSamples));
    const playerSamples = applyClipOperations({ samples: songSamples, operations: [{ kind: 'pad-start', sampleCount: SYNTHETIC_SAMPLE_RATE }] });
    const startedAt = Date.now();
    const match = getAudioMatch({ sourceId: 'long.ogg', audio: buildAudio(playerSamples), storedFingerprint });
    const elapsedMilliseconds = Date.now() - startedAt;
    await annotate(`A ${FOUR_MINUTES_SECONDS + 1} s file was enveloped and matched in ${elapsedMilliseconds} ms.`);
    expect(match).toEqual({ kind: 'matched', sourceId: 'long.ogg', shiftSeconds: expect.closeTo(1, 2) as number });
    expect(elapsedMilliseconds).toBeLessThan(MATCH_TIME_BUDGET_MILLISECONDS);
  });
});

/** Kicks and noise bursts at uneven, seeded times, so no two shifts look alike. */
function buildLongSong(seconds: number): SyntheticSong {
  const getNextRandom = buildSeededRandom(7);
  const sampleCount = seconds * SYNTHETIC_SAMPLE_RATE;
  const events: SyntheticEvent[] = [];
  for (let position = 0; position < sampleCount; position += Math.floor((0.3 + 0.4 * getNextRandom()) * SYNTHETIC_SAMPLE_RATE)) {
    events.push({ kind: 'kick', startSample: position, sampleCount: 15000, amplitude: 0.3 + 0.4 * getNextRandom() });
    events.push({ kind: 'noise', startSample: position + 6000, sampleCount: 4000, amplitude: 0.2, seed: events.length, decaySamples: 1000 });
  }
  return { sampleCount, events };
}

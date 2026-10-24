const SAME_EDIT_MINIMUM_CORRELATION = 0.6;
const MAXIMUM_LENGTH_DIFFERENCE_SECONDS = 3;
/** Copies of one edit differ by leading silence or a cut-off start, not by more than a few seconds. */
const MAXIMUM_SHIFT_SECONDS = 15;
const MINIMUM_OVERLAP_SECONDS = 5;
const STANDARD_DEVIATION_GUARD = 1e-9;

export interface RealignResult {
  /** How much later the music starts in the player's file than in StepsVault's audio (negative: earlier). */
  shiftSeconds: number;
  /** Pearson correlation of the overlapping parts of the two envelopes at the best shift. */
  correlation: number;
  isSameEdit: boolean;
}

interface CorrelationCurve {
  storedLength: number;
  playerLength: number;
  getValueAtLag: (lag: number) => number;
}

/**
 * Lines the player's file up with the song's fingerprint, exactly as the engine's realign_offset: standardise both
 * envelopes, find the best lag within ±15 s, refine it below one frame with a parabola, then call it the same edit
 * when the overlapping parts correlate well and the lengths nearly agree.
 */
export function realignOffset({ storedEnvelope, playerEnvelope, envelopeRateHertz }: { storedEnvelope: ArrayLike<number>; playerEnvelope: ArrayLike<number>; envelopeRateHertz: number }): RealignResult {
  if (storedEnvelope.length === 0 || playerEnvelope.length === 0) throw new Error('An onset envelope is empty, so the music cannot be lined up. Check that the song and the file both have sound.');
  const stored = standardize(storedEnvelope);
  const player = standardize(playerEnvelope);
  const curve = buildCorrelationCurve({ stored, player });
  const bestLag = getBestLag({ curve, maximumLag: Math.floor(MAXIMUM_SHIFT_SECONDS * envelopeRateHertz) });
  const correlation = getOverlapCorrelation({ stored, player, lag: bestLag, envelopeRateHertz });
  const lengthDifferenceSeconds = Math.abs(stored.length - player.length) / envelopeRateHertz;
  return {
    shiftSeconds: (bestLag + getPeakRefinement({ curve, lag: bestLag })) / envelopeRateHertz,
    correlation,
    isSameEdit: correlation >= SAME_EDIT_MINIMUM_CORRELATION && lengthDifferenceSeconds <= MAXIMUM_LENGTH_DIFFERENCE_SECONDS,
  };
}

function standardize(envelope: ArrayLike<number>): Float64Array {
  const values = Float64Array.from(envelope);
  const mean = getMean(values);
  const deviation = Math.sqrt(getMean(values.map((value) => (value - mean) ** 2)));
  return values.map((value) => (value - mean) / (deviation + STANDARD_DEVIATION_GUARD));
}

/** The full cross-correlation at one lag: Σ player[n + lag] · stored[n]. Positive lags mean the player's music starts later. */
function buildCorrelationCurve({ stored, player }: { stored: Float64Array; player: Float64Array }): CorrelationCurve {
  const getValueAtLag = (lag: number): number => {
    const firstStored = Math.max(0, -lag);
    const endStored = Math.min(stored.length, player.length - lag);
    let total = 0;
    for (let index = firstStored; index < endStored; index += 1) total += (player[index + lag] ?? 0) * (stored[index] ?? 0);
    return total;
  };
  return { storedLength: stored.length, playerLength: player.length, getValueAtLag };
}

/** The first highest lag, as numpy's argmax picks it. */
function getBestLag({ curve, maximumLag }: { curve: CorrelationCurve; maximumLag: number }): number {
  const lowestLag = Math.max(-(curve.storedLength - 1), -maximumLag);
  const highestLag = Math.min(curve.playerLength - 1, maximumLag);
  let bestLag = lowestLag;
  let bestValue = -Infinity;
  for (let lag = lowestLag; lag <= highestLag; lag += 1) {
    const value = curve.getValueAtLag(lag);
    if (value <= bestValue) continue;
    bestValue = value;
    bestLag = lag;
  }
  return bestLag;
}

/** Sub-frame peak position from a parabola through the peak and its neighbours (−0.5 … 0.5 frames). */
function getPeakRefinement({ curve, lag }: { curve: CorrelationCurve; lag: number }): number {
  const isCurveEdge = lag === -(curve.storedLength - 1) || lag === curve.playerLength - 1;
  if (isCurveEdge) return 0;
  const [left, middle, right] = [curve.getValueAtLag(lag - 1), curve.getValueAtLag(lag), curve.getValueAtLag(lag + 1)];
  const curvature = left - 2 * middle + right;
  if (curvature === 0) return 0;
  return Math.min(0.5, Math.max(-0.5, (0.5 * (left - right)) / curvature));
}

/** Pearson correlation of the parts that overlap when the player's envelope is shifted back by `lag` frames. */
function getOverlapCorrelation({ stored, player, lag, envelopeRateHertz }: { stored: Float64Array; player: Float64Array; lag: number; envelopeRateHertz: number }): number {
  const storedPart = stored.subarray(Math.max(0, -lag));
  const playerPart = player.subarray(Math.max(0, lag));
  const length = Math.min(storedPart.length, playerPart.length);
  if (length < MINIMUM_OVERLAP_SECONDS * envelopeRateHertz) return 0;
  return getPearsonCorrelation({ first: storedPart.subarray(0, length), second: playerPart.subarray(0, length) });
}

/** A flat part has no correlation; numpy would answer NaN, which is never the same edit either. */
function getPearsonCorrelation({ first, second }: { first: Float64Array; second: Float64Array }): number {
  const firstMean = getMean(first);
  const secondMean = getMean(second);
  let covariance = 0;
  let firstVariance = 0;
  let secondVariance = 0;
  for (let index = 0; index < first.length; index += 1) {
    const firstDeviation = (first[index] ?? 0) - firstMean;
    const secondDeviation = (second[index] ?? 0) - secondMean;
    covariance += firstDeviation * secondDeviation;
    firstVariance += firstDeviation * firstDeviation;
    secondVariance += secondDeviation * secondDeviation;
  }
  if (firstVariance === 0 || secondVariance === 0) return 0;
  return Math.min(1, Math.max(-1, covariance / Math.sqrt(firstVariance * secondVariance)));
}

function getMean(values: Float64Array): number {
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

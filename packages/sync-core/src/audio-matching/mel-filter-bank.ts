const LINEAR_HERTZ_PER_MEL = 200 / 3;
const LOG_REGION_START_HERTZ = 1000;
const LOG_REGION_START_MEL = LOG_REGION_START_HERTZ / LINEAR_HERTZ_PER_MEL;
const LOG_REGION_MEL_STEP = Math.log(6.4) / 27;

/** One triangular band: its weights for the FFT bins `firstBin`, `firstBin + 1`, … (all other bins weigh 0). */
export interface MelBand {
  firstBin: number;
  weights: Float64Array;
}

/**
 * librosa's default mel filter bank (Slaney's mel scale, "slaney" area normalisation, 0 Hz to half the sample rate),
 * kept sparse because each band touches only a few bins. Weights are rounded to float32 as librosa stores them.
 */
export function buildMelFilterBank({ sampleRate, frameSize, bandCount }: { sampleRate: number; frameSize: number; bandCount: number }): MelBand[] {
  const binFrequencies = getBinFrequencies({ sampleRate, frameSize });
  const edgeFrequencies = getMelEdgeFrequencies({ bandCount, maximumHertz: sampleRate / 2 });
  return Array.from({ length: bandCount }, (_, band) => buildMelBand({ binFrequencies, edgeFrequencies, band }));
}

function buildMelBand({ binFrequencies, edgeFrequencies, band }: { binFrequencies: Float64Array; edgeFrequencies: Float64Array; band: number }): MelBand {
  const [lowHertz, centerHertz, highHertz] = [edgeFrequencies[band] ?? 0, edgeFrequencies[band + 1] ?? 0, edgeFrequencies[band + 2] ?? 0];
  const areaNormalisation = 2 / (highHertz - lowHertz);
  const allWeights = binFrequencies.map((frequency) => {
    const rising = -(lowHertz - frequency) / (centerHertz - lowHertz);
    const falling = (highHertz - frequency) / (highHertz - centerHertz);
    return Math.fround(Math.fround(Math.max(0, Math.min(rising, falling))) * areaNormalisation);
  });
  const firstBin = allWeights.findIndex((weight) => weight > 0);
  if (firstBin === -1) return { firstBin: 0, weights: new Float64Array(0) };
  const lastBin = allWeights.findLastIndex((weight) => weight > 0);
  return { firstBin, weights: allWeights.slice(firstBin, lastBin + 1) };
}

function getBinFrequencies({ sampleRate, frameSize }: { sampleRate: number; frameSize: number }): Float64Array {
  const hertzPerBin = 1 / (frameSize * (1 / sampleRate));
  return Float64Array.from({ length: frameSize / 2 + 1 }, (_, bin) => bin * hertzPerBin);
}

/** bandCount + 2 frequencies evenly spaced in mels: each band rises from one edge, peaks at the next, ends at the one after. */
function getMelEdgeFrequencies({ bandCount, maximumHertz }: { bandCount: number; maximumHertz: number }): Float64Array {
  const edgeCount = bandCount + 2;
  const maximumMel = getMel(maximumHertz);
  const melStep = maximumMel / (edgeCount - 1);
  return Float64Array.from({ length: edgeCount }, (_, edge) => getHertz(edge === edgeCount - 1 ? maximumMel : edge * melStep));
}

function getMel(hertz: number): number {
  if (hertz < LOG_REGION_START_HERTZ) return hertz / LINEAR_HERTZ_PER_MEL;
  return LOG_REGION_START_MEL + Math.log(hertz / LOG_REGION_START_HERTZ) / LOG_REGION_MEL_STEP;
}

function getHertz(mel: number): number {
  if (mel < LOG_REGION_START_MEL) return LINEAR_HERTZ_PER_MEL * mel;
  return LOG_REGION_START_HERTZ * Math.exp(LOG_REGION_MEL_STEP * (mel - LOG_REGION_START_MEL));
}

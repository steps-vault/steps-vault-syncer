/**
 * The power spectrum |X[k]|² (k = 0 … size / 2) of real frames of one power-of-two size. A real frame of size N is
 * packed into a complex one of size N / 2 (even samples real, odd samples imaginary), transformed with an iterative
 * radix-2 FFT and split back, which halves the work. Tables and buffers are reused across frames.
 */
export class RealPowerSpectrum {
  readonly frameSize: number;
  readonly binCount: number;
  private readonly halfSize: number;
  private readonly bitReversedIndexes: Uint32Array;
  private readonly butterflyCosines: Float64Array;
  private readonly butterflySines: Float64Array;
  private readonly splitCosines: Float64Array;
  private readonly splitSines: Float64Array;
  private readonly real: Float64Array;
  private readonly imaginary: Float64Array;

  constructor(frameSize: number) {
    if (!Number.isInteger(Math.log2(frameSize)) || frameSize < 4) throw new Error(`The frame size must be a power of two of at least 4, not ${frameSize}.`);
    this.frameSize = frameSize;
    this.halfSize = frameSize / 2;
    this.binCount = this.halfSize + 1;
    this.bitReversedIndexes = buildBitReversedIndexes(this.halfSize);
    this.butterflyCosines = buildCosines({ count: this.halfSize / 2, period: this.halfSize });
    this.butterflySines = buildSines({ count: this.halfSize / 2, period: this.halfSize });
    this.splitCosines = buildCosines({ count: this.binCount, period: frameSize });
    this.splitSines = buildSines({ count: this.binCount, period: frameSize });
    this.real = new Float64Array(this.halfSize);
    this.imaginary = new Float64Array(this.halfSize);
  }

  /** `frame` has `frameSize` samples; `powers` receives `binCount` values. */
  writePowers({ frame, powers }: { frame: Float64Array; powers: Float64Array }): void {
    this.loadBitReversedPairs(frame);
    this.runButterflies();
    this.writeSplitPowers(powers);
  }

  private loadBitReversedPairs(frame: Float64Array): void {
    for (let index = 0; index < this.halfSize; index += 1) {
      const target = this.bitReversedIndexes[index] ?? 0;
      this.real[target] = frame[2 * index] ?? 0;
      this.imaginary[target] = frame[2 * index + 1] ?? 0;
    }
  }

  private runButterflies(): void {
    const { real, imaginary, halfSize } = this;
    for (let blockSize = 2; blockSize <= halfSize; blockSize *= 2) {
      const halfBlock = blockSize / 2;
      const tableStep = halfSize / blockSize;
      for (let blockStart = 0; blockStart < halfSize; blockStart += blockSize) {
        for (let offset = 0; offset < halfBlock; offset += 1) {
          const cosine = this.butterflyCosines[offset * tableStep] ?? 0;
          const sine = this.butterflySines[offset * tableStep] ?? 0;
          const top = blockStart + offset;
          const bottom = top + halfBlock;
          const bottomReal = real[bottom] ?? 0;
          const bottomImaginary = imaginary[bottom] ?? 0;
          const turnedReal = cosine * bottomReal + sine * bottomImaginary;
          const turnedImaginary = cosine * bottomImaginary - sine * bottomReal;
          const topReal = real[top] ?? 0;
          const topImaginary = imaginary[top] ?? 0;
          real[bottom] = topReal - turnedReal;
          imaginary[bottom] = topImaginary - turnedImaginary;
          real[top] = topReal + turnedReal;
          imaginary[top] = topImaginary + turnedImaginary;
        }
      }
    }
  }

  /** X[k] = E[k] + e^(-2πik/N)·O[k], where E and O are the spectra of the even and odd samples. */
  private writeSplitPowers(powers: Float64Array): void {
    const { real, imaginary, halfSize } = this;
    for (let bin = 0; bin < this.binCount; bin += 1) {
      const index = bin % halfSize;
      const mirror = (halfSize - bin) % halfSize;
      const indexReal = real[index] ?? 0;
      const indexImaginary = imaginary[index] ?? 0;
      const mirrorReal = real[mirror] ?? 0;
      const mirrorImaginary = imaginary[mirror] ?? 0;
      const evenReal = (indexReal + mirrorReal) / 2;
      const evenImaginary = (indexImaginary - mirrorImaginary) / 2;
      const oddReal = (indexImaginary + mirrorImaginary) / 2;
      const oddImaginary = (mirrorReal - indexReal) / 2;
      const cosine = this.splitCosines[bin] ?? 0;
      const sine = this.splitSines[bin] ?? 0;
      const binReal = evenReal + cosine * oddReal + sine * oddImaginary;
      const binImaginary = evenImaginary + cosine * oddImaginary - sine * oddReal;
      powers[bin] = binReal * binReal + binImaginary * binImaginary;
    }
  }
}

function buildBitReversedIndexes(size: number): Uint32Array {
  const bitCount = Math.log2(size);
  const indexes = new Uint32Array(size);
  for (let index = 0; index < size; index += 1) {
    let reversed = 0;
    for (let bit = 0; bit < bitCount; bit += 1) reversed |= ((index >> bit) & 1) << (bitCount - 1 - bit);
    indexes[index] = reversed;
  }
  return indexes;
}

function buildCosines({ count, period }: { count: number; period: number }): Float64Array {
  return Float64Array.from({ length: count }, (_, index) => Math.cos((2 * Math.PI * index) / period));
}

function buildSines({ count, period }: { count: number; period: number }): Float64Array {
  return Float64Array.from({ length: count }, (_, index) => Math.sin((2 * Math.PI * index) / period));
}

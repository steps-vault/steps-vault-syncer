const WAV_HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;
const MAX_SAMPLE_VALUE = 0x7fff;

/** 16-bit PCM WAV, which StepMania plays; used for music in formats it can't (m4a, flac, opus…). */
export function encodeWav({ channels, sampleRate }: { channels: readonly Float32Array[]; sampleRate: number }): Uint8Array {
  const frameCount = channels[0]?.length ?? 0;
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const dataSize = frameCount * channels.length * bytesPerSample;
  const view = new DataView(new ArrayBuffer(WAV_HEADER_BYTES + dataSize));
  writeHeader({ view, channelCount: channels.length, sampleRate, dataSize });
  let offset = WAV_HEADER_BYTES;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame] ?? 0));
      view.setInt16(offset, Math.round(sample * MAX_SAMPLE_VALUE), true);
      offset += bytesPerSample;
    }
  }
  return new Uint8Array(view.buffer);
}

function writeHeader({ view, channelCount, sampleRate, dataSize }: { view: DataView; channelCount: number; sampleRate: number; dataSize: number }): void {
  const blockAlign = channelCount * (BITS_PER_SAMPLE / 8);
  writeText({ view, offset: 0, text: 'RIFF' });
  view.setUint32(4, 36 + dataSize, true);
  writeText({ view, offset: 8, text: 'WAVE' });
  writeText({ view, offset: 12, text: 'fmt ' });
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeText({ view, offset: 36, text: 'data' });
  view.setUint32(40, dataSize, true);
}

function writeText({ view, offset, text }: { view: DataView; offset: number; text: string }): void {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

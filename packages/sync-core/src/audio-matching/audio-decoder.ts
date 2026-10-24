/** Mono samples in [-1, 1]: the mean of the file's channels, so a stereo file keeps its level. */
export interface DecodedAudio {
  samples: Float32Array;
  sampleRate: number;
}

/**
 * Turns one of the player's music files into mono samples at 44.1 kHz. The website and the desktop app both use
 * Chromium's own decoder (an OfflineAudioContext at 44.1 kHz), so both hear a file the same way.
 */
export interface AudioDecoder {
  /** `sourceId` names the file the way the audio sources (task 7) do. */
  decodeMono(options: { sourceId: string }): Promise<DecodedAudio>;
}

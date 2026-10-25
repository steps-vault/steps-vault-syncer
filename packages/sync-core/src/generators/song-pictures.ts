/** The sizes generators.md asks for; a plain picture Sync makes has exactly this size. */
export const PICTURE_SIZES_BY_KIND = {
  banner: { width: 418, height: 164 },
  background: { width: 854, height: 480 },
  jacket: { width: 512, height: 512 },
} as const;

export const SONG_PICTURE_KINDS = ['banner', 'background', 'jacket'] as const;

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export type SongPictureKind = (typeof SONG_PICTURE_KINDS)[number];

/** Reads a picture a generator sent, which the platform downloaded as `sourceId` (at most 5 MB, see generator-files). */
export type ReadDownloadedPicture = (sourceId: string) => Promise<Uint8Array>;

export interface PlainPictureRequest {
  kind: SongPictureKind;
  width: number;
  height: number;
  title: string;
  artist: string;
}

/**
 * Draws a plain PNG picture from the song's title, for a picture the generator didn't send. The core can't draw (no
 * fonts, no canvas), so the platform does it: the desktop app can use Electron's nativeImage or a canvas.
 */
export interface PictureMaker {
  makePlainPicture(request: PlainPictureRequest): Promise<Uint8Array>;
}

/** Only real PNG files go into the game under a `.png` name; anything else counts as no picture at all. */
export function isPngPicture(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

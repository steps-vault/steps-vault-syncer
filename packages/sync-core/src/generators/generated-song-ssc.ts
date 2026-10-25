import { InvalidSscError, SSC_SPECIAL_CHARACTERS_PATTERN, withBackgroundVideo } from '../ssc/player-ssc';
import { withoutSscTag, withSscTag } from '../ssc/ssc-reader';
import type { CheckedGeneratedSsc } from './generated-song-check';
import { SONG_PICTURE_KINDS, type SongPictureKind } from './song-pictures';

const TAG_NAMES_BY_PICTURE_KIND: Record<SongPictureKind, string> = { banner: 'BANNER', background: 'BACKGROUND', jacket: 'JACKET' };
/**
 * Other tags that name files. Sync writes only its own files, so these would point at nothing, or at a file someone
 * else puts in the folder later; they are emptied.
 */
const EMPTIED_FILE_TAG_NAMES = ['CDTITLE', 'DISCIMAGE', 'CDIMAGE', 'PREVIEWVID', 'PREVIEW', 'LYRICSPATH', 'FGCHANGES', 'BGCHANGES2', 'ANIMATIONS', 'KEYSOUNDS', 'INSTRUMENTTRACK'];

/** The files Sync wrote into the song folder, under its own names. */
export interface GeneratedSongFileNames {
  musicFileName: string;
  videoFileName: string | null;
  /** A picture the song has no file for is left empty in the song file. */
  pictureFileNamesByKind: Partial<Record<SongPictureKind, string>>;
}

/** The checked song file as it goes into the game: only the asked charts, every file tag pointing at Sync's files. */
export function buildGeneratedSongSsc({ checkedSsc, fileNames }: { checkedSsc: CheckedGeneratedSsc; fileNames: GeneratedSongFileNames }): string {
  assertWritableFileNames(fileNames);
  const headerText = withFileTags({ headerText: checkedSsc.headerText, fileNames });
  // A chart may name its own #MUSIC in a song file; it must play the same music as the song.
  const sscText = withSscTag({ text: [headerText, ...checkedSsc.charts.map((chart) => chart.text)].join(''), tagName: 'MUSIC', value: fileNames.musicFileName });
  return fileNames.videoFileName === null ? sscText : withBackgroundVideo({ sscText, videoFileName: fileNames.videoFileName });
}

function withFileTags({ headerText, fileNames }: { headerText: string; fileNames: GeneratedSongFileNames }): string {
  let text = withoutSscTag({ text: headerText, tagName: 'BGCHANGES' });
  text = withSscTag({ text, tagName: 'MUSIC', value: fileNames.musicFileName });
  for (const kind of SONG_PICTURE_KINDS) text = withSscTag({ text, tagName: TAG_NAMES_BY_PICTURE_KIND[kind], value: fileNames.pictureFileNamesByKind[kind] ?? '' });
  for (const tagName of EMPTIED_FILE_TAG_NAMES) text = withEmptiedTag({ text, tagName });
  return text;
}

function withEmptiedTag({ text, tagName }: { text: string; tagName: string }): string {
  return new RegExp(`^#${tagName}:`, 'm').test(text) ? withSscTag({ text, tagName, value: '' }) : text;
}

function assertWritableFileNames({ musicFileName, pictureFileNamesByKind }: GeneratedSongFileNames): void {
  const unsafeName = [musicFileName, ...Object.values(pictureFileNamesByKind)].find((fileName) => SSC_SPECIAL_CHARACTERS_PATTERN.test(fileName));
  if (unsafeName !== undefined) throw new InvalidSscError(`The file name "${unsafeName}" can't be written into a song file. This is a bug in Sync; please report it.`);
}

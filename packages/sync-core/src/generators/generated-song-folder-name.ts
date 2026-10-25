import type { SongFolderNames } from '../layout/folder-layout';
import { getSscTagValue } from '../ssc/ssc-reader';
import type { GeneratorSongFacts } from './generator-protocol';

const UNKNOWN_ARTIST_NAME = 'Unknown artist';
const COMBINING_MARKS_PATTERN = /\p{M}/gu;
const ENGLISH_LETTER_PATTERN = /[A-Za-z]/;
/** Anything outside printable ASCII, from space to tilde. */
const NOT_PRINTABLE_ASCII_PATTERN = /[^ -~]/;
const ISO_MINUTE_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/;

/**
 * The names a generated song's folder is named from, always in English letters: StepMania 5 on Windows can't open a
 * folder in another script. Unlike vault songs, a title with no English spelling never keeps its own script; it falls
 * back to "Song <youtubeId>", else "Generated song <date> <time>".
 */
export function getGeneratedSongFolderNames({ headerText, song, now }: { headerText: string; song: GeneratorSongFacts; now: string }): SongFolderNames {
  const getTag = (tagName: string) => getSscTagValue({ text: headerText, tagName }) || null;
  const title = getTag('TITLETRANSLIT') ?? getTag('TITLE') ?? song.title;
  const artist = getTag('ARTISTTRANSLIT') ?? getTag('ARTIST') ?? song.artist;
  return {
    title: isInEnglishLetters(title) ? title : getFallbackTitle({ song, now }),
    artist: isInEnglishLetters(artist) ? artist : UNKNOWN_ARTIST_NAME,
    titleTransliteration: null,
    artistTransliteration: null,
  };
}

/** True when the name has English letters and nothing but ASCII is left once accents come off ("Beyoncé" is fine). */
export function isInEnglishLetters(name: string): boolean {
  const withoutAccents = name.normalize('NFKD').replace(COMBINING_MARKS_PATTERN, '');
  return ENGLISH_LETTER_PATTERN.test(withoutAccents) && !NOT_PRINTABLE_ASCII_PATTERN.test(withoutAccents);
}

function getFallbackTitle({ song, now }: { song: GeneratorSongFacts; now: string }): string {
  if (song.youtubeId) return `Song ${song.youtubeId}`;
  const minuteMatch = ISO_MINUTE_PATTERN.exec(now);
  return minuteMatch ? `Generated song ${minuteMatch[1] ?? ''} ${minuteMatch[2] ?? ''}${minuteMatch[3] ?? ''}` : 'Generated song';
}

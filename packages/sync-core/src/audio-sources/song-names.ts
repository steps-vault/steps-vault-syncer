/** Words that describe a recording or a video, not the song, so "Sorry (Official Video)" still finds "Sorry". */
const NOISE_IN_BRACKETS_PATTERN = /[([{][^)\]}]*\b(official|video|audio|lyrics?|remaster(ed)?|hd|hq|4k|mv|explicit|clean|visuali[sz]er)\b[^)\]}]*[)\]}]/giu;
const FEATURING_PATTERN = /\s[([]?\b(feat|ft|featuring)\b\.?\s[^)\]]*[)\]]?/giu;
const COMBINING_MARKS_PATTERN = /\p{M}/gu;
const NON_WORD_PATTERN = /[^\p{L}\p{N}]+/gu;
const TRACK_NUMBER_PATTERN = /^\s*(\d{1,3})\s*[-._)]?\s+/u;
const ARTIST_TITLE_SEPARATOR = ' - ';

/** "Beyoncé – Sorry (Official Video) [HD]" and "beyonce sorry" become the same key. */
export function getSongNameKey(text: string): string {
  return text
    .replace(NOISE_IN_BRACKETS_PATTERN, ' ')
    .replace(FEATURING_PATTERN, ' ')
    .normalize('NFKD')
    .replace(COMBINING_MARKS_PATTERN, '')
    .toLocaleLowerCase('en-US')
    .replace(NON_WORD_PATTERN, ' ')
    .trim();
}

export interface FileNameFacts {
  title: string;
  artist: string | null;
}

/** "03 - Sia - Cheap Thrills.mp3" → Sia / Cheap Thrills; "Cheap Thrills.ogg" → no artist. Used when a file has no tags. */
export function getFileNameFacts(fileName: string): FileNameFacts {
  const stem = fileName.replace(/\.[^.]+$/u, '').replace(TRACK_NUMBER_PATTERN, '').trim();
  const separatorIndex = stem.indexOf(ARTIST_TITLE_SEPARATOR);
  if (separatorIndex <= 0) return { title: stem, artist: null };
  return { artist: stem.slice(0, separatorIndex).trim(), title: stem.slice(separatorIndex + ARTIST_TITLE_SEPARATOR.length).trim() };
}

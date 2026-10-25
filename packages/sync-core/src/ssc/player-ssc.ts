/** Tags that hold seconds of the music, so they move when the player's copy starts at a different moment. */
const OFFSET_TAG_PATTERN = /^(#OFFSET:)([^;]*)(;)/gm;
const SAMPLE_START_TAG_PATTERN = /^(#SAMPLESTART:)([^;]*)(;)/gm;
const MUSIC_TAG_PATTERN = /^(#MUSIC:)([^;]*)(;)/gm;
/** StepsVault's background video isn't part of a synced song (the player brings only music), so its line goes. */
const BACKGROUND_CHANGES_LINE_PATTERN = /^#BGCHANGES:[^;]*;\r?\n?/gm;
export const SSC_SPECIAL_CHARACTERS_PATTERN = /[;:#\\]/;
const TIME_DECIMALS = 6;
const BEAT_DECIMALS = 3;
const SECONDS_PER_MINUTE = 60;
/** StepMania 5.0 splits #BGCHANGES on ',' and '=' before it reads file names. */
const BACKGROUND_FILE_SPECIAL_CHARACTERS_PATTERN = /[;:#\\,=]/;
/** After the video ends, show no song background (the engine writes the same line). */
const NO_SONG_BACKGROUND_ENTRY = '99999=-nosongbg-=1.000=0=0=0';

export class InvalidSscError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSscError';
  }
}

/**
 * The song file as it goes into the player's game: #MUSIC names their file, and every time in seconds moves by
 * `shiftSeconds` (how much later the music starts in their copy). With `videoFileName`, the video plays behind the
 * steps from the music's first moment. Beats, steps and everything else stay byte for byte, line endings included.
 */
export function buildPlayerSsc({ sscText, musicFileName, shiftSeconds, videoFileName = null }: { sscText: string; musicFileName: string; shiftSeconds: number; videoFileName?: string | null }): string {
  if (SSC_SPECIAL_CHARACTERS_PATTERN.test(musicFileName)) throw new InvalidSscError(`The music file name "${musicFileName}" can't be written into a song file. This is a bug in Sync; please report it.`);
  if (!Number.isFinite(shiftSeconds)) throw new InvalidSscError('The timing shift for this song is not a number. Match its audio again.');
  if (!hasTag({ sscText, pattern: OFFSET_TAG_PATTERN })) throw new InvalidSscError('This song file has no #OFFSET, so its steps can’t be lined up. Report the song on StepsVault.');
  const playerSsc = sscText
    .replace(MUSIC_TAG_PATTERN, (_match, tag: string, _value: string, end: string) => `${tag}${musicFileName}${end}`)
    .replace(OFFSET_TAG_PATTERN, (_match, tag: string, value: string, end: string) => `${tag}${formatSeconds(getShiftedOffset({ offsetSeconds: parseSeconds(value), shiftSeconds }))}${end}`)
    .replace(SAMPLE_START_TAG_PATTERN, (_match, tag: string, value: string, end: string) => `${tag}${formatSeconds(Math.max(0, parseSeconds(value) + shiftSeconds))}${end}`)
    .replace(BACKGROUND_CHANGES_LINE_PATTERN, '');
  return videoFileName === null ? playerSsc : withBackgroundVideo({ sscText: playerSsc, videoFileName });
}

/** The video starts at the music's time 0, which is beat OFFSET × BPM / 60 (often negative), as the engine writes it. */
export function withBackgroundVideo({ sscText, videoFileName }: { sscText: string; videoFileName: string }): string {
  if (BACKGROUND_FILE_SPECIAL_CHARACTERS_PATTERN.test(videoFileName)) throw new InvalidSscError(`The video file name "${videoFileName}" can't be written into a song file. This is a bug in Sync; please report it.`);
  const offsetSeconds = parseSeconds(/^#OFFSET:([^;]*);/m.exec(sscText)?.[1] ?? '');
  const bpmsMatch = /^#BPMS:[^=;]*=([^,;]*)[^;]*;(\r?\n)/m.exec(sscText);
  const firstBpm = Number(bpmsMatch?.[1]);
  if (!bpmsMatch || !Number.isFinite(firstBpm) || firstBpm <= 0) throw new InvalidSscError('This song file has no tempo (#BPMS), so its video can’t be lined up. Report the song on StepsVault.');
  const lineEnding = bpmsMatch[2] ?? '\n';
  const startBeat = (offsetSeconds * firstBpm) / SECONDS_PER_MINUTE;
  const backgroundLine = `#BGCHANGES:${startBeat.toFixed(BEAT_DECIMALS)}=${videoFileName}=1.000=0=0=1=====,${lineEnding}${NO_SONG_BACKGROUND_ENTRY};${lineEnding}`;
  const insertAt = bpmsMatch.index + bpmsMatch[0].length;
  return `${sscText.slice(0, insertAt)}${backgroundLine}${sscText.slice(insertAt)}`;
}

/** seconds(beat) = −OFFSET + beat × 60 / BPM, so music that starts later needs a smaller OFFSET. */
export function getShiftedOffset({ offsetSeconds, shiftSeconds }: { offsetSeconds: number; shiftSeconds: number }): number {
  return offsetSeconds - shiftSeconds;
}

function parseSeconds(value: string): number {
  const seconds = Number(value.trim());
  if (value.trim() === '' || !Number.isFinite(seconds)) throw new InvalidSscError(`"${value}" is not a time in seconds. Report the song on StepsVault.`);
  return seconds;
}

function formatSeconds(seconds: number): string {
  const rounded = seconds.toFixed(TIME_DECIMALS);
  return rounded === `-${(0).toFixed(TIME_DECIMALS)}` ? (0).toFixed(TIME_DECIMALS) : rounded;
}

function hasTag({ sscText, pattern }: { sscText: string; pattern: RegExp }): boolean {
  pattern.lastIndex = 0;
  const isFound = pattern.test(sscText);
  pattern.lastIndex = 0;
  return isFound;
}

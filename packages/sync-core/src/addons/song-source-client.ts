import { HttpRequestError, type HttpClient } from '../network/http-client';
import { ADDON_CALL_TIMEOUT_MILLISECONDS, getInstalledAddonOptionValues, isAddonSetToMusicOnly, MAX_ADDON_ANSWER_BYTES, type InstalledAddon } from './addon-client';
import { InvalidAddonAnswerError, isAddonProviding } from './addon-protocol';
import { getSongSourceInputValues } from './song-source-inputs';
import { buildSongSourceRequestBody, parseSongSourceAnswer, type SongSourceAnswer } from './song-source-protocol';

// A song source may download a whole video before answering; past this, the player is better off trying again.
const MAX_SONG_SOURCE_WAIT_SECONDS = 30 * 60;

export interface SongSourceCallOptions {
  httpClient: HttpClient;
  addon: InstalledAddon;
  /** What the player typed in each field of the addon's tab. Checked before anything is sent. */
  valuesByInputId: Readonly<Record<string, string | undefined>>;
}

export type SongSourceCallResult = SongSourceAnswer | { kind: 'not-answering'; message: string };

export interface WaitForSongSourceOptions extends SongSourceCallOptions {
  /** Resolves after this many seconds; the platform may resolve it early when the player cancels. */
  waitSeconds: (seconds: number) => Promise<void>;
  /** Checked around every wait; true stops asking. */
  shouldStop?: () => boolean;
}

export type SongSourceWaitResult = Exclude<SongSourceCallResult, { kind: 'working' }> | { kind: 'stopped' };

/**
 * Asks a song source once for the song the player described. Throws InvalidSongSourceInputError, before sending
 * anything, when a field breaks its rules. An addon that is offline, slow or broken never throws: it is
 * 'not-answering', with a sentence for the player.
 */
export async function fetchSongSource({ httpClient, addon, valuesByInputId }: SongSourceCallOptions): Promise<SongSourceCallResult> {
  if (!isAddonProviding({ manifest: addon.manifest, ability: 'song-source' })) throw new Error(`${addon.manifest.name} doesn’t bring new songs. Pick an addon that has a tab on the Make a song page.`);
  const inputValues = getSongSourceInputValues({ inputs: addon.manifest.inputs, valuesByInputId });
  try {
    const response = await httpClient.requestJson({
      url: `${addon.baseUrl}/song-source`,
      method: 'POST',
      jsonBody: buildSongSourceRequestBody({ inputValues, optionValues: getInstalledAddonOptionValues(addon) }),
      timeoutMilliseconds: ADDON_CALL_TIMEOUT_MILLISECONDS,
      maxResponseBytes: MAX_ADDON_ANSWER_BYTES,
    });
    return withoutUnwantedVideo({ addon, answer: parseSongSourceAnswer(response) });
  } catch (error) {
    if (error instanceof HttpRequestError || error instanceof InvalidAddonAnswerError) return { kind: 'not-answering', message: describeSongSourceProblem({ addon, error }) };
    throw error;
  }
}

/** Asks again as often as the addon says while it is still working, until it answers, stops answering, or the player stops. */
export async function waitForSongSource(options: WaitForSongSourceOptions): Promise<SongSourceWaitResult> {
  const shouldStop = options.shouldStop ?? (() => false);
  let waitedSeconds = 0;
  for (;;) {
    const result = await fetchSongSource(options);
    if (result.kind !== 'working') return result;
    if (waitedSeconds >= MAX_SONG_SOURCE_WAIT_SECONDS) return { kind: 'not-answering', message: `${options.addon.manifest.name} is still working after ${String(MAX_SONG_SOURCE_WAIT_SECONDS / 60)} minutes. Try again later.` };
    if (shouldStop()) return { kind: 'stopped' };
    await options.waitSeconds(result.retryAfterSeconds);
    waitedSeconds += result.retryAfterSeconds;
    if (shouldStop()) return { kind: 'stopped' };
  }
}

/** When the player chose "Music only", a video the addon sends anyway is dropped, as for /audio-links. */
function withoutUnwantedVideo({ addon, answer }: { addon: InstalledAddon; answer: SongSourceAnswer }): SongSourceAnswer {
  if (answer.kind !== 'found' || !isAddonSetToMusicOnly(addon)) return answer;
  return { ...answer, videoLink: null };
}

function describeSongSourceProblem({ addon, error }: { addon: InstalledAddon; error: HttpRequestError | InvalidAddonAnswerError }): string {
  const name = addon.manifest.name;
  if (error instanceof InvalidAddonAnswerError) return `${name}: ${error.message} Try again, or ask the addon’s maker.`;
  if (error.failure === 'timeout') return `${name} is taking too long to answer. Try again in a few minutes.`;
  if (error.failure === 'too-large') return `${name} sent too much data, so Sync ignored it. Ask the addon’s maker.`;
  return `${name} isn’t answering. Check that it is running, then try again.`;
}

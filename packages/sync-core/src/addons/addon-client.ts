import { HttpRequestError, type HttpClient } from '../network/http-client';
import { getAddonBaseUrl } from './addon-address';
import { buildAudioLinksRequestBody, InvalidAddonAnswerError, parseAddonManifest, parseAudioLinksAnswer, type AddonManifest, type AddonSongFacts, type AudioLinksAnswer } from './addon-protocol';

const MANIFEST_TIMEOUT_MILLISECONDS = 10_000;
const AUDIO_LINKS_TIMEOUT_MILLISECONDS = 20_000;
const MAX_ANSWER_BYTES = 64 * 1024;

/** An addon the player installed after seeing what it will see. */
export interface InstalledAddon {
  baseUrl: string;
  manifest: AddonManifest;
  isEnabled: boolean;
  consentedAt: string;
}

export type AddonCallResult = AudioLinksAnswer | { kind: 'not-answering'; message: string };

/** Step 1 of "Add addon": read the manifest, to show the consent screen. Installs nothing. */
export async function fetchAddonManifest({ httpClient, address }: { httpClient: HttpClient; address: string }): Promise<{ baseUrl: string; manifest: AddonManifest }> {
  const baseUrl = getAddonBaseUrl(address);
  try {
    const response = await httpClient.requestJson({ url: `${baseUrl}/manifest.json`, method: 'GET', timeoutMilliseconds: MANIFEST_TIMEOUT_MILLISECONDS, maxResponseBytes: MAX_ANSWER_BYTES });
    if (response.status !== 200) throw new InvalidAddonAnswerError(`No addon answered at this address (${String(response.status)}). Check the address with whoever made it.`);
    return { baseUrl, manifest: parseAddonManifest(response.body) };
  } catch (error) {
    if (error instanceof HttpRequestError) throw new InvalidAddonAnswerError('No addon answered at this address. Check the address and that the addon is running.');
    throw error;
  }
}

/** Step 2: only after the player agreed on the consent screen. */
export function buildInstalledAddon({ baseUrl, manifest, consentedAt }: { baseUrl: string; manifest: AddonManifest; consentedAt: string }): InstalledAddon {
  return { baseUrl, manifest, isEnabled: true, consentedAt };
}

/**
 * Asks one addon for a song's audio. An addon that is offline, slow or broken never throws: the song simply waits
 * for it ('not-answering'), and the player can pick a file meanwhile.
 */
export async function fetchAudioLinks({ httpClient, addon, song }: { httpClient: HttpClient; addon: InstalledAddon; song: AddonSongFacts }): Promise<AddonCallResult> {
  try {
    const response = await httpClient.requestJson({
      url: `${addon.baseUrl}/audio-links`,
      method: 'POST',
      jsonBody: buildAudioLinksRequestBody(song),
      timeoutMilliseconds: AUDIO_LINKS_TIMEOUT_MILLISECONDS,
      maxResponseBytes: MAX_ANSWER_BYTES,
    });
    return parseAudioLinksAnswer(response);
  } catch (error) {
    if (error instanceof HttpRequestError || error instanceof InvalidAddonAnswerError) return { kind: 'not-answering', message: describeAddonProblem({ addon, error }) };
    throw error;
  }
}

function describeAddonProblem({ addon, error }: { addon: InstalledAddon; error: HttpRequestError | InvalidAddonAnswerError }): string {
  const name = addon.manifest.name;
  if (error instanceof InvalidAddonAnswerError) return `${name} sent an answer Sync can’t use. We’ll try again later.`;
  if (error.failure === 'timeout') return `${name} is taking too long to answer. We’ll try again later.`;
  if (error.failure === 'too-large') return `${name} sent too much data, so Sync ignored it.`;
  return `${name} isn’t answering. We’ll try again later.`;
}

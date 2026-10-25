import { getAddonOptionValues, type AddonOptionValues } from '../addons/addon-options';
import { HttpRequestError, type HttpClient } from '../network/http-client';
import { getServiceBaseUrl, isOnThisComputer } from '../network/service-address';
import { GeneratorError } from './generator-error';
import { parseGeneratorManifest, type GeneratorManifest, type GeneratorReference } from './generator-protocol';
import { getSignInHeaders, type GeneratorSignIn } from './generator-sign-in';

const MANIFEST_TIMEOUT_MILLISECONDS = 10_000;
const MAX_MANIFEST_BYTES = 64 * 1024;

/** A generator the player added in Sync's Generators section. */
export interface InstalledGenerator {
  baseUrl: string;
  manifest: GeneratorManifest;
  isEnabled: boolean;
  /** The player's pick for each of the manifest's options. Always checked against the manifest before it is sent. */
  optionValues: AddonOptionValues;
  /**
   * When the player agreed that their music goes over the internet to this generator. Null until then; a generator on
   * this computer never needs it, since the music stays on the computer.
   */
  musicUploadConsentedAt: string | null;
}

/** Step 1 of "Add generator": read the manifest, to show what the generator is. Installs nothing. */
export async function fetchGeneratorManifest({ httpClient, address, signIn }: { httpClient: HttpClient; address: string; signIn?: GeneratorSignIn | null }): Promise<{ baseUrl: string; manifest: GeneratorManifest }> {
  const baseUrl = getServiceBaseUrl({ address, serviceName: 'generator' });
  const url = `${baseUrl}/manifest.json`;
  try {
    const response = await httpClient.requestJson({ url, method: 'GET', headers: getSignInHeaders({ signIn, url }), timeoutMilliseconds: MANIFEST_TIMEOUT_MILLISECONDS, maxResponseBytes: MAX_MANIFEST_BYTES });
    if (response.status !== 200) throw new GeneratorError({ reason: 'not-answering', message: `No generator answered at this address (${response.status}). Check the address with whoever made it.` });
    return { baseUrl, manifest: parseGeneratorManifest(response.body) };
  } catch (error) {
    if (error instanceof HttpRequestError) throw new GeneratorError({ reason: 'not-answering', message: 'No generator answered at this address. Check the address and that the generator is running.', cause: error });
    throw error;
  }
}

/** Step 2: with the options the player picked. Upload consent is asked separately, before the first song. */
export function buildInstalledGenerator({ baseUrl, manifest, optionValues = {} }: { baseUrl: string; manifest: GeneratorManifest; optionValues?: Readonly<Record<string, unknown>> }): InstalledGenerator {
  return { baseUrl, manifest, isEnabled: true, optionValues: getAddonOptionValues({ options: manifest.options, savedValues: optionValues }), musicUploadConsentedAt: null };
}

/** Reads a generator from saved settings, checking it again like a fresh manifest. Null for anything invalid. */
export function loadSavedGenerator(value: unknown): InstalledGenerator | null {
  if (typeof value !== 'object' || value === null) return null;
  const saved = value as Record<string, unknown>;
  if (typeof saved.baseUrl !== 'string' || typeof saved.isEnabled !== 'boolean') return null;
  try {
    const baseUrl = getServiceBaseUrl({ address: saved.baseUrl, serviceName: 'generator' });
    const manifest = parseGeneratorManifest(saved.manifest);
    const savedValues = typeof saved.optionValues === 'object' && saved.optionValues !== null ? (saved.optionValues as Record<string, unknown>) : {};
    const musicUploadConsentedAt = typeof saved.musicUploadConsentedAt === 'string' ? saved.musicUploadConsentedAt : null;
    return { baseUrl, manifest, isEnabled: saved.isEnabled, optionValues: getAddonOptionValues({ options: manifest.options, savedValues }), musicUploadConsentedAt };
  } catch {
    return null;
  }
}

/** True for a generator at 127.0.0.1 or localhost: the music never leaves the player's computer. */
export function isGeneratorOnThisComputer(generator: Pick<InstalledGenerator, 'baseUrl'>): boolean {
  return isOnThisComputer(generator.baseUrl);
}

/**
 * The sentence to show, and get the player's agreement to, before the first song goes to a generator on another
 * computer. Null when no agreement is needed: the generator is on this computer, or the player already agreed.
 */
export function getMusicUploadWarningOrNull(generator: Pick<InstalledGenerator, 'baseUrl' | 'musicUploadConsentedAt'>): string | null {
  if (isGeneratorOnThisComputer(generator) || generator.musicUploadConsentedAt !== null) return null;
  return `Your music file will be sent to ${generator.baseUrl}.`;
}

export function withMusicUploadConsent({ generator, consentedAt }: { generator: InstalledGenerator; consentedAt: string }): InstalledGenerator {
  return { ...generator, musicUploadConsentedAt: consentedAt };
}

export function getGeneratorReference(generator: InstalledGenerator): GeneratorReference {
  return { name: generator.manifest.name, baseUrl: generator.baseUrl };
}

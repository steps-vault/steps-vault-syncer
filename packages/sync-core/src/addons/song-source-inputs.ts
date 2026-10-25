import { parseUrlOrNull } from '../network/service-address';
import { ADDON_OPTION_ID_PATTERN, getAddonLabelOrNull } from './addon-options';

const MAX_INPUTS = 3;
const MAX_SITES = 10;
const MAX_PLACEHOLDER_LENGTH = 80;
const MAX_SEARCH_LENGTH = 200;
// Real song links are far shorter; this only stops a pasted page of text from being sent as a "link".
const MAX_LINK_LENGTH = 2000;
// At least two labels and a letters-only last one, so a site can't be a bare "com" (every .com site) or an IP address.
const SITE_NAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** A field on the addon's "Make a song" tab, drawn by Sync: an addon never brings its own screens. */
export type SongSourceInput =
  /** A web address; Sync accepts only https links on one of `sites` or their subdomains. */
  | { id: string; kind: 'link'; label: string; placeholder: string | null; sites: readonly string[] }
  /** Free text, such as a title or an artist. */
  | { id: string; kind: 'search'; label: string; placeholder: string | null };

/** What the player typed, checked, by input id. Inputs left empty are not in it. */
export type SongSourceInputValues = Record<string, string>;

/** The player's input breaks the input's rules. The message is a sentence to show under that field. */
export class InvalidSongSourceInputError extends Error {
  readonly inputId: string;

  constructor({ inputId, message }: { inputId: string; message: string }) {
    super(message);
    this.name = 'InvalidSongSourceInputError';
    this.inputId = inputId;
  }
}

/** Like options, a broken input is dropped; the manifest parser refuses a song source left with none. */
export function parseSongSourceInputs(value: unknown): SongSourceInput[] {
  if (!Array.isArray(value)) return [];
  const inputs: SongSourceInput[] = [];
  for (const candidate of value) {
    const input = parseSongSourceInputOrNull(candidate);
    if (input && !inputs.some((existing) => existing.id === input.id)) inputs.push(input);
  }
  return inputs.slice(0, MAX_INPUTS);
}

/**
 * Checks what the player typed in every field before anything is sent to the addon. Empty fields are left out, but
 * at least one must be filled. Throws InvalidSongSourceInputError for the first field with a problem.
 */
export function getSongSourceInputValues({ inputs, valuesByInputId }: { inputs: readonly SongSourceInput[]; valuesByInputId: Readonly<Record<string, string | undefined>> }): SongSourceInputValues {
  const values: SongSourceInputValues = {};
  for (const input of inputs) {
    const typedValue = valuesByInputId[input.id]?.trim() ?? '';
    if (typedValue !== '') values[input.id] = getCheckedSongSourceInputValue({ input, value: typedValue });
  }
  const firstInput = inputs[0];
  if (Object.keys(values).length === 0 && firstInput) throw new InvalidSongSourceInputError({ inputId: firstInput.id, message: getEmptyInputMessage(firstInput) });
  return values;
}

/** Checks one field (for example as the player leaves it) and returns the value to send. Throws InvalidSongSourceInputError. */
export function getCheckedSongSourceInputValue({ input, value }: { input: SongSourceInput; value: string }): string {
  const trimmedValue = value.trim();
  if (trimmedValue === '') throw new InvalidSongSourceInputError({ inputId: input.id, message: getEmptyInputMessage(input) });
  if (input.kind === 'link') return getCheckedLink({ input, link: trimmedValue });
  if (trimmedValue.length > MAX_SEARCH_LENGTH) throw new InvalidSongSourceInputError({ inputId: input.id, message: `Make it shorter: at most ${MAX_SEARCH_LENGTH} characters.` });
  return trimmedValue;
}

/** True for a host that is one of the sites or a subdomain of one: music.youtube.com is on youtube.com, evil-youtube.com isn't. */
export function isHostOnSites({ hostName, sites }: { hostName: string; sites: readonly string[] }): boolean {
  return sites.some((site) => hostName === site || hostName.endsWith(`.${site}`));
}

function getCheckedLink({ input, link }: { input: Extract<SongSourceInput, { kind: 'link' }>; link: string }): string {
  const url = link.length > MAX_LINK_LENGTH ? null : parseUrlOrNull(link);
  if (!url) throw new InvalidSongSourceInputError({ inputId: input.id, message: 'That doesn’t look like a link. Paste the song’s address, starting with https://' });
  const problem = getLinkProblemOrNull({ input, url });
  if (problem !== null) throw new InvalidSongSourceInputError({ inputId: input.id, message: problem });
  return url.href;
}

function getLinkProblemOrNull({ input, url }: { input: Extract<SongSourceInput, { kind: 'link' }>; url: URL }): string | null {
  if (url.protocol !== 'https:') return 'Paste a link that starts with https://';
  if (url.username || url.password) return 'Paste the link without a user name or password in it.';
  if (!isHostOnSites({ hostName: url.hostname, sites: input.sites })) return `Paste a link from ${input.sites.join(' or ')}.`;
  return null;
}

function getEmptyInputMessage(input: SongSourceInput): string {
  return input.kind === 'link' ? `Paste a link from ${input.sites.join(' or ')}.` : 'Type what to search for.';
}

function parseSongSourceInputOrNull(value: unknown): SongSourceInput | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !ADDON_OPTION_ID_PATTERN.test(value.id)) return null;
  const label = getAddonLabelOrNull(value.label);
  if (label === null) return null;
  const placeholder = getPlaceholderOrNull(value.placeholder);
  if (value.kind === 'search') return { id: value.id, kind: 'search', label, placeholder };
  const sites = value.kind === 'link' ? parseSitesOrNull(value.sites) : null;
  return sites === null ? null : { id: value.id, kind: 'link', label, placeholder, sites };
}

function parseSitesOrNull(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SITES) return null;
  const sites = value.map((site) => (typeof site === 'string' ? site.trim().toLowerCase() : ''));
  return sites.every((site) => SITE_NAME_PATTERN.test(site)) ? [...new Set(sites)] : null;
}

function getPlaceholderOrNull(value: unknown): string | null {
  const placeholder = typeof value === 'string' ? value.trim() : '';
  return placeholder === '' ? null : placeholder.slice(0, MAX_PLACEHOLDER_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

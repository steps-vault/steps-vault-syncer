import type { SiteSongRequest } from '@stepsvault/sync-core';

/**
 * The app's own link scheme, for the website's "Open in Sync app". It names the app the player sees (DanceDance Sync),
 * so no other program is likely to want it, and it is lower case because Windows and macOS compare schemes that way.
 */
export const SYNC_LINK_SCHEME = 'dancedance-sync';

const MAX_LINK_LENGTH = 2_048;
const MAX_SONG_TEXT_LENGTH = 200;
const MAX_WANTED_REQUEST_ID_LENGTH = 64;
const MAX_PARTY_SLUG_LENGTH = 80;
const MAKE_SONG_HOST = 'generators';
const MAKE_SONG_PATHS: readonly string[] = ['/make', '/make/'];
const WANTED_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
// Party slugs are made from the list's name, so they can hold any script's letters ("מסיבה-7q2xk").
const PARTY_SLUG_PATTERN = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
// Control characters and the marks that reorder text could make a title read as something it isn't.
const HIDDEN_CHARACTERS_PATTERN = /[\p{Cc}‪-‮⁦-⁩]/u;

/** What a "make this song" link asks for. It comes from a web page, so the app only ever treats it as a suggestion. */
export interface MakeSongLink {
  title: string;
  artist: string | null;
  siteRequest: SiteSongRequest | null;
}

/** The first command-line argument that is one of the app's links: how Windows hands a clicked link to the app. */
export function findSyncLinkInArguments(commandLineArguments: readonly string[]): string | null {
  return commandLineArguments.find((argument) => argument.toLowerCase().startsWith(`${SYNC_LINK_SCHEME}:`)) ?? null;
}

/**
 * Reads `dancedance-sync://generators/make?title=…&artist=…&wanted=…&party=…`. Any other address, or a missing or
 * broken title, gives null. Parts it doesn't know are ignored, and an artist, Wanted id or party slug that breaks its
 * rules is dropped, since the song can still be made without it.
 */
export function getMakeSongLinkOrNull(link: string): MakeSongLink | null {
  const url = getMakeSongUrlOrNull(link);
  if (!url) return null;
  const title = getSongTextOrNull(getOnlyParameterOrNull({ url, name: 'title' }));
  if (title === null) return null;
  const artist = getSongTextOrNull(getOnlyParameterOrNull({ url, name: 'artist' }));
  return { title, artist, siteRequest: getSiteRequestOrNull(url) };
}

function getMakeSongUrlOrNull(link: string): URL | null {
  if (link.length > MAX_LINK_LENGTH) return null;
  const url = URL.parse(link);
  if (url?.protocol !== `${SYNC_LINK_SCHEME}:`) return null;
  if (url.username !== '' || url.password !== '' || url.port !== '') return null;
  if (url.hostname.toLowerCase() !== MAKE_SONG_HOST || !MAKE_SONG_PATHS.includes(url.pathname)) return null;
  return url;
}

/** A part given twice is ambiguous, so it counts as not given. */
function getOnlyParameterOrNull({ url, name }: { url: URL; name: string }): string | null {
  const values = url.searchParams.getAll(name);
  return values.length === 1 ? (values[0] ?? null) : null;
}

function getSongTextOrNull(value: string | null): string | null {
  if (value === null) return null;
  const text = value.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (text === '' || text.length > MAX_SONG_TEXT_LENGTH || HIDDEN_CHARACTERS_PATTERN.test(text)) return null;
  return text;
}

function getSiteRequestOrNull(url: URL): SiteSongRequest | null {
  const wantedRequestId = getMatchingTextOrNull({ value: getOnlyParameterOrNull({ url, name: 'wanted' }), pattern: WANTED_REQUEST_ID_PATTERN, maxLength: MAX_WANTED_REQUEST_ID_LENGTH });
  const partySlug = getMatchingTextOrNull({ value: getOnlyParameterOrNull({ url, name: 'party' }), pattern: PARTY_SLUG_PATTERN, maxLength: MAX_PARTY_SLUG_LENGTH });
  return wantedRequestId === null && partySlug === null ? null : { wantedRequestId, partySlug };
}

function getMatchingTextOrNull({ value, pattern, maxLength }: { value: string | null; pattern: RegExp; maxLength: number }): string | null {
  if (value === null || value.length > maxLength || !pattern.test(value)) return null;
  return value;
}

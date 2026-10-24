const LOOPBACK_HOST_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

export class InvalidAddonAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAddonAddressError';
  }
}

/**
 * An addon's base address, without a trailing slash. https only, except an addon running on this same computer
 * (127.0.0.1, localhost), which never crosses the network. No user names, passwords, query or fragment.
 */
export function getAddonBaseUrl(address: string): string {
  const url = parseUrlOrNull(address.trim());
  if (!url) throw new InvalidAddonAddressError('That doesn’t look like a web address. It should start with https://');
  if (!isAllowedUrl(url)) throw new InvalidAddonAddressError('Addon addresses must start with https:// (or http://127.0.0.1 for an addon on this computer).');
  if (url.username || url.password || url.search || url.hash) throw new InvalidAddonAddressError('Use the addon’s plain address, without a password, ? or #.');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** Links an addon returns follow the same rule as addon addresses. */
export function isAllowedAddonLinkUrl(value: string): boolean {
  const url = parseUrlOrNull(value);
  return url !== null && isAllowedUrl(url) && !url.username && !url.password;
}

/** Pages are opened in the player's browser, so they must be https. */
export function isAllowedPageUrl(value: string): boolean {
  return parseUrlOrNull(value)?.protocol === 'https:';
}

function isAllowedUrl(url: URL): boolean {
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && LOOPBACK_HOST_NAMES.has(url.hostname);
}

function parseUrlOrNull(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

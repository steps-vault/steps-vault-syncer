const LOOPBACK_HOST_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** The kinds of web services a player can connect to Sync; used to word the messages. */
export type ServiceName = 'addon' | 'generator';

export class InvalidServiceAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidServiceAddressError';
  }
}

/**
 * A service's base address, without a trailing slash. https only, except a service running on this same computer
 * (127.0.0.1, localhost), which never crosses the network. No user names, passwords, query or fragment.
 */
export function getServiceBaseUrl({ address, serviceName }: { address: string; serviceName: ServiceName }): string {
  const url = parseUrlOrNull(address.trim());
  if (!url) throw new InvalidServiceAddressError('That doesn’t look like a web address. It should start with https://');
  if (!isAllowedUrl(url)) throw new InvalidServiceAddressError(`${capitalize(serviceName)} addresses must start with https:// (or http://127.0.0.1 for ${articleFor(serviceName)} ${serviceName} on this computer).`);
  if (url.username || url.password || url.search || url.hash) throw new InvalidServiceAddressError(`Use the ${serviceName}’s plain address, without a password, ? or #.`);
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** Links a service returns follow the same rule as service addresses, except that a query is allowed (signed links need one). */
export function isAllowedServiceLinkUrl(value: string): boolean {
  const url = parseUrlOrNull(value);
  return url !== null && isAllowedUrl(url) && !url.username && !url.password;
}

/** True for an address on the player's own computer, where nothing sent to it crosses the network. */
export function isOnThisComputer(value: string): boolean {
  const url = parseUrlOrNull(value);
  return url !== null && LOOPBACK_HOST_NAMES.has(url.hostname);
}

/** Pages are opened in the player's browser, so they must be https. */
export function isAllowedPageUrl(value: string): boolean {
  return parseUrlOrNull(value)?.protocol === 'https:';
}

function isAllowedUrl(url: URL): boolean {
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && LOOPBACK_HOST_NAMES.has(url.hostname);
}

/** The parsed address, or null for text that isn't one. */
export function parseUrlOrNull(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function articleFor(serviceName: ServiceName): string {
  return serviceName === 'addon' ? 'an' : 'a';
}

import { STEPSVAULT_SITE_ORIGIN } from '@stepsvault/sync-core';

/**
 * The website addresses the local bridge answers. An installed (packaged) Sync answers only the real site. A
 * development run also answers the test site it syncs with (STEPSVAULT_SITE_URL) and any origins listed in
 * STEPSVAULT_BRIDGE_DEV_ORIGINS, so the site can be tried on this computer; a release build ignores both.
 */
export function getLocalBridgeOrigins({ isPackaged, siteUrl, developmentOriginsText }: { isPackaged: boolean; siteUrl: string; developmentOriginsText: string | undefined }): string[] {
  if (isPackaged) return [STEPSVAULT_SITE_ORIGIN];
  const developmentOrigins = [siteUrl, ...(developmentOriginsText ?? '').split(',')].flatMap((text) => getWebOriginOrNull(text.trim()) ?? []);
  return [...new Set([STEPSVAULT_SITE_ORIGIN, ...developmentOrigins])];
}

/** Only a plain http(s) origin: nothing after the port, so "https://dancedance.studio.example" never slips in by prefix. */
function getWebOriginOrNull(text: string): string | null {
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

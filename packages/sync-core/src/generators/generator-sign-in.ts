/**
 * How Sync signs in to StepsVault's own generator. The app passes it only for that generator; community generators
 * never get it (see "Signing in" in generators.md).
 */
export interface GeneratorSignIn {
  /** The StepsVault address. The token is only ever sent to this origin, whatever the caller passes it with. */
  siteUrl: string;
  deviceToken: string;
}

/**
 * The Authorization header for a request, or none. Checking every URL here, rather than trusting the caller to pass
 * the sign-in only for the right generator, means a mistake elsewhere can never leak the token to another address.
 */
export function getSignInHeaders({ signIn, url }: { signIn: GeneratorSignIn | null | undefined; url: string }): Record<string, string> {
  if (!signIn || !isOnSignInSite({ signIn, url })) return {};
  return { Authorization: `Bearer ${signIn.deviceToken}` };
}

/** True when the URL is on the StepsVault address, so it may get the token. */
export function isOnSignInSite({ signIn, url }: { signIn: GeneratorSignIn | null | undefined; url: string }): boolean {
  if (!signIn) return false;
  const siteOrigin = getOriginOrNull(signIn.siteUrl);
  return siteOrigin !== null && siteOrigin === getOriginOrNull(url);
}

function getOriginOrNull(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

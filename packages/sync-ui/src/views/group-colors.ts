/**
 * The six group colours the player picks from on the site, by the key GET /api/sync/vault sends. A copy of the site's
 * SONG_GROUP_COLOR_BY_KEY (packages/domain song-groups.ts in the StepsVault site repo): keep the two the same.
 */
const GROUP_COLOR_HEXES_BY_KEY: ReadonlyMap<string, string> = new Map([
  ['green', '#2cff00'],
  ['pink', '#ff32f8'],
  ['cyan', '#1cd8ff'],
  ['yellow', '#fee600'],
  ['orange', '#ff7a3c'],
  ['purple', '#a46bff'],
]);

/** null for no colour, and for a colour a newer site added that this Sync doesn't know yet: the folder stays cyan. */
export function getGroupColorHex(groupColorKey: string | null | undefined): string | null {
  if (!groupColorKey) return null;
  return GROUP_COLOR_HEXES_BY_KEY.get(groupColorKey) ?? null;
}

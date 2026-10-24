const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a over the text's UTF-16 code units. Only used to notice that the player changed a chart file Sync wrote,
 * so it needs to be fast and stable, not secure.
 */
export function getChartHash(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

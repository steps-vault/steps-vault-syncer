/** Characters Windows forbids in names, plus control characters; macOS and Linux accept everything Windows does. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what this must remove
const FORBIDDEN_CHARACTERS_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED_WINDOWS_NAMES = new Set(['CON', 'PRN', 'AUX', 'NUL', ...range(1, 9).flatMap((number) => [`COM${number}`, `LPT${number}`])]);
/** Keeps a full song path well under Windows' classic 260-character limit, even in a deep game folder. */
export const MAX_FOLDER_NAME_LENGTH = 64;

/**
 * A name that is safe as a folder on Windows, macOS and Linux and still reads like the original. `fallback` is used
 * when nothing usable is left (a title made only of forbidden characters).
 */
export function getSafeFolderName({ name, fallback }: { name: string; fallback: string }): string {
  const cleaned = name.normalize('NFC').replace(FORBIDDEN_CHARACTERS_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  const shortened = Array.from(cleaned).slice(0, MAX_FOLDER_NAME_LENGTH).join('');
  const withoutTrailingDots = shortened.replace(/[. ]+$/, '');
  if (withoutTrailingDots === '') return fallback;
  return isReservedWindowsName(withoutTrailingDots) ? `${withoutTrailingDots} _` : withoutTrailingDots;
}

/** `CON` and `con.txt` are both unusable on Windows. */
function isReservedWindowsName(name: string): boolean {
  const stem = name.split('.')[0] ?? '';
  return RESERVED_WINDOWS_NAMES.has(stem.trim().toUpperCase());
}

function range(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

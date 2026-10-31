/** Characters Windows forbids in names, plus control characters; macOS and Linux accept everything Windows does. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what this must remove
const FORBIDDEN_CHARACTERS_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED_WINDOWS_NAMES = new Set(['CON', 'PRN', 'AUX', 'NUL', ...range(1, 9).flatMap((number) => [`COM${number}`, `LPT${number}`])]);
// eslint-disable-next-line no-control-regex -- every character outside ASCII, control characters included
const NON_ASCII_CHARACTERS_PATTERN = /[^\u0000-\u007f]/g;
/** Keeps a full song path well under Windows' classic 260-character limit, even in a deep game folder. */
export const MAX_FOLDER_NAME_LENGTH = 64;

/**
 * A name that is safe as a folder on Windows, macOS and Linux, in English letters only: StepMania 5 on Windows opens
 * files through the system's code page, so a Hebrew or Japanese folder never loads on an English Windows. Accents come
 * off ("Beyoncé" becomes "Beyonce"). A name with no English letters at all keeps its own script, so songs without an
 * English-letter spelling still get folders of their own; `fallback` is used when nothing usable is left.
 */
export function getSafeFolderName({ name, fallback }: { name: string; fallback: string }): string {
  return getCleanFolderName(name.normalize('NFKD').replace(NON_ASCII_CHARACTERS_PATTERN, '')) ?? getCleanFolderName(name) ?? fallback;
}

/**
 * Like getSafeFolderName, but a name with no English letters at all gets `fallback` instead of keeping its own script:
 * for names Sync has no English-letter spelling of and that stand on their own, like a party list's folder.
 */
export function getEnglishLettersFolderName({ name, fallback }: { name: string; fallback: string }): string {
  return getCleanFolderName(name.normalize('NFKD').replace(NON_ASCII_CHARACTERS_PATTERN, '')) ?? fallback;
}

function getCleanFolderName(name: string): string | null {
  const cleaned = name.normalize('NFC').replace(FORBIDDEN_CHARACTERS_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  const shortened = Array.from(cleaned).slice(0, MAX_FOLDER_NAME_LENGTH).join('');
  const withoutTrailingDots = shortened.replace(/[. ]+$/, '');
  if (withoutTrailingDots === '') return null;
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

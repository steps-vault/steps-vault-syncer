/**
 * A place inside the game's Songs folder, as folder and file names from the top: `['Pop', 'Cheap Thrills',
 * 'Cheap Thrills.ssc']`. Names, never a joined string, so no separator or `..` can ever lead outside the folder.
 */
export type SongsPath = readonly string[];

const FORBIDDEN_NAMES = new Set(['', '.', '..']);
const SEPARATOR_PATTERN = /[\\/]/;

export class UnsafeSongsPathError extends Error {
  constructor(name: string) {
    super(`"${name}" can't be used as a folder or file name inside the Songs folder. This is a bug in Sync; please report it.`);
    this.name = 'UnsafeSongsPathError';
  }
}

export function buildSongsPath(...names: string[]): SongsPath {
  const unsafeName = names.find((name) => FORBIDDEN_NAMES.has(name) || SEPARATOR_PATTERN.test(name));
  if (unsafeName !== undefined) throw new UnsafeSongsPathError(unsafeName);
  return Object.freeze([...names]);
}

/** Windows and macOS treat `Pop` and `pop` as the same folder; we always compare as they do. */
export function getNameKey(name: string): string {
  return name.normalize('NFC').toLocaleLowerCase('en-US');
}

export function getPathKey(path: SongsPath): string {
  return path.map(getNameKey).join('/');
}

export function isSamePath({ first, second }: { first: SongsPath; second: SongsPath }): boolean {
  return getPathKey(first) === getPathKey(second);
}

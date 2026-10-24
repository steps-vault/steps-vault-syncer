import { execFile } from 'node:child_process';

/** Executables of the games Sync writes for; while one runs, it may hold song files open. */
const GAME_EXECUTABLE_PATTERN = /^"(stepmania[^"]*|itgmania[^"]*|outfox[^"]*)\.exe"/im;

/** Windows' own process list, read with tasklist (no shell, fixed arguments). Other systems: assume not running. */
export function isGameRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 10_000 }, (error, output) => {
      resolve(!error && GAME_EXECUTABLE_PATTERN.test(output));
    });
  });
}

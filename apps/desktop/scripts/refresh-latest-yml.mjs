// Signing changes the installer's bytes, so the update manifest (latest.yml) must carry the signed file's SHA-512 and
// size, or electron-updater refuses the download. Usage: node refresh-latest-yml.mjs <release folder>
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const releaseFolder = process.argv[2];
if (!releaseFolder) throw new Error('Give the release folder that holds latest.yml and the installer.');
const manifestPath = path.join(releaseFolder, 'latest.yml');
const manifest = await readFile(manifestPath, 'utf8');
const installerName = /^path: (.+)$/m.exec(manifest)?.[1]?.trim();
if (!installerName) throw new Error('latest.yml names no installer (no "path:" line).');
const installer = await readFile(path.join(releaseFolder, installerName));
const sha512 = createHash('sha512').update(installer).digest('base64');
const refreshed = manifest.replace(/^(\s*sha512: ).+$/gm, `$1${sha512}`).replace(/^(\s*size: )\d+$/m, `$1${String(installer.byteLength)}`);
await writeFile(manifestPath, refreshed);
console.log(`latest.yml now matches ${installerName} (${String(installer.byteLength)} bytes).`);

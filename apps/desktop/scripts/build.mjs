// Builds the app into dist/: the main process and the two preloads with esbuild (CommonJS, as Electron's sandboxed
// preloads need), and the two windows (index.html, audio.html) with Vite.
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as buildWithEsbuild } from 'esbuild';
import { build as buildWithVite } from 'vite';

const appFolder = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distFolder = path.join(appFolder, 'dist');

await rm(distFolder, { recursive: true, force: true });

const nodeBuildOptions = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron'], sourcemap: true, logLevel: 'warning' };
await buildWithEsbuild({ ...nodeBuildOptions, entryPoints: [path.join(appFolder, 'src/main/main.ts')], outfile: path.join(distFolder, 'main/main.cjs') });
for (const preloadName of ['app-preload', 'audio-preload']) {
  await buildWithEsbuild({ ...nodeBuildOptions, entryPoints: [path.join(appFolder, `src/preload/${preloadName}.ts`)], outfile: path.join(distFolder, `preload/${preloadName}.cjs`) });
}

await buildWithVite({
  root: path.join(appFolder, 'src/renderer'),
  base: './',
  logLevel: 'warn',
  build: {
    outDir: path.join(distFolder, 'renderer'),
    emptyOutDir: true,
    rollupOptions: { input: { index: path.join(appFolder, 'src/renderer/index.html'), audio: path.join(appFolder, 'src/renderer/audio.html') } },
  },
});

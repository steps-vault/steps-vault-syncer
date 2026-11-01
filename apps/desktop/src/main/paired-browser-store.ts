import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { safeStorage } from 'electron';
import type { PairedBrowser, PairedBrowserStore } from '@stepsvault/sync-core';

/**
 * The tokens of the browsers paired with the local bridge, encrypted like the device token (DPAPI on Windows). When
 * the system can't encrypt, they stay in memory only and the player pairs again after a restart: never plain text.
 */
export class SafePairedBrowserStore implements PairedBrowserStore {
  private readonly filePath: string;
  private browsersInMemory: PairedBrowser[] | null = null;

  constructor({ dataFolder }: { dataFolder: string }) {
    this.filePath = path.join(dataFolder, 'paired-browsers.bin');
  }

  async load(): Promise<PairedBrowser[]> {
    if (this.browsersInMemory) return this.browsersInMemory;
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return [];
    const encrypted = await readFile(this.filePath).catch(() => null);
    if (!encrypted) return [];
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(encrypted);
      const browsers = parsePairedBrowsers(JSON.parse(result));
      // The system rotated its key: save under the new one so the next start can still read the tokens.
      if (shouldReEncrypt) await this.save(browsers);
      this.browsersInMemory = browsers;
      return browsers;
    } catch {
      return [];
    }
  }

  async save(browsers: readonly PairedBrowser[]): Promise<void> {
    this.browsersInMemory = [...browsers];
    if (browsers.length === 0) {
      await rm(this.filePath, { force: true });
      return;
    }
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, await safeStorage.encryptStringAsync(JSON.stringify(browsers)));
  }
}

function parsePairedBrowsers(value: unknown): PairedBrowser[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { token, pairedAt } = entry as Record<string, unknown>;
    return typeof token === 'string' && token !== '' && typeof pairedAt === 'string' ? [{ token, pairedAt }] : [];
  });
}

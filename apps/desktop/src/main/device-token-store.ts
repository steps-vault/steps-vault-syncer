import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { safeStorage } from 'electron';

/**
 * The device token, encrypted with the operating system's own protection for this user (DPAPI on Windows). When
 * that isn't available, the token is kept in memory only and the player signs in again next time: it is never
 * written in plain text.
 */
export class DeviceTokenStore {
  private readonly filePath: string;
  private tokenInMemory: string | null = null;

  constructor({ dataFolder }: { dataFolder: string }) {
    this.filePath = path.join(dataFolder, 'device-token.bin');
  }

  async load(): Promise<string | null> {
    if (this.tokenInMemory) return this.tokenInMemory;
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return null;
    const encrypted = await readFile(this.filePath).catch(() => null);
    if (!encrypted) return null;
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(encrypted);
      // The system rotated its key: save under the new one so the next start can still read the token.
      if (shouldReEncrypt) await this.save(result);
      this.tokenInMemory = result;
      return result;
    } catch {
      return null;
    }
  }

  async save(token: string): Promise<void> {
    this.tokenInMemory = token;
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, await safeStorage.encryptStringAsync(token));
  }

  async clear(): Promise<void> {
    this.tokenInMemory = null;
    await rm(this.filePath, { force: true });
  }
}

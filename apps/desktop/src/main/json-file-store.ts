import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * One JSON file in the app's data folder (the installed-songs record, the settings). Written to a new file and
 * renamed over the old one, so a crash or power cut mid-write never leaves a half file Sync can't read.
 */
export class JsonFileStore<Value> {
  private readonly filePath: string;
  private readonly buildDefault: () => Value;
  private readonly parse: (value: unknown) => Value;

  constructor({ filePath, buildDefault, parse }: { filePath: string; buildDefault: () => Value; parse: (value: unknown) => Value }) {
    this.filePath = filePath;
    this.buildDefault = buildDefault;
    this.parse = parse;
  }

  async load(): Promise<Value> {
    const text = await readFile(this.filePath, 'utf8').catch(() => null);
    if (text === null) return this.buildDefault();
    try {
      return this.parse(JSON.parse(text));
    } catch {
      // A file Sync can't read is kept beside it for support, and Sync starts over. Songs it wrote before stay in the
      // game untouched: without the record their markers no longer match, so Sync treats them as the player's.
      await rename(this.filePath, `${this.filePath}.unreadable`).catch(() => undefined);
      return this.buildDefault();
    }
  }

  async save(value: Value): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const newFilePath = `${this.filePath}.new`;
    await writeFile(newFilePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(newFilePath, this.filePath);
  }
}

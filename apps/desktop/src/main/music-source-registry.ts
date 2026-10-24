import { createHash } from 'node:crypto';
import path from 'node:path';

export interface MusicSource {
  filePath: string;
  fileName: string;
}

/**
 * The only place that knows which file a sourceId means. The screens and the core only ever see sourceIds, so the
 * renderer can never ask the main process to read an arbitrary path. Ids come from the path, so a file picked for a
 * song keeps its id after a restart.
 */
export class MusicSourceRegistry {
  private readonly sourcesById = new Map<string, MusicSource>();

  register(filePath: string): string {
    const absolutePath = path.resolve(filePath);
    const sourceId = `file:${createHash('sha256').update(absolutePath.toLowerCase()).digest('hex').slice(0, 24)}`;
    this.sourcesById.set(sourceId, { filePath: absolutePath, fileName: path.basename(absolutePath) });
    return sourceId;
  }

  getSource(sourceId: string): MusicSource | undefined {
    return this.sourcesById.get(sourceId);
  }

  forget(sourceId: string): void {
    this.sourcesById.delete(sourceId);
  }
}

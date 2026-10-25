import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { HttpRequestError, type HttpResponse, type MultipartHttpClient, type MultipartHttpRequest, type MultipartPart } from '@stepsvault/sync-core';
import { fetchWithLimits, getUserAgentHeader, parseJsonAnswer } from './node-http-client';

const LINE_BREAK = '\r\n';

/** Finds the file a sourceId means; null for an id the app doesn't know. */
export type GetSourceFilePath = (sourceId: string) => string | null;

/** A piece of the body: text Sync wrote, or a file read from disk as it is sent. */
type BodyPiece = { kind: 'bytes'; bytes: Uint8Array } | { kind: 'file'; filePath: string; byteCount: number };

/**
 * Uploads files as multipart/form-data, streaming each file from disk so a large video never sits in memory. Files are
 * only ever found by sourceId, so nothing outside the app's known files can be sent.
 */
export class NodeMultipartHttpClient implements MultipartHttpClient {
  private readonly appVersion: string;
  private readonly getSourceFilePath: GetSourceFilePath;

  constructor({ appVersion, getSourceFilePath }: { appVersion: string; getSourceFilePath: GetSourceFilePath }) {
    this.appVersion = appVersion;
    this.getSourceFilePath = getSourceFilePath;
  }

  async requestJsonWithFiles(request: MultipartHttpRequest): Promise<HttpResponse<unknown>> {
    const boundary = `StepsVaultSync-${randomUUID()}`;
    const pieces = await this.buildBodyPieces({ parts: request.parts, boundary });
    const contentLength = pieces.reduce((total, piece) => total + (piece.kind === 'bytes' ? piece.bytes.byteLength : piece.byteCount), 0);
    const headers = { ...getUserAgentHeader(this.appVersion), ...request.headers, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': String(contentLength) };
    // Node's fetch streams an async iterable body only in half-duplex mode; the DOM types know neither.
    const init = { method: request.method, headers, body: streamBodyPieces(pieces), duplex: 'half' } as unknown as RequestInit;
    const answer = await fetchWithLimits({ url: request.url, init, timeoutMilliseconds: request.timeoutMilliseconds, maxResponseBytes: request.maxResponseBytes });
    return parseJsonAnswer({ answer, url: request.url });
  }

  private async buildBodyPieces({ parts, boundary }: { parts: readonly MultipartPart[]; boundary: string }): Promise<BodyPiece[]> {
    const pieces: BodyPiece[] = [];
    for (const part of parts) {
      pieces.push(buildTextPiece(`--${boundary}${LINE_BREAK}${buildPartHeaders(part)}${LINE_BREAK}`));
      pieces.push(part.kind === 'json' ? buildTextPiece(JSON.stringify(part.value)) : await this.buildFilePiece(part.sourceId));
      pieces.push(buildTextPiece(LINE_BREAK));
    }
    pieces.push(buildTextPiece(`--${boundary}--${LINE_BREAK}`));
    return pieces;
  }

  private async buildFilePiece(sourceId: string): Promise<BodyPiece> {
    const filePath = this.getSourceFilePath(sourceId);
    const fileStats = filePath === null ? null : await stat(filePath).catch(() => null);
    if (filePath === null || !fileStats?.isFile()) throw new HttpRequestError({ failure: 'network', message: 'The music file to send is gone. Pick it again.' });
    return { kind: 'file', filePath, byteCount: fileStats.size };
  }
}

function buildPartHeaders(part: MultipartPart): string {
  if (part.kind === 'json') return `Content-Disposition: form-data; name="${escapeHeaderValue(part.name)}"${LINE_BREAK}Content-Type: application/json${LINE_BREAK}`;
  return `Content-Disposition: form-data; name="${escapeHeaderValue(part.name)}"; filename="${escapeHeaderValue(part.fileName)}"${LINE_BREAK}Content-Type: ${part.contentType}${LINE_BREAK}`;
}

/** As browsers do for form uploads: a quote or a line break in a file name could otherwise end the header early. */
function escapeHeaderValue(value: string): string {
  return value.replace(/"/g, '%22').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function buildTextPiece(text: string): BodyPiece {
  return { kind: 'bytes', bytes: new TextEncoder().encode(text) };
}

async function* streamBodyPieces(pieces: readonly BodyPiece[]): AsyncGenerator<Uint8Array> {
  for (const piece of pieces) {
    if (piece.kind === 'bytes') {
      yield piece.bytes;
      continue;
    }
    for await (const chunk of createReadStream(piece.filePath)) yield chunk as Uint8Array;
  }
}

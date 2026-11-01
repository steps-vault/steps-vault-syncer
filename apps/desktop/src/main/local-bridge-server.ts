import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { FileHandle } from 'node:fs/promises';
import { pipeline } from 'node:stream';
import {
  handleLocalBridgeRequest,
  LOCAL_BRIDGE_HOST,
  MAX_LOCAL_BRIDGE_BODY_BYTES,
  type LocalBridgeRequest,
  type LocalBridgeRequestDependencies,
  type LocalBridgeResponse,
  type SongsPath,
} from '@stepsvault/sync-core';

/** Opens a song's file for sending; it must refuse anything outside the Songs folder (NodeSongsFolder does). */
export type OpenSongFile = (songsPath: SongsPath) => Promise<{ fileHandle: FileHandle; byteCount: number }>;

export interface LocalBridgeServerOptions {
  dependencies: Omit<LocalBridgeRequestDependencies, 'port'>;
  openSongFile: OpenSongFile;
  /** Tried in order; the first free one is used. */
  ports: readonly number[];
}

const REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const HEADERS_TIMEOUT_MILLISECONDS = 10_000;
const LOOPBACK_REMOTE_ADDRESSES = new Set(['127.0.0.1', '::ffff:127.0.0.1']);

class RequestBodyTooLargeError extends Error {}

/**
 * The local bridge's HTTP server, on 127.0.0.1 only (never 0.0.0.0 or ::), so no other computer can reach it. Every
 * decision is made by handleLocalBridgeRequest in the core; this only moves bytes between Node and it.
 */
export class LocalBridgeServer {
  private readonly options: LocalBridgeServerOptions;
  private server: Server | null = null;
  private listeningPort: number | null = null;

  constructor(options: LocalBridgeServerOptions) {
    this.options = options;
  }

  get port(): number | null {
    return this.listeningPort;
  }

  /** The port it listens on, or null when every port is taken. */
  async start(): Promise<number | null> {
    for (const port of this.options.ports) {
      const server = await listenOnLoopback({ port, handleRequest: (request, response) => void this.answer({ request, response, port }) }).catch(() => null);
      if (!server) continue;
      this.server = server;
      this.listeningPort = port;
      return port;
    }
    return null;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.listeningPort = null;
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => { resolve(); }));
  }

  private async answer({ request, response, port }: { request: IncomingMessage; response: ServerResponse; port: number }): Promise<void> {
    try {
      // Bound to loopback, so this never happens; checked anyway in case the binding is ever changed by mistake.
      if (!LOOPBACK_REMOTE_ADDRESSES.has(request.socket.remoteAddress ?? '')) {
        request.socket.destroy();
        return;
      }
      const bridgeRequest = await readBridgeRequest(request);
      const bridgeResponse = await handleLocalBridgeRequest({ request: bridgeRequest, dependencies: { ...this.options.dependencies, port } });
      await this.send({ response, bridgeResponse });
    } catch (error) {
      sendPlainError({ response, status: error instanceof RequestBodyTooLargeError ? 413 : 500 });
    }
  }

  private async send({ response, bridgeResponse }: { response: ServerResponse; bridgeResponse: LocalBridgeResponse }): Promise<void> {
    const { status, headers, body } = bridgeResponse;
    if (body.kind === 'empty') {
      response.writeHead(status, headers).end();
      return;
    }
    if (body.kind === 'json') {
      const text = JSON.stringify(body.value);
      response.writeHead(status, { ...headers, 'Content-Length': String(Buffer.byteLength(text)) }).end(text);
      return;
    }
    const { fileHandle, byteCount } = await this.options.openSongFile(body.file.songsPath).catch(() => ({ fileHandle: null, byteCount: 0 }));
    if (!fileHandle) {
      // The file went away (or turned into a link) between the check and the read.
      response.writeHead(404, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ protocol: 1, reason: 'not-found', error: 'Sync has no such song or file. Reload the page to see your songs again.' }));
      return;
    }
    response.writeHead(status, { ...headers, 'Content-Length': String(byteCount) });
    // pipeline closes the file when the browser goes away mid-song, not only at the end.
    pipeline(fileHandle.createReadStream(), response, () => undefined);
  }
}

function listenOnLoopback({ port, handleRequest }: { port: number; handleRequest: (request: IncomingMessage, response: ServerResponse) => void }): Promise<Server> {
  const server = createServer({ requestTimeout: REQUEST_TIMEOUT_MILLISECONDS, headersTimeout: HEADERS_TIMEOUT_MILLISECONDS }, handleRequest);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: LOCAL_BRIDGE_HOST, port, exclusive: true }, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

async function readBridgeRequest(request: IncomingMessage): Promise<LocalBridgeRequest> {
  return {
    method: request.method ?? 'GET',
    target: request.url ?? '/',
    origin: getSingleHeader(request.headers.origin),
    host: getSingleHeader(request.headers.host),
    authorization: getSingleHeader(request.headers.authorization),
    isPrivateNetworkPreflight: getSingleHeader(request.headers['access-control-request-private-network']) === 'true',
    bodyText: request.method === 'POST' ? await readBodyText(request) : null,
  };
}

function getSingleHeader(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function readBodyText(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let byteCount = 0;
    request.on('data', (chunk: Buffer) => {
      byteCount += chunk.length;
      if (byteCount > MAX_LOCAL_BRIDGE_BODY_BYTES) {
        reject(new RequestBodyTooLargeError());
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')); });
    request.on('error', reject);
  });
}

function sendPlainError({ response, status }: { response: ServerResponse; status: number }): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end();
}

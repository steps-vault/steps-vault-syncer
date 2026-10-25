import { createWriteStream } from 'node:fs';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HttpRequestError } from '@stepsvault/sync-core';

/**
 * Streams one file to disk with Node's own http/https, not fetch: fetch's parser fails an internal check
 * (`assert(!this.paused)`) and crashes the whole main process when a server closes the connection while the download
 * waits for the disk, which an addon on 127.0.0.1 that closes after each file did on the first end-to-end run.
 * No redirects (a service can't send Sync somewhere else), a size limit and an idle time limit.
 */
export async function downloadToFile({ url, filePath, maxBytes, headers, idleTimeoutMilliseconds }: { url: string; filePath: string; maxBytes: number; headers: Record<string, string>; idleTimeoutMilliseconds: number }): Promise<void> {
  const response = await openDownload({ url, headers, idleTimeoutMilliseconds });
  if (response.statusCode !== 200) {
    response.resume();
    throw new HttpRequestError({ failure: 'network', message: `${url} answered ${String(response.statusCode)}.` });
  }
  await pipeline(response, buildSizeLimit({ url, maxBytes }), createWriteStream(filePath));
}

function openDownload({ url, headers, idleTimeoutMilliseconds }: { url: string; headers: Record<string, string>; idleTimeoutMilliseconds: number }): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const address = new URL(url);
    const client = address.protocol === 'https:' ? https : http;
    const request = client.get(address, { headers }, resolve);
    request.setTimeout(idleTimeoutMilliseconds, () => {
      request.destroy(new HttpRequestError({ failure: 'timeout', message: `${url} stopped sending.` }));
    });
    request.on('error', reject);
  });
}

function buildSizeLimit({ url, maxBytes }: { url: string; maxBytes: number }): Transform {
  let totalBytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        callback(new HttpRequestError({ failure: 'too-large', message: `${url} sent more than ${String(maxBytes)} bytes.` }));
        return;
      }
      callback(null, chunk);
    },
  });
}

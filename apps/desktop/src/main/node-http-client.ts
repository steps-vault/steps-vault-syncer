import { HttpRequestError, type HttpClient, type HttpRequest, type HttpResponse } from '@stepsvault/sync-core';

const USER_AGENT = 'StepsVaultSync';

/** The network for the desktop app: Node's fetch, with a timeout and a size limit that stop a bad server early. */
export class NodeHttpClient implements HttpClient {
  private readonly appVersion: string;

  constructor({ appVersion }: { appVersion: string }) {
    this.appVersion = appVersion;
  }

  async requestJson(request: HttpRequest): Promise<HttpResponse<unknown>> {
    const { status, bytes } = await this.fetchBytes(request);
    if (bytes.byteLength === 0) return { status, body: null };
    try {
      return { status, body: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
    } catch (error) {
      throw new HttpRequestError({ failure: 'not-json', message: `${request.url} did not answer with JSON.`, cause: error });
    }
  }

  async requestText(request: HttpRequest): Promise<HttpResponse<string>> {
    const { status, bytes } = await this.fetchBytes(request);
    return { status, body: new TextDecoder().decode(bytes) };
  }

  async requestBytes(request: HttpRequest): Promise<HttpResponse<Uint8Array>> {
    const { status, bytes } = await this.fetchBytes(request);
    return { status, body: bytes };
  }

  private async fetchBytes(request: HttpRequest): Promise<{ status: number; bytes: Uint8Array }> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, request.timeoutMilliseconds);
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: { 'User-Agent': `${USER_AGENT}/${this.appVersion}`, ...(request.jsonBody === undefined ? {} : { 'Content-Type': 'application/json' }), ...request.headers },
        body: request.jsonBody === undefined ? undefined : JSON.stringify(request.jsonBody),
        signal: controller.signal,
        redirect: 'error',
      });
      return { status: response.status, bytes: await readLimitedBody({ response, maxBytes: request.maxResponseBytes, url: request.url }) };
    } catch (error) {
      if (error instanceof HttpRequestError) throw error;
      const isTimeout = controller.signal.aborted;
      throw new HttpRequestError({ failure: isTimeout ? 'timeout' : 'network', message: isTimeout ? `${request.url} took too long to answer.` : `${request.url} could not be reached.`, cause: error });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Stops reading as soon as the answer is too big, instead of loading it all first. */
async function readLimitedBody({ response, maxBytes, url }: { response: Response; maxBytes: number; url: string }): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  if (!response.body) return new Uint8Array(0);
  for await (const chunk of response.body) {
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBytes) {
      await response.body.cancel().catch(() => undefined);
      throw new HttpRequestError({ failure: 'too-large', message: `${url} sent more than ${String(maxBytes)} bytes.` });
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

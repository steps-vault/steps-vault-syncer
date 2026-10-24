/** Why a request failed, so callers can tell "offline" from "the answer was wrong". */
export type HttpFailure = 'timeout' | 'network' | 'too-large' | 'not-json';

export class HttpRequestError extends Error {
  readonly failure: HttpFailure;

  constructor({ failure, message, cause }: { failure: HttpFailure; message: string; cause?: unknown }) {
    super(message, { cause });
    this.name = 'HttpRequestError';
    this.failure = failure;
  }
}

export interface HttpResponse<Body> {
  status: number;
  body: Body;
}

export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST';
  headers?: Readonly<Record<string, string>>;
  jsonBody?: unknown;
  timeoutMilliseconds: number;
  /** Larger answers are cut off and fail with 'too-large', so a broken or hostile server can't fill memory. */
  maxResponseBytes: number;
}

/**
 * The network, as Sync uses it. The website and the app implement it with `fetch` plus an AbortController for the
 * timeout and a byte counter for the size limit. Every non-network failure throws HttpRequestError; any HTTP status
 * (404, 500…) is returned, not thrown.
 */
export interface HttpClient {
  requestJson(request: HttpRequest): Promise<HttpResponse<unknown>>;
  requestText(request: HttpRequest): Promise<HttpResponse<string>>;
  requestBytes(request: HttpRequest): Promise<HttpResponse<Uint8Array>>;
}

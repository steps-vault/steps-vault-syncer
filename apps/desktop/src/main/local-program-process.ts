import { spawn, type ChildProcess } from 'node:child_process';
import { HttpRequestError, type HttpClient, type HttpRequest, type HttpResponse, type MultipartHttpClient, type MultipartHttpRequest } from '@stepsvault/sync-core';
import type { LocalProgramStarter, RunningProgram } from './local-program-starter';

const MANIFEST_CHECK_TIMEOUT_MILLISECONDS = 2_000;
const MAX_MANIFEST_CHECK_BYTES = 64 * 1024;
const STOP_WAIT_MILLISECONDS = 5_000;

/**
 * Runs the player's command through the system's shell, exactly as typed, in the given folder, with no window and no
 * input. Stopping it stops everything it started too (a .cmd file usually starts another program).
 */
export function startProgramWithShell({ command, folder }: { command: string; folder: string }): RunningProgram {
  const isWindows = process.platform === 'win32';
  const child = spawn(command, { shell: true, cwd: folder, windowsHide: true, stdio: 'ignore', detached: !isWindows });
  child.on('error', () => undefined);
  return { stop: () => stopProcessTree(child), hasExited: () => child.exitCode !== null || child.signalCode !== null };
}

async function stopProcessTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  // A program that ignores the stop, or exits just before it, must not keep Sync waiting.
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => { resolve(); });
    setTimeout(resolve, STOP_WAIT_MILLISECONDS);
  });
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => undefined);
  else process.kill(-child.pid, 'SIGTERM');
  await exited;
}

/** True when the address answers its manifest; used to tell when a program finished starting. */
export async function isServiceAnswering({ httpClient, baseUrl }: { httpClient: HttpClient; baseUrl: string }): Promise<boolean> {
  const answer = await httpClient.requestText({ url: `${baseUrl}/manifest.json`, method: 'GET', timeoutMilliseconds: MANIFEST_CHECK_TIMEOUT_MILLISECONDS, maxResponseBytes: MAX_MANIFEST_CHECK_BYTES }).catch(() => null);
  return answer?.status === 200;
}

/**
 * The network as addons and generators see it: before each request to a program on this computer that has a start
 * command, the program is started if it isn't running. A program that won't start counts as not answering.
 */
export class StartingHttpClient implements HttpClient, MultipartHttpClient {
  private readonly httpClient: HttpClient;
  private readonly multipartHttpClient: MultipartHttpClient;
  private readonly starter: LocalProgramStarter;

  constructor({ httpClient, multipartHttpClient, starter }: { httpClient: HttpClient; multipartHttpClient: MultipartHttpClient; starter: LocalProgramStarter }) {
    this.httpClient = httpClient;
    this.multipartHttpClient = multipartHttpClient;
    this.starter = starter;
  }

  async requestJson(request: HttpRequest): Promise<HttpResponse<unknown>> {
    await this.startProgramFor(request.url);
    return this.httpClient.requestJson(request);
  }

  async requestText(request: HttpRequest): Promise<HttpResponse<string>> {
    await this.startProgramFor(request.url);
    return this.httpClient.requestText(request);
  }

  async requestBytes(request: HttpRequest): Promise<HttpResponse<Uint8Array>> {
    await this.startProgramFor(request.url);
    return this.httpClient.requestBytes(request);
  }

  async requestJsonWithFiles(request: MultipartHttpRequest): Promise<HttpResponse<unknown>> {
    await this.startProgramFor(request.url);
    return this.multipartHttpClient.requestJsonWithFiles(request);
  }

  private async startProgramFor(url: string): Promise<void> {
    try {
      await this.starter.ensureRunningFor(url);
    } catch (error) {
      throw new HttpRequestError({ failure: 'network', message: error instanceof Error ? error.message : `${url} could not be started.`, cause: error });
    }
  }
}

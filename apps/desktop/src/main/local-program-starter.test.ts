import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { HttpRequestError, type HttpClient, type HttpRequest } from '@stepsvault/sync-core';
import { StartingHttpClient } from './local-program-process';
import { getStartCommandFolder, IDLE_STOP_MILLISECONDS, LocalProgramStarter, type LocalProgramPorts, type RunningProgram } from './local-program-starter';

const BASE_URL = 'http://127.0.0.1:7700';
const MINUTE = 60_000;

/** A fake computer: a clock the test moves, and programs that start answering after `startupMilliseconds`. */
function buildFakeComputer({ startupMilliseconds = 1_000, isAlreadyAnswering = false }: { startupMilliseconds?: number | null; isAlreadyAnswering?: boolean } = {}) {
  const clock = { now: 0 };
  const startedCommands: { command: string; folder: string }[] = [];
  const programs: { isRunning: boolean; startedAt: number }[] = [];
  const ports: LocalProgramPorts = {
    startProgram: (options) => {
      startedCommands.push(options);
      const program = { isRunning: true, startedAt: clock.now };
      programs.push(program);
      const runningProgram: RunningProgram = { stop: () => { program.isRunning = false; return Promise.resolve(); }, hasExited: () => !program.isRunning };
      return runningProgram;
    },
    isAnswering: () => Promise.resolve(isAlreadyAnswering || programs.some((program) => program.isRunning && startupMilliseconds !== null && clock.now - program.startedAt >= startupMilliseconds)),
    getNowMilliseconds: () => clock.now,
    waitMilliseconds: (milliseconds) => { clock.now += milliseconds; return Promise.resolve(); },
  };
  return { clock, startedCommands, programs, starter: new LocalProgramStarter({ ports }) };
}

describe('LocalProgramStarter', () => {
  it('runs exactly the player’s command, in its own folder, only when the program isn’t answering', async () => {
    const { startedCommands, starter } = buildFakeComputer();
    starter.setStartCommand({ baseUrl: BASE_URL, command: '"C:/addons/tube songs/start.cmd" --port 7700' });
    await starter.ensureRunningFor(`${BASE_URL}/manifest.json`);
    await starter.ensureRunningFor(`${BASE_URL}/song-source`);
    await starter.ensureRunningFor('http://127.0.0.1:7701/manifest.json');
    expect(startedCommands).toEqual([{ command: '"C:/addons/tube songs/start.cmd" --port 7700', folder: 'C:/addons/tube songs' }]);
  });

  it('starts nothing for an address without a start command, or a program the player already runs', async () => {
    const { startedCommands, starter } = buildFakeComputer({ isAlreadyAnswering: true });
    await starter.ensureRunningFor(`${BASE_URL}/manifest.json`);
    starter.setStartCommand({ baseUrl: BASE_URL, command: 'C:/addons/start.cmd' });
    await starter.ensureRunningFor(`${BASE_URL}/manifest.json`);
    expect(startedCommands).toEqual([]);
  });

  it('stops a program after 10 minutes without a request, counting from the last request', async () => {
    const { clock, programs, starter } = buildFakeComputer();
    starter.setStartCommand({ baseUrl: BASE_URL, command: 'C:/addons/start.cmd' });
    await starter.ensureRunningFor(`${BASE_URL}/jobs`);
    clock.now += 6 * MINUTE;
    await starter.ensureRunningFor(`${BASE_URL}/jobs/a1`);
    clock.now += 9 * MINUTE;
    await starter.stopIdlePrograms();
    expect(programs[0]?.isRunning).toBe(true);
    clock.now += IDLE_STOP_MILLISECONDS - 9 * MINUTE;
    await starter.stopIdlePrograms();
    expect(programs[0]?.isRunning).toBe(false);
  });

  it('starts the program again after it stopped', async () => {
    const { clock, programs, starter } = buildFakeComputer();
    starter.setStartCommand({ baseUrl: BASE_URL, command: 'C:/addons/start.cmd' });
    await starter.ensureRunningFor(`${BASE_URL}/jobs`);
    clock.now += IDLE_STOP_MILLISECONDS;
    await starter.stopIdlePrograms();
    await starter.ensureRunningFor(`${BASE_URL}/jobs`);
    expect(programs.map((program) => program.isRunning)).toEqual([false, true]);
  });

  it('gives up after 30 seconds without an answer, stops the program, and says what to do', async () => {
    const { programs, starter } = buildFakeComputer({ startupMilliseconds: null });
    starter.setStartCommand({ baseUrl: BASE_URL, command: 'C:/addons/start.cmd' });
    await expect(starter.ensureRunningFor(`${BASE_URL}/manifest.json`)).rejects.toThrow('didn’t answer within 30 seconds of starting. Check its start command, or start it yourself.');
    expect(programs[0]?.isRunning).toBe(false);
  });

  it('starts a program once when several requests need it at the same time', async () => {
    const { startedCommands, starter } = buildFakeComputer();
    starter.setStartCommand({ baseUrl: BASE_URL, command: 'C:/addons/start.cmd' });
    await Promise.all([starter.ensureRunningFor(`${BASE_URL}/a`), starter.ensureRunningFor(`${BASE_URL}/b`)]);
    expect(startedCommands).toHaveLength(1);
  });

  it('stops everything it started when Sync quits', async () => {
    const { programs, starter } = buildFakeComputer();
    starter.setStartCommand({ baseUrl: BASE_URL, command: 'C:/addons/start.cmd' });
    await starter.ensureRunningFor(`${BASE_URL}/a`);
    await starter.stopAll();
    expect(programs[0]?.isRunning).toBe(false);
  });
});

describe('getStartCommandFolder', () => {
  it.each([
    ['C:/addons/youtube/start.cmd', 'C:/addons/youtube'],
    ['"C:\\Program Files\\Tap Forge\\tap-forge.exe" --serve', 'C:\\Program Files\\Tap Forge'],
    ['node server.js', os.homedir()],
  ])('runs %j in %j', (command, folder) => {
    expect(getStartCommandFolder(command)).toBe(folder);
  });
});

describe('StartingHttpClient', () => {
  it('turns a program that won’t start into a request that isn’t answered', async () => {
    const { starter } = buildFakeComputer({ startupMilliseconds: null });
    starter.setStartCommand({ baseUrl: BASE_URL, command: 'C:/addons/start.cmd' });
    const requests: HttpRequest[] = [];
    const innerClient: HttpClient = { requestJson: (request) => { requests.push(request); return Promise.resolve({ status: 200, body: {} }); }, requestText: () => Promise.reject(new Error('unused')), requestBytes: () => Promise.reject(new Error('unused')) };
    const client = new StartingHttpClient({ httpClient: innerClient, multipartHttpClient: { requestJsonWithFiles: () => Promise.reject(new Error('unused')) }, starter });
    await expect(client.requestJson({ url: `${BASE_URL}/manifest.json`, method: 'GET', timeoutMilliseconds: 1, maxResponseBytes: 1 })).rejects.toThrow(HttpRequestError);
    expect(requests).toEqual([]);
    await client.requestJson({ url: 'https://addon.example.org/manifest.json', method: 'GET', timeoutMilliseconds: 1, maxResponseBytes: 1 });
    expect(requests).toHaveLength(1);
  });
});

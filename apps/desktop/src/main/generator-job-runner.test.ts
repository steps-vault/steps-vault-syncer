import { describe, expect, it } from 'vitest';
import {
  buildEmptyInstalledSongsRecord,
  buildInstalledGenerator,
  getGeneratedSongs,
  MemorySongsFolder,
  withMusicUploadConsent,
  writeGeneratedSong,
  type GeneratedSongActivityEvent,
  type GeneratedSongFiles,
  type GeneratorManifest,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
  type InstalledSongsRecord,
  type MultipartHttpClient,
  type MultipartHttpRequest,
  type SavedGeneratorJob,
  type VaultSongIdentity,
} from '@stepsvault/sync-core';
import { GeneratorJobRunner, type GeneratorJobStart, type JobGenerator } from './generator-job-runner';

const COMMUNITY_ADDRESS = 'http://127.0.0.1:7700';
const STEPSVAULT_ADDRESS = 'https://stepsvault.example.com/api/generator';
const SIGN_IN = { siteUrl: 'https://stepsvault.example.com', deviceToken: 'device-token-1' };
const MANIFEST: GeneratorManifest = { protocol: 1, kind: 'generator', id: 'stepcat.tap-forge', name: 'Tap Forge', version: '1.2.0', author: '@stepcat', description: '', difficulties: ['Easy', 'Medium'], musicTypes: ['audio/ogg'], usesVideo: false, maxMusicBytes: 1_000_000, options: [] };
const STEPSVAULT_MANIFEST: GeneratorManifest = { ...MANIFEST, id: 'stepsvault.generator', name: 'StepsVault' };
const CHART_TEXT = ['#TITLE:Night Drive;', '#OFFSET:0;', '#BPMS:0=120;', '', '#NOTEDATA:;', '#STEPSTYPE:dance-single;', '#DIFFICULTY:Easy;', '#NOTES:', '1000', ';', ''].join('\n');
const NIGHT_DRIVE = { title: 'Night Drive', artist: 'Lumen Park', album: null, genre: null, lengthSeconds: 201, youtubeId: null };

type Route = (request: HttpRequest | MultipartHttpRequest) => HttpResponse<unknown>;

/** A recorded generator: each "METHOD url" answers from its route; every request is remembered. */
class RecordedGenerators implements HttpClient, MultipartHttpClient {
  readonly requests: { method: string; url: string; headers: Readonly<Record<string, string>> }[] = [];
  readonly routesByKey = new Map<string, Route>();

  route({ method, url, answer }: { method: string; url: string; answer: Route | HttpResponse<unknown> }): void {
    this.routesByKey.set(`${method} ${url}`, typeof answer === 'function' ? answer : () => answer);
  }

  requestJson(request: HttpRequest): Promise<HttpResponse<unknown>> {
    return Promise.resolve(this.answer(request));
  }

  requestText(request: HttpRequest): Promise<HttpResponse<string>> {
    return Promise.resolve(this.answer(request) as HttpResponse<string>);
  }

  requestBytes(): Promise<HttpResponse<Uint8Array>> {
    return Promise.reject(new Error('Not used.'));
  }

  requestJsonWithFiles(request: MultipartHttpRequest): Promise<HttpResponse<unknown>> {
    return Promise.resolve(this.answer(request));
  }

  private answer(request: HttpRequest | MultipartHttpRequest): HttpResponse<unknown> {
    this.requests.push({ method: request.method, url: request.url, headers: request.headers ?? {} });
    const route = this.routesByKey.get(`${request.method} ${request.url}`);
    if (!route) throw new Error(`No route for ${request.method} ${request.url}`);
    return route(request);
  }
}

/** The app around the runner: a game in memory, saved jobs, the Activity log and the vault. */
class FakeApp {
  readonly generators = new RecordedGenerators();
  readonly songsFolder = new MemorySongsFolder();
  readonly activity: GeneratedSongActivityEvent[] = [];
  readonly removedJobKeys: string[] = [];
  readonly vaultSongsAddedForJobs: [string, string | null][] = [];
  readonly songsAddedToVault: string[] = [];
  readonly reportsBySongKey = new Map<string, string>();
  readonly collectedFilesByLocation = new Map<string, GeneratedSongFiles>();
  savedJobs: SavedGeneratorJob[] = [];
  record: InstalledSongsRecord = buildEmptyInstalledSongsRecord();
  vaultSongs: VaultSongIdentity[] = [];
  generatorsByAddress = new Map<string, JobGenerator>([
    [COMMUNITY_ADDRESS, { generator: buildInstalledGenerator({ baseUrl: COMMUNITY_ADDRESS, manifest: MANIFEST }), signIn: null, isStepsVault: false }],
    [STEPSVAULT_ADDRESS, { generator: withMusicUploadConsent({ generator: buildInstalledGenerator({ baseUrl: STEPSVAULT_ADDRESS, manifest: STEPSVAULT_MANIFEST }), consentedAt: '2026-10-25T09:00:00.000Z' }), signIn: SIGN_IN, isStepsVault: true }],
  ]);
  private changeCount = 0;

  constructor() {
    this.songsFolder.addMusicSource({ sourceId: 'file:C:\\Music\\Night Drive.ogg', bytes: new Uint8Array([79, 103, 103, 83]) });
  }

  buildRunner(): GeneratorJobRunner {
    return new GeneratorJobRunner({
      httpClient: this.generators,
      multipartHttpClient: this.generators,
      jobStore: { load: () => Promise.resolve(this.savedJobs), save: (jobs) => { this.savedJobs = jobs; return Promise.resolve(); } },
      jobFiles: {
        buildDownloadGeneratorFile: () => () => Promise.reject(new Error('This generator sends only a song file.')),
        saveCollectedFiles: ({ jobKey, files }) => { this.collectedFilesByLocation.set(`files:${jobKey}`, files); return Promise.resolve(`files:${jobKey}`); },
        loadCollectedFiles: (location) => Promise.resolve(this.collectedFilesByLocation.get(location) ?? { chartText: '', reportText: null, sourceIdByKind: {} }),
        removeJobFiles: (jobKey) => { this.removedJobKeys.push(jobKey); return Promise.resolve(); },
      },
      findGenerator: (baseUrl) => this.generatorsByAddress.get(baseUrl) ?? null,
      registerPlayerFile: (location) => `file:${location}`,
      writeSong: async ({ request, vaultSongChoice }) => {
        const result = await writeGeneratedSong({ dependencies: { songsFolder: this.songsFolder, readDownloadedPicture: () => Promise.resolve(new Uint8Array()), pictureMaker: null, createId: () => `install-${String(this.changeCount)}`, getNow: () => '2026-10-25T10:00:00.000Z' }, record: this.record, request, vaultSongs: this.vaultSongs, vaultSongChoice });
        if (result.kind !== 'needs-vault-choice') this.record = result.record;
        return result;
      },
      saveReport: ({ songKey, reportText }) => { this.reportsBySongKey.set(songKey, reportText); return Promise.resolve(); },
      addSongToVault: (vaultSongId) => {
        if (vaultSongId === 'song_unknown') return Promise.reject(new Error('This song isn’t in StepsVault.'));
        this.songsAddedToVault.push(vaultSongId);
        return Promise.resolve();
      },
      addVaultSongToGame: ({ job, vaultSongId }) => { this.vaultSongsAddedForJobs.push([job.jobKey, vaultSongId]); return Promise.resolve(); },
      logActivity: (event) => { this.activity.push(event); return Promise.resolve(); },
      // A real turn of the event loop, so a job that keeps waiting never starves the test's own timers.
      waitMilliseconds: () => new Promise((resolve) => setTimeout(resolve, 0)),
      getNow: () => '2026-10-25T10:00:00.000Z',
      onChange: () => { this.changeCount += 1; },
    });
  }

  routeFinishedJob({ address, files = [{ kind: 'chart', url: `${address}/files/chart.ssc`, bytes: 200 }] }: { address: string; files?: { kind: string; url: string; bytes: number }[] }): void {
    this.generators.route({ method: 'POST', url: `${address}/jobs`, answer: { status: 202, body: { jobId: 'job-a1', retryAfterSeconds: 1 } } });
    this.generators.route({ method: 'GET', url: `${address}/jobs/job-a1`, answer: { status: 200, body: { state: 'done', files } } });
    this.generators.route({ method: 'GET', url: `${address}/files/chart.ssc`, answer: { status: 200, body: CHART_TEXT } });
    this.generators.route({ method: 'GET', url: `${address}/files/report.md`, answer: { status: 200, body: '# How it was made' } });
  }
}

function buildStart(overrides: Partial<GeneratorJobStart> = {}): GeneratorJobStart {
  return {
    jobKey: 'job-1', generatorBaseUrl: COMMUNITY_ADDRESS, song: NIGHT_DRIVE, difficulties: ['Easy'], music: { sourceId: 'file:C:\\Music\\Night Drive.ogg', fileName: 'Night Drive.ogg', contentType: 'audio/ogg', bytes: 4 }, video: null,
    playerMusicLocation: 'C:\\Music\\Night Drive.ogg', playerVideoLocation: null, ...overrides,
  };
}

async function waitUntil(isDone: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200 && !isDone(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  expect(isDone()).toBe(true);
}

describe('GeneratorJobRunner', () => {
  it('sends the song, waits for it, writes it into My generated songs, keeps how it was made and removes the downloads', async () => {
    const app = new FakeApp();
    app.routeFinishedJob({ address: COMMUNITY_ADDRESS, files: [{ kind: 'chart', url: `${COMMUNITY_ADDRESS}/files/chart.ssc`, bytes: 200 }, { kind: 'report', url: `${COMMUNITY_ADDRESS}/files/report.md`, bytes: 20 }] });
    const runner = app.buildRunner();
    await runner.initialize();
    await runner.startJob(buildStart());
    await waitUntil(() => runner.jobs[0]?.state === 'done');
    expect(runner.jobs[0]).toMatchObject({ jobId: 'job-a1', state: 'done', result: 'written', generatorId: 'stepcat.tap-forge' });
    expect(getGeneratedSongs(app.record).map((song) => song.folderPath)).toEqual([['My generated songs', 'Night Drive']]);
    expect(app.reportsBySongKey.get('song:night drive\nlumen park')).toBe('# How it was made');
    expect(app.removedJobKeys).toEqual(['job-1']);
    expect(app.activity.map((event) => event.step)).toEqual(['started', 'written']);
    expect(app.savedJobs).toEqual(runner.jobs);
  });

  it('sends StepsVault’s generator the device token, and lets the vault install its song instead of writing it', async () => {
    const app = new FakeApp();
    app.routeFinishedJob({ address: STEPSVAULT_ADDRESS });
    app.generators.route({ method: 'GET', url: `${STEPSVAULT_ADDRESS}/jobs/job-a1`, answer: { status: 200, body: { state: 'done', vaultSongId: 'song_9' } } });
    const runner = app.buildRunner();
    await runner.initialize();
    await runner.startJob(buildStart({ generatorBaseUrl: STEPSVAULT_ADDRESS }));
    await waitUntil(() => runner.jobs[0]?.state === 'done');
    expect(runner.jobs[0]).toMatchObject({ isStepsVault: true, generatorName: 'dancedance.studio generator', result: 'added-to-vault' });
    expect(app.vaultSongsAddedForJobs).toEqual([['job-1', 'song_9']]);
    expect(app.songsAddedToVault).toEqual(['song_9']);
    expect(getGeneratedSongs(app.record)).toEqual([]);
    expect(app.generators.requests.map((request) => request.url)).not.toContain(`${STEPSVAULT_ADDRESS}/files/chart.ssc`);
    expect(app.generators.requests.every((request) => request.headers.Authorization === 'Bearer device-token-1')).toBe(true);
    expect(app.activity.map((event) => event.step)).toEqual(['started', 'added-to-vault']);
  });

  it('never sends the token to a community generator', async () => {
    const app = new FakeApp();
    app.routeFinishedJob({ address: COMMUNITY_ADDRESS });
    const runner = app.buildRunner();
    await runner.startJob(buildStart());
    await waitUntil(() => runner.jobs[0]?.state === 'done');
    expect(app.generators.requests.some((request) => 'Authorization' in request.headers)).toBe(false);
  });

  it('finds the vault song by its facts when StepsVault’s done answer doesn’t name it', async () => {
    const app = new FakeApp();
    app.routeFinishedJob({ address: STEPSVAULT_ADDRESS });
    const runner = app.buildRunner();
    await runner.startJob(buildStart({ generatorBaseUrl: STEPSVAULT_ADDRESS }));
    await waitUntil(() => runner.jobs[0]?.state === 'done');
    expect(app.vaultSongsAddedForJobs).toEqual([['job-1', null]]);
  });

  it('fails with the site’s sentence when the song StepsVault named can’t be added to the vault', async () => {
    const app = new FakeApp();
    app.generators.route({ method: 'POST', url: `${STEPSVAULT_ADDRESS}/jobs`, answer: { status: 409, body: { error: 'This song is already in the vault.', vaultSongId: 'song_unknown' } } });
    const runner = app.buildRunner();
    await runner.startJob(buildStart({ generatorBaseUrl: STEPSVAULT_ADDRESS }));
    await waitUntil(() => runner.jobs[0]?.state === 'failed');
    expect(runner.jobs[0]?.message).toBe('This song isn’t in StepsVault.');
    expect(app.vaultSongsAddedForJobs).toEqual([]);
  });

  it('adds the vault song when StepsVault already has the song, so no token is spent', async () => {
    const app = new FakeApp();
    app.generators.route({ method: 'POST', url: `${STEPSVAULT_ADDRESS}/jobs`, answer: { status: 409, body: { error: 'This song is already in the vault.', vaultSongId: 'song_7' } } });
    const runner = app.buildRunner();
    await runner.startJob(buildStart({ generatorBaseUrl: STEPSVAULT_ADDRESS }));
    await waitUntil(() => runner.jobs[0]?.state === 'done');
    expect(runner.jobs[0]).toMatchObject({ result: 'already-in-vault', message: 'This song is already in the vault.' });
    expect(app.songsAddedToVault).toEqual(['song_7']);
    expect(app.vaultSongsAddedForJobs).toEqual([['job-1', 'song_7']]);
  });

  it('asks which song to keep when the vault has the same song, then writes the player’s choice', async () => {
    const app = new FakeApp();
    app.vaultSongs = [{ vaultSongId: 'song_7', title: 'Night Drive', artist: 'Lumen Park', youtubeId: null }];
    app.routeFinishedJob({ address: COMMUNITY_ADDRESS });
    const runner = app.buildRunner();
    await runner.startJob(buildStart());
    await waitUntil(() => runner.jobs[0]?.state === 'needs-vault-choice');
    expect(runner.jobs[0]?.vaultChoice).toEqual({ vaultSongId: 'song_7', question: '“Night Drive” is already in the library. Keep the library song, or the one you made?' });
    expect(getGeneratedSongs(app.record)).toEqual([]);
    await runner.answerVaultChoice({ jobKey: 'job-1', choice: 'keep-generated-song' });
    expect(runner.jobs[0]).toMatchObject({ state: 'done', result: 'written', vaultChoice: null });
    expect(getGeneratedSongs(app.record)[0]?.inPlaceOfVaultSongId).toBe('song_7');
    expect(app.removedJobKeys).toEqual(['job-1']);
  });

  it('writes nothing when the player keeps the vault song', async () => {
    const app = new FakeApp();
    app.vaultSongs = [{ vaultSongId: 'song_7', title: 'Night Drive', artist: 'Lumen Park', youtubeId: null }];
    app.routeFinishedJob({ address: COMMUNITY_ADDRESS });
    const runner = app.buildRunner();
    await runner.startJob(buildStart());
    await waitUntil(() => runner.jobs[0]?.state === 'needs-vault-choice');
    await runner.answerVaultChoice({ jobKey: 'job-1', choice: 'keep-vault-song' });
    expect(runner.jobs[0]).toMatchObject({ state: 'done', result: 'kept-vault-song' });
    expect(getGeneratedSongs(app.record)).toEqual([]);
    expect(app.activity.map((event) => event.step)).toEqual(['started', 'kept-vault-song']);
  });

  it('shows the generator’s sentence when it can’t stop a job, and still finishes the song', async () => {
    const app = new FakeApp();
    let statusCount = 0;
    app.routeFinishedJob({ address: COMMUNITY_ADDRESS });
    app.generators.route({ method: 'GET', url: `${COMMUNITY_ADDRESS}/jobs/job-a1`, answer: () => { statusCount += 1; return statusCount < 3 ? { status: 200, body: { state: 'working', retryAfterSeconds: 1 } } : { status: 200, body: { state: 'done', files: [{ kind: 'chart', url: `${COMMUNITY_ADDRESS}/files/chart.ssc`, bytes: 200 }] } }; } });
    app.generators.route({ method: 'DELETE', url: `${COMMUNITY_ADDRESS}/jobs/job-a1`, answer: { status: 200, body: { cancelled: false, error: 'it is already being made.' } } });
    const runner = app.buildRunner();
    await runner.startJob(buildStart());
    await waitUntil(() => runner.jobs[0]?.state === 'waiting');
    await runner.cancelJob('job-1');
    await waitUntil(() => runner.jobs[0]?.state === 'done');
    expect(runner.jobs[0]?.message).toBe('Tap Forge couldn’t stop this song: it is already being made.');
    expect(app.activity.map((event) => event.step)).toEqual(['started', 'not-cancelled', 'written']);
  });

  it('cancels a job the generator could stop', async () => {
    const app = new FakeApp();
    app.routeFinishedJob({ address: COMMUNITY_ADDRESS });
    app.generators.route({ method: 'GET', url: `${COMMUNITY_ADDRESS}/jobs/job-a1`, answer: { status: 200, body: { state: 'working', stage: 'Placing the steps', retryAfterSeconds: 5 } } });
    app.generators.route({ method: 'DELETE', url: `${COMMUNITY_ADDRESS}/jobs/job-a1`, answer: { status: 200, body: { cancelled: true } } });
    const runner = app.buildRunner();
    await runner.startJob(buildStart());
    await waitUntil(() => runner.jobs[0]?.stage === 'Placing the steps');
    await runner.cancelJob('job-1');
    await waitUntil(() => runner.jobs[0]?.state === 'cancelled');
    expect(app.removedJobKeys).toEqual(['job-1']);
  });

  it('ends a job with the generator’s sentence when it refuses the song', async () => {
    const app = new FakeApp();
    app.generators.route({ method: 'POST', url: `${COMMUNITY_ADDRESS}/jobs`, answer: { status: 503, body: { error: 'Too busy right now.' } } });
    const runner = app.buildRunner();
    await runner.startJob(buildStart());
    await waitUntil(() => runner.jobs[0]?.state === 'failed');
    expect(runner.jobs[0]?.message).toBe('Tap Forge couldn’t take this song: Too busy right now.');
    expect(app.activity).toMatchObject([{ step: 'failed', message: 'Tap Forge couldn’t take this song: Too busy right now.' }]);
  });

  it('goes on asking about a job after a restart, and fails one that was still sending', async () => {
    const app = new FakeApp();
    app.routeFinishedJob({ address: COMMUNITY_ADDRESS });
    const waitingJob: SavedGeneratorJob = {
      jobKey: 'job-1', generatorBaseUrl: COMMUNITY_ADDRESS, generatorId: 'stepcat.tap-forge', generatorName: 'Tap Forge', generatorVersion: '1.2.0', isStepsVault: false, jobId: 'job-a1', song: NIGHT_DRIVE, difficulties: ['Easy'],
      state: 'waiting', progress: 0.5, stage: 'Placing the steps', retryAfterSeconds: 1, message: null, vaultChoice: null, result: null, playerMusicLocation: buildStart().playerMusicLocation, playerVideoLocation: null, collectedFilesLocation: null,
      startedAt: '2026-10-25T09:00:00.000Z', updatedAt: '2026-10-25T09:00:00.000Z',
    };
    app.savedJobs = [waitingJob, { ...waitingJob, jobKey: 'job-2', jobId: null, state: 'sending' }];
    const runner = app.buildRunner();
    await runner.initialize();
    await waitUntil(() => runner.jobs[0]?.state === 'done');
    expect(runner.jobs[1]).toMatchObject({ jobKey: 'job-2', state: 'failed' });
    expect(app.activity.map((event) => event.step)).toEqual(['resumed', 'written']);
  });

  it('can’t finish a job whose generator the player removed', async () => {
    const app = new FakeApp();
    app.routeFinishedJob({ address: COMMUNITY_ADDRESS });
    const runner = app.buildRunner();
    app.generatorsByAddress.delete(COMMUNITY_ADDRESS);
    await expect(runner.startJob(buildStart())).rejects.toThrow('That generator isn’t set up any more. Add it again under Generators.');
  });
});

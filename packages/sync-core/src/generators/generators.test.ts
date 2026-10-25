import { describe, expect, it } from 'vitest';
import { HttpRequestError, type HttpClient, type HttpRequest, type HttpResponse, type MultipartHttpClient, type MultipartHttpRequest } from '../network/http-client';
import { InvalidServiceAddressError } from '../network/service-address';
import { buildInstalledGenerator, fetchGeneratorManifest, getMusicUploadWarningOrNull, isGeneratorOnThisComputer, loadSavedGenerator, withMusicUploadConsent, type InstalledGenerator } from './generator-client';
import { GeneratorError } from './generator-error';
import { collectGeneratorFiles, type DownloadGeneratorFile } from './generator-files';
import { cancelGeneratorJob, startGeneratorJob, waitForGeneratorJob, type GeneratorUploadFile, type StartGeneratorJobOptions } from './generator-jobs';
import type { GeneratorManifest, GeneratorSongFacts } from './generator-protocol';

const LOCAL_ADDRESS = 'http://127.0.0.1:47900';
const REMOTE_ADDRESS = 'https://steps.example.org/onset';
const MANIFEST_ANSWER = {
  protocol: 1,
  kind: 'generator',
  id: 'example.onset-steps',
  name: 'Onset Steps',
  version: '0.1.0',
  author: 'you',
  description: 'Steps on the music’s onsets, arrows by simple rules.',
  difficulties: ['Beginner', 'Easy', 'Medium', 'Hard', 'Challenge'],
  musicTypes: ['audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/flac'],
  usesVideo: false,
  options: [{ id: 'style', label: 'Style', kind: 'choice', choices: [{ value: 'calm', label: 'Calm' }, { value: 'busy', label: 'Busy' }], default: 'calm' }],
};
const MANIFEST = { ...MANIFEST_ANSWER, maxMusicBytes: 100 * 1024 * 1024 } as GeneratorManifest;
const SONG: GeneratorSongFacts = { title: 'Pulse Garden', artist: 'Kairo Lights', album: null, genre: null, lengthSeconds: 201, youtubeId: null };
const MUSIC: GeneratorUploadFile = { sourceId: 'music-1', fileName: 'Pulse Garden.ogg', contentType: 'audio/ogg', bytes: 4_000_000 };
const VIDEO: GeneratorUploadFile = { sourceId: 'video-1', fileName: 'Pulse Garden.mp4', contentType: 'video/mp4', bytes: 30_000_000 };
const STEPSVAULT_ADDRESS = 'https://stepsvault.example.com/api/generator';
const SIGN_IN = { siteUrl: 'https://stepsvault.example.com', deviceToken: 'device-token-1' };
const CHART_TEXT = '#TITLE:Pulse Garden;\n#OFFSET:0;\n#BPMS:0=128;\n';

type RecordedAnswer = HttpResponse<unknown> | HttpRequestError;

/**
 * A recorded generator: answers each "METHOD url" with its next recorded answer, and remembers every request. A route
 * with one answer left keeps giving it, so a status can be asked again.
 */
class RecordedGenerator implements HttpClient, MultipartHttpClient {
  readonly requests: (HttpRequest | MultipartHttpRequest)[] = [];
  private readonly answersByRoute: Map<string, RecordedAnswer[]>;

  constructor(answersByRoute: Record<string, RecordedAnswer[]>) {
    this.answersByRoute = new Map(Object.entries(answersByRoute));
  }

  requestJson(request: HttpRequest): Promise<HttpResponse<unknown>> {
    return this.answer(request);
  }

  requestText(request: HttpRequest): Promise<HttpResponse<string>> {
    return this.answer(request) as Promise<HttpResponse<string>>;
  }

  requestBytes(): Promise<HttpResponse<Uint8Array>> {
    return Promise.reject(new Error('Generators never ask for bytes.'));
  }

  requestJsonWithFiles(request: MultipartHttpRequest): Promise<HttpResponse<unknown>> {
    return this.answer(request);
  }

  getRoutesAsked(): string[] {
    return this.requests.map((request) => `${request.method} ${request.url}`);
  }

  private answer(request: HttpRequest | MultipartHttpRequest): Promise<HttpResponse<unknown>> {
    this.requests.push(request);
    const answers = this.answersByRoute.get(`${request.method} ${request.url}`) ?? [];
    const answer = answers.length > 1 ? answers.shift() : answers[0];
    if (!answer) return Promise.reject(new Error(`No recorded answer for ${request.method} ${request.url}.`));
    return answer instanceof HttpRequestError ? Promise.reject(answer) : Promise.resolve(answer);
  }
}

function buildGenerator({ baseUrl = LOCAL_ADDRESS, manifest = {} }: { baseUrl?: string; manifest?: Partial<GeneratorManifest> } = {}): InstalledGenerator {
  const installed = buildInstalledGenerator({ baseUrl, manifest: { ...MANIFEST, ...manifest }, optionValues: { style: 'busy' } });
  return withMusicUploadConsent({ generator: installed, consentedAt: '2026-10-25T10:00:00Z' });
}

function buildStartOptions({ httpClient, generator = buildGenerator(), ...overrides }: { httpClient: MultipartHttpClient; generator?: InstalledGenerator } & Partial<StartGeneratorJobOptions>): StartGeneratorJobOptions {
  return { httpClient, generator, song: SONG, difficulties: ['Easy', 'Medium'], music: MUSIC, video: null, ...overrides };
}

function buildWaitRecorder(): { waitedSeconds: number[]; waitSeconds: (seconds: number) => Promise<void> } {
  const waitedSeconds: number[] = [];
  return { waitedSeconds, waitSeconds: (seconds) => { waitedSeconds.push(seconds); return Promise.resolve(); } };
}

function buildDownloadRecorder(): { downloads: Parameters<DownloadGeneratorFile>[0][]; downloadGeneratorFile: DownloadGeneratorFile } {
  const downloads: Parameters<DownloadGeneratorFile>[0][] = [];
  return { downloads, downloadGeneratorFile: (request) => { downloads.push(request); return Promise.resolve(`downloaded-${request.kind}`); } };
}

async function getRejection(promise: Promise<unknown>): Promise<GeneratorError> {
  const error: unknown = await promise.then(() => null, (caught: unknown) => caught);
  if (!(error instanceof GeneratorError)) throw new Error(`Expected a GeneratorError, got ${String(error)}.`);
  return error;
}

const JOB_URL = `${LOCAL_ADDRESS}/jobs/a1b2c3`;
const DONE_FILES = [
  { kind: 'chart', url: `${LOCAL_ADDRESS}/files/a1b2c3/song.ssc`, bytes: 12_000 },
  { kind: 'banner', url: `${LOCAL_ADDRESS}/files/a1b2c3/banner.png`, bytes: 80_000 },
  { kind: 'report', url: `${LOCAL_ADDRESS}/files/a1b2c3/report.md`, bytes: 900 },
  { kind: 'lyrics', url: `${LOCAL_ADDRESS}/files/a1b2c3/lyrics.lrc`, bytes: 100 },
];

describe('generator manifests', () => {
  it('reads and checks a manifest, keeping only known difficulties and valid options', async () => {
    const manifest = { ...MANIFEST_ANSWER, difficulties: ['Challenge', 'Edit', 'Easy'], options: [...MANIFEST_ANSWER.options, { id: 'Bad Id', kind: 'text' }] };
    const httpClient = new RecordedGenerator({ [`GET ${REMOTE_ADDRESS}/manifest.json`]: [{ status: 200, body: manifest }] });
    const result = await fetchGeneratorManifest({ httpClient, address: `${REMOTE_ADDRESS}/` });
    expect(result.baseUrl).toBe(REMOTE_ADDRESS);
    expect(result.manifest).toMatchObject({ kind: 'generator', name: 'Onset Steps', difficulties: ['Easy', 'Challenge'], usesVideo: false, maxMusicBytes: 100 * 1024 * 1024, options: MANIFEST_ANSWER.options });
  });

  it.each([
    [{ ...MANIFEST_ANSWER, kind: undefined, provides: ['audio-links'] }, 'This is an addon, not a generator'],
    [{ ...MANIFEST_ANSWER, kind: 'importer' }, 'isn’t a generator'],
    [{ ...MANIFEST_ANSWER, protocol: 2 }, 'different version of the generator protocol'],
    [{ ...MANIFEST_ANSWER, id: 'Bad Id!' }, 'no valid id'],
    [{ ...MANIFEST_ANSWER, author: ' ' }, 'missing its name, version or author'],
    [{ ...MANIFEST_ANSWER, difficulties: ['Edit'] }, 'lists no difficulty'],
    [{ ...MANIFEST_ANSWER, difficulties: undefined }, 'lists no difficulty'],
    [{ ...MANIFEST_ANSWER, musicTypes: ['ogg', 7] }, 'which music files it takes'],
    [{ ...MANIFEST_ANSWER, maxMusicBytes: -1 }, 'invalid maxMusicBytes'],
    [{ ...MANIFEST_ANSWER, maxMusicBytes: '30 MB' }, 'invalid maxMusicBytes'],
    ['<html>', 'didn’t send a generator manifest'],
  ])('refuses a bad manifest (%#)', async (manifest, message) => {
    const httpClient = new RecordedGenerator({ [`GET ${LOCAL_ADDRESS}/manifest.json`]: [{ status: 200, body: manifest }] });
    const error = await getRejection(fetchGeneratorManifest({ httpClient, address: LOCAL_ADDRESS }));
    expect(error.reason).toBe('invalid-manifest');
    expect(error.message).toContain(message);
  });

  it('holds maxMusicBytes to 100 MB', async () => {
    const httpClient = new RecordedGenerator({ [`GET ${LOCAL_ADDRESS}/manifest.json`]: [{ status: 200, body: { ...MANIFEST_ANSWER, maxMusicBytes: 31_457_280 } }, { status: 200, body: { ...MANIFEST_ANSWER, maxMusicBytes: 10 ** 12 } }] });
    expect((await fetchGeneratorManifest({ httpClient, address: LOCAL_ADDRESS })).manifest.maxMusicBytes).toBe(31_457_280);
    expect((await fetchGeneratorManifest({ httpClient, address: LOCAL_ADDRESS })).manifest.maxMusicBytes).toBe(100 * 1024 * 1024);
  });

  it('explains when nothing answers', async () => {
    const httpClient = new RecordedGenerator({ [`GET ${LOCAL_ADDRESS}/manifest.json`]: [new HttpRequestError({ failure: 'network', message: 'offline' })] });
    const error = await getRejection(fetchGeneratorManifest({ httpClient, address: LOCAL_ADDRESS }));
    expect(error).toMatchObject({ reason: 'not-answering', message: 'No generator answered at this address. Check the address and that the generator is running.' });
  });

  it.each(['http://steps.example.org', 'https://user:secret@steps.example.org', 'https://steps.example.org/?key=1'])('refuses the address %s', async (address) => {
    await expect(fetchGeneratorManifest({ httpClient: new RecordedGenerator({}), address })).rejects.toThrow(InvalidServiceAddressError);
  });

  it('loads a saved generator again, and refuses broken ones', () => {
    const saved = JSON.parse(JSON.stringify(buildGenerator())) as unknown;
    expect(loadSavedGenerator(saved)).toEqual(buildGenerator());
    expect(loadSavedGenerator({ ...(saved as object), manifest: { ...MANIFEST_ANSWER, kind: 'addon' } })).toBeNull();
    expect(loadSavedGenerator({ ...(saved as object), baseUrl: 'http://steps.example.org' })).toBeNull();
    expect(loadSavedGenerator(null)).toBeNull();
  });
});

describe('where the music goes', () => {
  it('needs no agreement for a generator on this computer', () => {
    const localGenerator = buildInstalledGenerator({ baseUrl: LOCAL_ADDRESS, manifest: MANIFEST });
    expect(isGeneratorOnThisComputer(localGenerator)).toBe(true);
    expect(getMusicUploadWarningOrNull(localGenerator)).toBeNull();
    expect(isGeneratorOnThisComputer({ baseUrl: 'http://localhost:8080' })).toBe(true);
  });

  it('flags a generator on another computer until the player agrees', () => {
    const remoteGenerator = buildInstalledGenerator({ baseUrl: REMOTE_ADDRESS, manifest: MANIFEST });
    expect(isGeneratorOnThisComputer(remoteGenerator)).toBe(false);
    expect(getMusicUploadWarningOrNull(remoteGenerator)).toBe('Your music file will be sent to https://steps.example.org/onset.');
    expect(getMusicUploadWarningOrNull(withMusicUploadConsent({ generator: remoteGenerator, consentedAt: '2026-10-25T10:00:00Z' }))).toBeNull();
  });

  it('refuses to upload to another computer before the player agreed', async () => {
    const httpClient = new RecordedGenerator({});
    const remoteGenerator = buildInstalledGenerator({ baseUrl: REMOTE_ADDRESS, manifest: MANIFEST });
    const error = await getRejection(startGeneratorJob(buildStartOptions({ httpClient, generator: remoteGenerator })));
    expect(error.reason).toBe('needs-music-upload-consent');
    expect(httpClient.requests).toEqual([]);
  });
});

describe('a good job', () => {
  it('starts, waits, and collects the files', async () => {
    const httpClient = new RecordedGenerator({
      [`POST ${LOCAL_ADDRESS}/jobs`]: [{ status: 202, body: { jobId: 'a1b2c3', retryAfterSeconds: 10 } }],
      [`GET ${JOB_URL}`]: [{ status: 200, body: { state: 'done', files: DONE_FILES } }],
      [`GET ${LOCAL_ADDRESS}/files/a1b2c3/song.ssc`]: [{ status: 200, body: CHART_TEXT }],
      [`GET ${LOCAL_ADDRESS}/files/a1b2c3/report.md`]: [{ status: 200, body: '# How it was made' }],
    });
    const generator = buildGenerator();
    const { waitedSeconds, waitSeconds } = buildWaitRecorder();
    const { downloads, downloadGeneratorFile } = buildDownloadRecorder();

    const startResult = await startGeneratorJob(buildStartOptions({ httpClient, generator }));
    if (startResult.kind !== 'started') throw new Error('Expected the job to start.');
    const { job } = startResult;
    const outcome = await waitForGeneratorJob({ httpClient, generator, job, waitSeconds });
    if (outcome.kind !== 'done') throw new Error('Expected the job to be done.');
    const songFiles = await collectGeneratorFiles({ httpClient, generator, files: outcome.files, downloadGeneratorFile });

    expect(job).toEqual({ jobId: 'a1b2c3', retryAfterSeconds: 10 });
    expect(waitedSeconds).toEqual([10]);
    expect(outcome.files.map((file) => file.kind)).toEqual(['chart', 'banner', 'report']);
    expect(songFiles).toEqual({ chartText: CHART_TEXT, reportText: '# How it was made', sourceIdByKind: { banner: 'downloaded-banner' } });
    expect(downloads).toEqual([{ url: `${LOCAL_ADDRESS}/files/a1b2c3/banner.png`, kind: 'banner', maxBytes: 5 * 1024 * 1024, generatorName: 'Onset Steps', headers: {} }]);
    expect(httpClient.requests.every((request) => request.headers === undefined || Object.keys(request.headers).length === 0)).toBe(true);
    expect(httpClient.requests.find((request) => request.url.endsWith('song.ssc'))?.maxResponseBytes).toBe(2 * 1024 * 1024);
  });

  it('sends exactly the request part, the music, and the video only when the generator uses it', async () => {
    const httpClient = new RecordedGenerator({ [`POST ${LOCAL_ADDRESS}/jobs`]: [{ status: 202, body: { jobId: 'a1b2c3', retryAfterSeconds: 10 } }] });
    const songWithExtras = { ...SONG, accountEmail: 'player@example.org' };
    await startGeneratorJob(buildStartOptions({ httpClient, song: songWithExtras, difficulties: ['Easy', 'Medium'], video: VIDEO }));
    await startGeneratorJob(buildStartOptions({ httpClient, generator: buildGenerator({ manifest: { usesVideo: true, difficulties: ['Medium', 'Hard'] } }), video: VIDEO }));
    const [withoutVideo, withVideo] = httpClient.requests as MultipartHttpRequest[];
    expect(withoutVideo?.parts).toEqual([
      { kind: 'json', name: 'request', value: { protocol: 1, song: SONG, difficulties: ['Easy', 'Medium'], options: { style: 'busy' } } },
      { kind: 'file', name: 'music', sourceId: 'music-1', fileName: 'Pulse Garden.ogg', contentType: 'audio/ogg' },
    ]);
    expect(withVideo?.parts.map((part) => part.name)).toEqual(['request', 'music', 'video']);
    expect(withVideo?.parts[0]).toMatchObject({ value: { difficulties: ['Medium'] } });
  });

  it('refuses what it can’t send before uploading anything', async () => {
    const httpClient = new RecordedGenerator({});
    const generator = buildGenerator({ manifest: { difficulties: ['Hard'] } });
    expect((await getRejection(startGeneratorJob(buildStartOptions({ httpClient, generator, difficulties: ['Easy'] })))).message).toBe('Pick at least one difficulty Onset Steps can make: Hard.');
    expect((await getRejection(startGeneratorJob(buildStartOptions({ httpClient, music: { ...MUSIC, contentType: 'audio/aac' } })))).reason).toBe('invalid-request');
    expect((await getRejection(startGeneratorJob(buildStartOptions({ httpClient, music: { ...MUSIC, bytes: 150_000_000 } })))).message).toBe('This music file is bigger than Onset Steps takes (100 MB). Pick a smaller file.');
    const smallGenerator = buildGenerator({ manifest: { maxMusicBytes: 3 * 1024 * 1024 } });
    expect((await getRejection(startGeneratorJob(buildStartOptions({ httpClient, generator: smallGenerator })))).message).toBe('This music file is bigger than Onset Steps takes (3 MB). Pick a smaller file.');
    expect((await getRejection(startGeneratorJob(buildStartOptions({ httpClient, music: { ...MUSIC, fileName: ' ' } })))).reason).toBe('invalid-request');
    expect(httpClient.requests).toEqual([]);
  });

  it('shows the generator’s reason when it won’t take the job', async () => {
    const httpClient = new RecordedGenerator({ [`POST ${LOCAL_ADDRESS}/jobs`]: [{ status: 503, body: { error: 'Too many songs at once, try in a minute.' } }] });
    const error = await getRejection(startGeneratorJob(buildStartOptions({ httpClient })));
    expect(error).toMatchObject({ reason: 'refused-job', message: 'Onset Steps couldn’t take this song: Too many songs at once, try in a minute.' });
  });

  it('reports a song that already exists, trusting a vault song id only from StepsVault’s generator', async () => {
    const answer = { status: 409, body: { error: 'This song is already being made.', vaultSongId: 'song_42' } };
    const httpClient = new RecordedGenerator({ [`POST ${LOCAL_ADDRESS}/jobs`]: [answer], [`POST ${STEPSVAULT_ADDRESS}/jobs`]: [answer] });
    expect(await startGeneratorJob(buildStartOptions({ httpClient }))).toEqual({ kind: 'already-exists', message: 'This song is already being made.', vaultSongId: null });
    expect(await startGeneratorJob(buildStartOptions({ httpClient, generator: buildGenerator({ baseUrl: STEPSVAULT_ADDRESS }), signIn: SIGN_IN }))).toEqual({ kind: 'already-exists', message: 'This song is already being made.', vaultSongId: 'song_42' });
  });

  it('refuses a job id that breaks the rules', async () => {
    const httpClient = new RecordedGenerator({ [`POST ${LOCAL_ADDRESS}/jobs`]: [{ status: 202, body: { jobId: '../../etc', retryAfterSeconds: 10 } }] });
    expect((await getRejection(startGeneratorJob(buildStartOptions({ httpClient })))).reason).toBe('invalid-answer');
  });
});

describe('a failed job', () => {
  it('throws the generator’s reason as a sentence for the player', async () => {
    const httpClient = new RecordedGenerator({ [`GET ${JOB_URL}`]: [{ status: 200, body: { state: 'failed', error: 'The music is too quiet to find a beat.' } }] });
    const error = await getRejection(waitForGeneratorJob({ httpClient, generator: buildGenerator(), job: { jobId: 'a1b2c3', retryAfterSeconds: 5 }, waitSeconds: buildWaitRecorder().waitSeconds }));
    expect(error).toMatchObject({ reason: 'job-failed', message: 'Onset Steps couldn’t make this song: The music is too quiet to find a beat.' });
  });

  it('says the job is lost when the generator no longer knows it', async () => {
    const httpClient = new RecordedGenerator({ [`GET ${JOB_URL}`]: [{ status: 404, body: null }] });
    const error = await getRejection(waitForGeneratorJob({ httpClient, generator: buildGenerator(), job: { jobId: 'a1b2c3', retryAfterSeconds: 5 }, waitSeconds: buildWaitRecorder().waitSeconds }));
    expect(error.reason).toBe('job-lost');
  });

  it('refuses a finished job without a song file', async () => {
    const httpClient = new RecordedGenerator({ [`GET ${JOB_URL}`]: [{ status: 200, body: { state: 'done', files: DONE_FILES.slice(1) } }] });
    const error = await getRejection(waitForGeneratorJob({ httpClient, generator: buildGenerator(), job: { jobId: 'a1b2c3', retryAfterSeconds: 5 }, waitSeconds: buildWaitRecorder().waitSeconds }));
    expect(error.reason).toBe('missing-chart');
  });
});

describe('a slow job', () => {
  it('asks again as often as the generator says, within 1 to 600 seconds, and reports progress', async () => {
    const httpClient = new RecordedGenerator({
      [`GET ${JOB_URL}`]: [
        { status: 200, body: { state: 'queued', retryAfterSeconds: 0 } },
        { status: 200, body: { state: 'working', progress: 0.4, stage: `Placing the steps${'.'.repeat(80)}`, retryAfterSeconds: 99_999 } },
        new HttpRequestError({ failure: 'network', message: 'blip' }),
        { status: 200, body: { state: 'working', progress: 7, retryAfterSeconds: 30 } },
        { status: 200, body: { state: 'done', files: DONE_FILES } },
      ],
    });
    const { waitedSeconds, waitSeconds } = buildWaitRecorder();
    const progressReports: unknown[] = [];
    const outcome = await waitForGeneratorJob({ httpClient, generator: buildGenerator(), job: { jobId: 'a1b2c3', retryAfterSeconds: 10 }, waitSeconds, onProgress: (status) => progressReports.push(status) });
    expect(outcome.kind).toBe('done');
    expect(waitedSeconds).toEqual([10, 1, 600, 600, 30]);
    expect(progressReports).toEqual([
      { state: 'queued', progress: null, stage: null, retryAfterSeconds: 1 },
      { state: 'working', progress: 0.4, stage: `Placing the steps${'.'.repeat(43)}`, retryAfterSeconds: 600 },
      { state: 'working', progress: 1, stage: null, retryAfterSeconds: 30 },
    ]);
  });

  it('gives up after three missed answers in a row', async () => {
    const httpClient = new RecordedGenerator({ [`GET ${JOB_URL}`]: [new HttpRequestError({ failure: 'timeout', message: 'slow' })] });
    const error = await getRejection(waitForGeneratorJob({ httpClient, generator: buildGenerator(), job: { jobId: 'a1b2c3', retryAfterSeconds: 5 }, waitSeconds: buildWaitRecorder().waitSeconds }));
    expect(error).toMatchObject({ reason: 'not-answering', message: 'Onset Steps is taking too long to answer. Check that it is running, then try again.' });
    expect(httpClient.requests).toHaveLength(3);
  });

  it('stops a job that is still working after two hours, and cancels it on the generator', async () => {
    const httpClient = new RecordedGenerator({ [`GET ${JOB_URL}`]: [{ status: 200, body: { state: 'working', retryAfterSeconds: 600 } }], [`DELETE ${JOB_URL}`]: [{ status: 200, body: { cancelled: true } }] });
    const error = await getRejection(waitForGeneratorJob({ httpClient, generator: buildGenerator(), job: { jobId: 'a1b2c3', retryAfterSeconds: 600 }, waitSeconds: buildWaitRecorder().waitSeconds }));
    expect(error.reason).toBe('took-too-long');
    expect(httpClient.getRoutesAsked().filter((route) => route.startsWith('GET'))).toHaveLength(12);
    expect(httpClient.getRoutesAsked().at(-1)).toBe(`DELETE ${JOB_URL}`);
  });
});

describe('an oversized file', () => {
  it('refuses a file the generator says is over its limit', async () => {
    const files = [...DONE_FILES, { kind: 'video', url: `${LOCAL_ADDRESS}/files/a1b2c3/video.mp4`, bytes: 600 * 1024 * 1024 }];
    const httpClient = new RecordedGenerator({ [`GET ${JOB_URL}`]: [{ status: 200, body: { state: 'done', files } }] });
    const error = await getRejection(waitForGeneratorJob({ httpClient, generator: buildGenerator(), job: { jobId: 'a1b2c3', retryAfterSeconds: 5 }, waitSeconds: buildWaitRecorder().waitSeconds }));
    expect(error).toMatchObject({ reason: 'file-too-large', message: 'Onset Steps sent a video file bigger than 500 MB, so Sync refused the song. Ask its maker to fix it.' });
  });

  it('refuses a file that turns out bigger than its limit while downloading, whatever size was claimed', async () => {
    const tooLarge = new HttpRequestError({ failure: 'too-large', message: 'more than 2097152 bytes' });
    const httpClient = new RecordedGenerator({ [`GET ${LOCAL_ADDRESS}/files/a1b2c3/song.ssc`]: [tooLarge] });
    const files = [{ kind: 'chart' as const, url: `${LOCAL_ADDRESS}/files/a1b2c3/song.ssc`, bytes: 1_000 }];
    const error = await getRejection(collectGeneratorFiles({ httpClient, generator: buildGenerator(), files, downloadGeneratorFile: buildDownloadRecorder().downloadGeneratorFile }));
    expect(error).toMatchObject({ reason: 'file-too-large', message: 'Onset Steps sent a chart file bigger than 2 MB, so Sync refused the song. Ask its maker to fix it.' });
  });

  it('refuses a picture that is too big while the platform downloads it', async () => {
    const httpClient = new RecordedGenerator({ [`GET ${LOCAL_ADDRESS}/files/a1b2c3/song.ssc`]: [{ status: 200, body: CHART_TEXT }] });
    const files = [{ kind: 'chart' as const, url: `${LOCAL_ADDRESS}/files/a1b2c3/song.ssc`, bytes: 1_000 }, { kind: 'jacket' as const, url: `${LOCAL_ADDRESS}/files/a1b2c3/jacket.png`, bytes: 1_000 }];
    const downloadGeneratorFile: DownloadGeneratorFile = () => Promise.reject(new HttpRequestError({ failure: 'too-large', message: 'big' }));
    const error = await getRejection(collectGeneratorFiles({ httpClient, generator: buildGenerator(), files, downloadGeneratorFile }));
    expect(error.message).toBe('Onset Steps sent a jacket file bigger than 5 MB, so Sync refused the song. Ask its maker to fix it.');
  });
});

describe('file links', () => {
  it.each([
    ['http://files.example.org/song.ssc', REMOTE_ADDRESS],
    ['https://user:secret@files.example.org/song.ssc', REMOTE_ADDRESS],
    [`${LOCAL_ADDRESS}/files/song.ssc`, REMOTE_ADDRESS],
    ['file:///C:/song.ssc', LOCAL_ADDRESS],
    ['/files/song.ssc', LOCAL_ADDRESS],
  ])('refuses the link %s from a generator at %s', async (url, baseUrl) => {
    const jobUrl = `${baseUrl}/jobs/a1b2c3`;
    const httpClient = new RecordedGenerator({ [`GET ${jobUrl}`]: [{ status: 200, body: { state: 'done', files: [{ kind: 'chart', url, bytes: 100 }] } }] });
    const error = await getRejection(waitForGeneratorJob({ httpClient, generator: buildGenerator({ baseUrl }), job: { jobId: 'a1b2c3', retryAfterSeconds: 5 }, waitSeconds: buildWaitRecorder().waitSeconds }));
    expect(error).toMatchObject({ reason: 'invalid-answer', message: 'Onset Steps sent a file link Sync doesn’t allow. Ask its maker to fix it.' });
  });

  it('accepts https links with a query from a generator on another computer', async () => {
    const url = 'https://cdn.example.org/a1b2c3/song.ssc?signature=abc';
    const httpClient = new RecordedGenerator({ [`GET ${REMOTE_ADDRESS}/jobs/a1b2c3`]: [{ status: 200, body: { state: 'done', files: [{ kind: 'chart', url, bytes: 100 }] } }] });
    const outcome = await waitForGeneratorJob({ httpClient, generator: buildGenerator({ baseUrl: REMOTE_ADDRESS }), job: { jobId: 'a1b2c3', retryAfterSeconds: 5 }, waitSeconds: buildWaitRecorder().waitSeconds });
    expect(outcome).toEqual({ kind: 'done', files: [{ kind: 'chart', url, bytes: 100 }] });
  });
});

describe('cancel', () => {
  it('cancels on the generator when the player stops, and returns cancelled', async () => {
    const httpClient = new RecordedGenerator({ [`GET ${JOB_URL}`]: [{ status: 200, body: { state: 'working', retryAfterSeconds: 10 } }], [`DELETE ${JOB_URL}`]: [{ status: 200, body: { cancelled: true } }] });
    let pollCount = 0;
    const outcome = await waitForGeneratorJob({
      httpClient,
      generator: buildGenerator(),
      job: { jobId: 'a1b2c3', retryAfterSeconds: 5 },
      waitSeconds: buildWaitRecorder().waitSeconds,
      onProgress: () => (pollCount += 1),
      shouldStop: () => pollCount >= 2,
    });
    expect(outcome).toEqual({ kind: 'cancelled', cancelResult: { kind: 'cancelled' } });
    expect(httpClient.getRoutesAsked()).toEqual([`GET ${JOB_URL}`, `GET ${JOB_URL}`, `DELETE ${JOB_URL}`]);
  });

  it('returns the generator’s sentence when it is too late to stop', async () => {
    const httpClient = new RecordedGenerator({ [`DELETE ${JOB_URL}`]: [{ status: 200, body: { cancelled: false, error: 'The song is already being made; it still costs the token.' } }] });
    expect(await cancelGeneratorJob({ httpClient, generator: buildGenerator(), jobId: 'a1b2c3' })).toEqual({ kind: 'not-cancelled', message: 'Onset Steps couldn’t stop this song: The song is already being made; it still costs the token.' });
  });

  it.each([new HttpRequestError({ failure: 'network', message: 'offline' }), { status: 500, body: null }, { status: 200, body: { cancelled: 'maybe' } }])('never throws, whatever the generator answers (%#)', async (answer) => {
    const httpClient = new RecordedGenerator({ [`DELETE ${JOB_URL}`]: [answer] });
    expect(await cancelGeneratorJob({ httpClient, generator: buildGenerator(), jobId: 'a1b2c3' })).toEqual({ kind: 'unknown' });
    expect(httpClient.requests[0]).toMatchObject({ method: 'DELETE', url: JOB_URL });
  });
});

describe('signing in to StepsVault’s own generator', () => {
  it('sends the device token on every call to StepsVault, file downloads included', async () => {
    const jobUrl = `${STEPSVAULT_ADDRESS}/jobs/a1b2c3`;
    const chartUrl = `${STEPSVAULT_ADDRESS}/files/a1b2c3/song.ssc`;
    const bannerUrl = `${STEPSVAULT_ADDRESS}/files/a1b2c3/banner.png`;
    const httpClient = new RecordedGenerator({
      [`GET ${STEPSVAULT_ADDRESS}/manifest.json`]: [{ status: 200, body: MANIFEST_ANSWER }],
      [`POST ${STEPSVAULT_ADDRESS}/jobs`]: [{ status: 202, body: { jobId: 'a1b2c3', retryAfterSeconds: 10 } }],
      [`GET ${jobUrl}`]: [{ status: 200, body: { state: 'done', files: [{ kind: 'chart', url: chartUrl, bytes: 100 }, { kind: 'banner', url: bannerUrl, bytes: 100 }] } }],
      [`GET ${chartUrl}`]: [{ status: 200, body: CHART_TEXT }],
      [`DELETE ${jobUrl}`]: [{ status: 200, body: { cancelled: true } }],
    });
    const generator = buildGenerator({ baseUrl: STEPSVAULT_ADDRESS });
    const { downloads, downloadGeneratorFile } = buildDownloadRecorder();
    await fetchGeneratorManifest({ httpClient, address: STEPSVAULT_ADDRESS, signIn: SIGN_IN });
    await startGeneratorJob(buildStartOptions({ httpClient, generator, signIn: SIGN_IN }));
    const outcome = await waitForGeneratorJob({ httpClient, generator, signIn: SIGN_IN, job: { jobId: 'a1b2c3', retryAfterSeconds: 5 }, waitSeconds: buildWaitRecorder().waitSeconds });
    if (outcome.kind !== 'done') throw new Error('Expected the job to be done.');
    await collectGeneratorFiles({ httpClient, generator, signIn: SIGN_IN, files: outcome.files, downloadGeneratorFile });
    await cancelGeneratorJob({ httpClient, generator, signIn: SIGN_IN, jobId: 'a1b2c3' });
    expect(httpClient.requests.map((request) => request.headers)).toEqual(Array.from({ length: 5 }, () => ({ Authorization: 'Bearer device-token-1' })));
    expect(downloads[0]?.headers).toEqual({ Authorization: 'Bearer device-token-1' });
  });

  it('never sends the token to any other address, even when the app passes it by mistake', async () => {
    const httpClient = new RecordedGenerator({
      [`POST ${REMOTE_ADDRESS}/jobs`]: [{ status: 202, body: { jobId: 'a1b2c3', retryAfterSeconds: 10 } }],
      [`GET ${REMOTE_ADDRESS}/jobs/a1b2c3`]: [{ status: 200, body: { state: 'working', retryAfterSeconds: 10 } }],
      [`DELETE ${REMOTE_ADDRESS}/jobs/a1b2c3`]: [{ status: 200, body: { cancelled: true } }],
    });
    const generator = buildGenerator({ baseUrl: REMOTE_ADDRESS });
    await startGeneratorJob(buildStartOptions({ httpClient, generator, signIn: SIGN_IN }));
    await waitForGeneratorJob({ httpClient, generator, signIn: SIGN_IN, job: { jobId: 'a1b2c3', retryAfterSeconds: 5 }, waitSeconds: buildWaitRecorder().waitSeconds, shouldStop: () => httpClient.requests.length >= 2 });
    expect(httpClient.getRoutesAsked()).toEqual([`POST ${REMOTE_ADDRESS}/jobs`, `GET ${REMOTE_ADDRESS}/jobs/a1b2c3`, `DELETE ${REMOTE_ADDRESS}/jobs/a1b2c3`]);
    expect(httpClient.requests.map((request) => request.headers)).toEqual([{}, {}, {}]);
  });

  it('refuses a StepsVault file link outside its own address, so the token never follows it', async () => {
    const files = [{ kind: 'chart' as const, url: 'https://cdn.example.org/song.ssc', bytes: 100 }];
    const httpClient = new RecordedGenerator({});
    const error = await getRejection(collectGeneratorFiles({ httpClient, generator: buildGenerator({ baseUrl: STEPSVAULT_ADDRESS }), signIn: SIGN_IN, files, downloadGeneratorFile: buildDownloadRecorder().downloadGeneratorFile }));
    expect(error.reason).toBe('invalid-answer');
    expect(httpClient.requests).toEqual([]);
  });
});

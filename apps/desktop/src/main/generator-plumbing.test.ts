import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpRequestError } from '@stepsvault/sync-core';
import { GeneratorJobFiles } from './generator-job-files';
import { MusicSourceRegistry } from './music-source-registry';
import { NodeMultipartHttpClient } from './node-multipart-http-client';

let workFolder: string;
let server: Server;
let baseUrl: string;
let receivedRequest: { headers: IncomingMessage['headers']; body: Buffer } | null;
let handleRequest: (request: IncomingMessage, response: ServerResponse, body: Buffer) => void;

beforeEach(async () => {
  workFolder = await mkdtemp(path.join(os.tmpdir(), 'stepsvault-generator-test-'));
  receivedRequest = null;
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      receivedRequest = { headers: request.headers, body: Buffer.concat(chunks) };
      handleRequest(request, response, receivedRequest.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => { resolve(); }));
  await rm(workFolder, { recursive: true, force: true });
});

describe('NodeMultipartHttpClient', () => {
  it('streams the music file by sourceId next to the JSON request, and reads the JSON answer', async () => {
    handleRequest = (_request, response) => { response.writeHead(202, { 'Content-Type': 'application/json' }).end('{"jobId":"a1b2c3","retryAfterSeconds":10}'); };
    const musicPath = path.join(workFolder, 'Night Drive.ogg');
    await writeFile(musicPath, 'OggS-music-bytes');
    const musicSources = new MusicSourceRegistry();
    const client = new NodeMultipartHttpClient({ appVersion: '0.1.0', getSourceFilePath: (sourceId) => musicSources.getSource(sourceId)?.filePath ?? null });
    const answer = await client.requestJsonWithFiles({
      url: `${baseUrl}/jobs`, method: 'POST', headers: { Authorization: 'Bearer token' }, timeoutMilliseconds: 5_000, maxResponseBytes: 1_000,
      parts: [{ kind: 'json', name: 'request', value: { protocol: 1 } }, { kind: 'file', name: 'music', sourceId: musicSources.register(musicPath), fileName: 'Night "Drive".ogg', contentType: 'audio/ogg' }],
    });
    expect(answer).toEqual({ status: 202, body: { jobId: 'a1b2c3', retryAfterSeconds: 10 } });
    const contentType = receivedRequest?.headers['content-type'] ?? '';
    const boundary = /boundary=(.+)$/.exec(contentType)?.[1] ?? '';
    expect(contentType.startsWith('multipart/form-data; boundary=')).toBe(true);
    expect(receivedRequest?.headers.authorization).toBe('Bearer token');
    expect(Number(receivedRequest?.headers['content-length'])).toBe(receivedRequest?.body.byteLength);
    expect(receivedRequest?.body.toString('utf8')).toBe([
      `--${boundary}`, 'Content-Disposition: form-data; name="request"', 'Content-Type: application/json', '', '{"protocol":1}',
      `--${boundary}`, 'Content-Disposition: form-data; name="music"; filename="Night %22Drive%22.ogg"', 'Content-Type: audio/ogg', '', 'OggS-music-bytes',
      `--${boundary}--`, '',
    ].join('\r\n'));
  });

  it('refuses a sourceId it doesn’t know, before sending anything', async () => {
    handleRequest = (_request, response) => { response.end('{}'); };
    const client = new NodeMultipartHttpClient({ appVersion: '0.1.0', getSourceFilePath: () => null });
    const request = { url: `${baseUrl}/jobs`, method: 'POST' as const, timeoutMilliseconds: 5_000, maxResponseBytes: 1_000, parts: [{ kind: 'file' as const, name: 'music', sourceId: 'file:unknown', fileName: 'a.ogg', contentType: 'audio/ogg' }] };
    await expect(client.requestJsonWithFiles(request)).rejects.toThrow(HttpRequestError);
    expect(receivedRequest).toBeNull();
  });
});

describe('GeneratorJobFiles', () => {
  it('downloads a job’s files under Sync’s own names, keeps them across a restart, and removes them after writing', async () => {
    handleRequest = (request, response) => { response.end(request.url === '/files/video?sig=1' ? 'mp4-bytes' : 'OggS-generated'); };
    const musicSources = new MusicSourceRegistry();
    const jobFiles = new GeneratorJobFiles({ jobsFolder: path.join(workFolder, 'jobs'), musicSources, appVersion: '0.1.0' });
    const download = jobFiles.buildDownloadGeneratorFile('job-1');
    const musicSourceId = await download({ url: `${baseUrl}/files/music`, kind: 'music', maxBytes: 1_000, generatorName: 'Tap Forge', headers: {} });
    await download({ url: `${baseUrl}/files/video?sig=1`, kind: 'video', maxBytes: 1_000, generatorName: 'Tap Forge', headers: {} });
    expect(musicSources.getSource(musicSourceId)?.fileName).toBe('music.ogg');
    const jobFolder = await jobFiles.saveCollectedFiles({ jobKey: 'job-1', files: { chartText: '#TITLE:Night Drive;', reportText: '# How', sourceIdByKind: {} } });
    const reloaded = await jobFiles.loadCollectedFiles(jobFolder);
    expect(reloaded.chartText).toBe('#TITLE:Night Drive;');
    expect(reloaded.reportText).toBe('# How');
    expect(Object.keys(reloaded.sourceIdByKind).sort()).toEqual(['music', 'video']);
    expect(await readFile(musicSources.getSource(reloaded.sourceIdByKind.video ?? '')?.filePath ?? '', 'utf8')).toBe('mp4-bytes');
    await jobFiles.removeJobFiles('job-1');
    expect(musicSources.getSource(musicSourceId)).toBeUndefined();
    await expect(readFile(path.join(jobFolder, 'chart.ssc'))).rejects.toThrow();
  });

  it('stops a download that is bigger than its limit and leaves no file behind', async () => {
    handleRequest = (_request, response) => { response.end('x'.repeat(5_000)); };
    const jobFiles = new GeneratorJobFiles({ jobsFolder: path.join(workFolder, 'jobs'), musicSources: new MusicSourceRegistry(), appVersion: '0.1.0' });
    const error: unknown = await jobFiles.buildDownloadGeneratorFile('job-2')({ url: `${baseUrl}/big`, kind: 'banner', maxBytes: 1_000, generatorName: 'Tap Forge', headers: {} }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpRequestError);
    expect((error as HttpRequestError).failure).toBe('too-large');
    await expect(readFile(path.join(workFolder, 'jobs', 'job-2', 'banner.png'))).rejects.toThrow();
  });

  it('refuses a job key that could leave the jobs folder', () => {
    const jobFiles = new GeneratorJobFiles({ jobsFolder: path.join(workFolder, 'jobs'), musicSources: new MusicSourceRegistry(), appVersion: '0.1.0' });
    expect(() => jobFiles.getJobFolder('..\\..\\Windows')).toThrow();
  });
});

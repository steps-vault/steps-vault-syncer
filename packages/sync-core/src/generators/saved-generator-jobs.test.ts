import { describe, expect, it } from 'vitest';
import { getGeneratorJobsAfterRestart, isGeneratorJobOpen, loadSavedGeneratorJobs, withSavedGeneratorJob, type SavedGeneratorJob } from './saved-generator-jobs';

function buildJob(overrides: Partial<SavedGeneratorJob> = {}): SavedGeneratorJob {
  return {
    jobKey: 'job-1', generatorBaseUrl: 'http://127.0.0.1:7700', generatorId: 'stepcat.tap-forge', generatorName: 'Tap Forge', generatorVersion: '1.2.0', isStepsVault: false, jobId: 'a1b2c3',
    song: { title: 'Night Drive', artist: 'Lumen Park', album: null, genre: null, lengthSeconds: 201, youtubeId: null },
    difficulties: ['Easy', 'Medium'], state: 'waiting', progress: 0.4, stage: 'Placing the steps', retryAfterSeconds: 10, message: null, vaultChoice: null, result: null,
    playerMusicLocation: 'C:\\Music\\Night Drive.mp3', playerVideoLocation: null, collectedFilesLocation: null, startedAt: '2026-10-25T10:00:00.000Z', updatedAt: '2026-10-25T10:01:00.000Z',
    ...overrides,
  };
}

describe('saved generator jobs', () => {
  it('loads what it saved and drops broken entries', () => {
    const job = buildJob({ vaultChoice: { vaultSongId: 'song_7', question: 'Which one?' }, state: 'needs-vault-choice' });
    const saved: unknown = JSON.parse(JSON.stringify([job, { jobKey: 'broken' }, buildJob({ jobKey: 'no-difficulties', difficulties: [] }), 'nonsense']));
    expect(loadSavedGeneratorJobs(saved)).toEqual([job]);
    expect(loadSavedGeneratorJobs({ jobs: [] })).toEqual([]);
  });

  it('replaces a job with the same key and keeps only the newest finished jobs', () => {
    const jobs = withSavedGeneratorJob({ jobs: [buildJob()], job: buildJob({ state: 'done', result: 'written' }) });
    expect(jobs).toEqual([buildJob({ state: 'done', result: 'written' })]);
    const manyFinished = Array.from({ length: 25 }, (_, index) => buildJob({ jobKey: `old-${String(index)}`, state: 'failed' }));
    const kept = manyFinished.reduce<SavedGeneratorJob[]>((saved, job) => withSavedGeneratorJob({ jobs: saved, job }), [buildJob({ jobKey: 'running' })]);
    expect(kept).toHaveLength(21);
    expect(kept[0]?.jobKey).toBe('running');
    expect(kept[1]?.jobKey).toBe('old-5');
  });

  it('after a restart, goes on with jobs the generator took, and fails a job that was still sending its music', () => {
    const jobs = getGeneratorJobsAfterRestart({ jobs: [buildJob(), buildJob({ jobKey: 'sending', state: 'sending', jobId: null })], now: '2026-10-25T11:00:00.000Z' });
    expect(jobs[0]).toEqual(buildJob());
    expect(jobs[1]).toMatchObject({ state: 'failed', message: 'Sync closed while it was sending the music, so the song wasn’t made. Make it again.' });
    expect(jobs.map(isGeneratorJobOpen)).toEqual([true, false]);
  });
});

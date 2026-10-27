import {
  collectGeneratorFiles,
  getGeneratedSongKey,
  getGeneratorJobsAfterRestart,
  isGeneratorJobOpen,
  startGeneratorJob,
  waitForGeneratorJob,
  withSavedGeneratorJob,
  type DownloadGeneratorFile,
  type GeneratedSongActivityEvent,
  type GeneratedSongActivityStep,
  type GeneratedSongFiles,
  type GeneratedSongRequest,
  type GeneratedSongWriteResult,
  type GeneratorCancelResult,
  type GeneratorDifficulty,
  type GeneratorSignIn,
  type GeneratorSongFacts,
  type GeneratorUploadFile,
  type HttpClient,
  type InstalledGenerator,
  type MultipartHttpClient,
  type SavedGeneratorJob,
  type VaultSongChoice,
} from '@stepsvault/sync-core';

const CANCEL_CHECK_EVERY_MILLISECONDS = 250;

/** A generator as a job needs it: set up as the player has it now, with the sign-in only for StepsVault's own. */
export interface JobGenerator {
  generator: InstalledGenerator;
  signIn: GeneratorSignIn | null;
  isStepsVault: boolean;
}

export interface GeneratorJobRunnerDependencies {
  httpClient: HttpClient;
  multipartHttpClient: MultipartHttpClient;
  jobStore: { load(): Promise<SavedGeneratorJob[]>; save(jobs: SavedGeneratorJob[]): Promise<void> };
  jobFiles: {
    buildDownloadGeneratorFile(jobKey: string): DownloadGeneratorFile;
    saveCollectedFiles(options: { jobKey: string; files: GeneratedSongFiles }): Promise<string>;
    loadCollectedFiles(location: string): Promise<GeneratedSongFiles>;
    removeJobFiles(jobKey: string): Promise<void>;
  };
  /** The generator at this address as the player has it now; null after they removed it. */
  findGenerator(baseUrl: string): JobGenerator | null;
  /** The sourceId of the player's music or video, found again by where it is (it may be after a restart). */
  registerPlayerFile(location: string): string;
  /** Writes the song into "My generated songs", taking turns with syncs, and saves the record. */
  writeSong(options: { request: GeneratedSongRequest; vaultSongChoice: VaultSongChoice | null }): Promise<GeneratedSongWriteResult>;
  /** Keeps "How it was made" for the song. */
  saveReport(options: { songKey: string; reportText: string }): Promise<void>;
  /** Adds a song StepsVault already has to the player's vault (free); throws with the site's sentence when it can't. */
  addSongToVault(vaultSongId: string): Promise<void>;
  /**
   * StepsVault's generator made the song: it is in the vault, so a sync installs it, with the player's music.
   * vaultSongId is the song StepsVault said it is; null when it didn't say, and Sync finds the song by its facts.
   */
  addVaultSongToGame(options: { job: SavedGeneratorJob; vaultSongId: string | null }): Promise<void>;
  logActivity(event: GeneratedSongActivityEvent): Promise<void>;
  waitMilliseconds(milliseconds: number): Promise<void>;
  getNow(): string;
  onChange(): void;
}

/** A song to make: the music is ready to send (the right type, its length measured). */
export interface GeneratorJobStart {
  jobKey: string;
  generatorBaseUrl: string;
  song: GeneratorSongFacts;
  difficulties: readonly GeneratorDifficulty[];
  music: GeneratorUploadFile;
  video: GeneratorUploadFile | null;
  playerMusicLocation: string;
  playerVideoLocation: string | null;
}

/**
 * Makes songs with generators: sends the music, asks how each job goes (again after a restart), collects the files and
 * writes the song, or for StepsVault's own generator, lets the vault install it. Every step is saved and goes to the
 * Activity log. Jobs run in the background; the screens follow them through `jobs`.
 */
export class GeneratorJobRunner {
  private readonly dependencies: GeneratorJobRunnerDependencies;
  private savedJobs: SavedGeneratorJob[] = [];
  private readonly cancelRequestedJobKeys = new Set<string>();
  private saving: Promise<void> = Promise.resolve();

  constructor(dependencies: GeneratorJobRunnerDependencies) {
    this.dependencies = dependencies;
  }

  get jobs(): readonly SavedGeneratorJob[] {
    return this.savedJobs;
  }

  /** Loads the saved jobs and goes on asking about those the generators took before Sync closed. */
  async initialize(): Promise<void> {
    this.savedJobs = getGeneratorJobsAfterRestart({ jobs: await this.dependencies.jobStore.load(), now: this.dependencies.getNow() });
    await this.saveJobs();
    for (const job of this.savedJobs.filter((saved) => saved.state === 'waiting')) {
      void this.logStep({ job, step: 'resumed' });
      void this.runOrFail({ jobKey: job.jobKey, work: () => this.waitAndFinish(job.jobKey) });
    }
  }

  /** Starts making the song; resolves once the job is saved, and the screens follow it from there. */
  async startJob(start: GeneratorJobStart): Promise<void> {
    const jobGenerator = this.dependencies.findGenerator(start.generatorBaseUrl);
    if (!jobGenerator) throw new Error('That generator isn’t set up any more. Add it again under Generators.');
    const { manifest } = jobGenerator.generator;
    const now = this.dependencies.getNow();
    await this.saveJob({
      jobKey: start.jobKey, generatorBaseUrl: start.generatorBaseUrl, generatorId: manifest.id, generatorName: jobGenerator.isStepsVault ? 'dancedance.studio generator' : manifest.name, generatorVersion: manifest.version, isStepsVault: jobGenerator.isStepsVault,
      jobId: null, song: start.song, difficulties: [...start.difficulties], state: 'sending', progress: null, stage: null, retryAfterSeconds: 10, message: null, vaultChoice: null, result: null,
      playerMusicLocation: start.playerMusicLocation, playerVideoLocation: start.playerVideoLocation, collectedFilesLocation: null, startedAt: now, updatedAt: now,
    });
    void this.runOrFail({ jobKey: start.jobKey, work: () => this.sendAndFinish({ start, jobGenerator }) });
  }

  /** The player cancelled: the generator is told at once, between two checks of how the job goes. */
  async cancelJob(jobKey: string): Promise<void> {
    const job = this.findJob(jobKey);
    if (!job || !isGeneratorJobOpen(job)) return;
    if (job.state !== 'needs-vault-choice') {
      this.cancelRequestedJobKeys.add(jobKey);
      return;
    }
    await this.finishJob({ job, changes: { state: 'cancelled', vaultChoice: null }, step: 'cancelled' });
    await this.dependencies.jobFiles.removeJobFiles(jobKey);
  }

  /** "Keep the vault song, or the generated one?": writes the song again with the player's answer. */
  async answerVaultChoice({ jobKey, choice }: { jobKey: string; choice: VaultSongChoice }): Promise<void> {
    const job = this.findJob(jobKey);
    if (job?.state !== 'needs-vault-choice') return;
    await this.runOrFail({ jobKey, work: () => this.writeCollectedSong({ job, vaultSongChoice: choice }) });
  }

  /** Hides a finished job from the list. */
  async dismissJob(jobKey: string): Promise<void> {
    const job = this.findJob(jobKey);
    if (!job || isGeneratorJobOpen(job)) return;
    this.savedJobs = this.savedJobs.filter((saved) => saved.jobKey !== jobKey);
    await this.saveJobs();
  }

  private async sendAndFinish({ start, jobGenerator }: { start: GeneratorJobStart; jobGenerator: JobGenerator }): Promise<void> {
    const job = this.getJob(start.jobKey);
    const startResult = await startGeneratorJob({ httpClient: this.dependencies.multipartHttpClient, generator: jobGenerator.generator, signIn: jobGenerator.signIn, song: start.song, difficulties: start.difficulties, music: start.music, video: start.video });
    if (startResult.kind === 'already-exists') {
      await this.handleExistingSong({ job, message: startResult.message, vaultSongId: startResult.vaultSongId });
      return;
    }
    await this.saveJob({ ...job, jobId: startResult.job.jobId, retryAfterSeconds: startResult.job.retryAfterSeconds, state: 'waiting', updatedAt: this.dependencies.getNow() });
    await this.logStep({ job, step: 'started' });
    await this.waitAndFinish(job.jobKey);
  }

  /** Only StepsVault's generator may answer with a vault song: Sync adds it to the vault, and no token is spent. */
  private async handleExistingSong({ job, message, vaultSongId }: { job: SavedGeneratorJob; message: string; vaultSongId: string | null }): Promise<void> {
    if (!job.isStepsVault || vaultSongId === null) {
      await this.finishJob({ job, changes: { state: 'failed', message }, step: 'failed' });
      await this.dependencies.jobFiles.removeJobFiles(job.jobKey);
      return;
    }
    await this.dependencies.addSongToVault(vaultSongId);
    await this.finishJob({ job, changes: { state: 'done', result: 'already-in-vault', message }, step: 'added-to-vault' });
    await this.dependencies.addVaultSongToGame({ job: this.getJob(job.jobKey), vaultSongId });
    await this.dependencies.jobFiles.removeJobFiles(job.jobKey);
  }

  private async waitAndFinish(jobKey: string): Promise<void> {
    const jobGenerator = this.dependencies.findGenerator(this.getJob(jobKey).generatorBaseUrl);
    if (!jobGenerator) {
      const job = this.getJob(jobKey);
      await this.finishJob({ job, changes: { state: 'failed', message: `You removed ${job.generatorName}, so Sync can’t finish this song. Add the generator again and make the song again.` }, step: 'failed' });
      return;
    }
    for (;;) {
      const job = this.getJob(jobKey);
      const outcome = await waitForGeneratorJob({
        httpClient: this.dependencies.httpClient, generator: jobGenerator.generator, signIn: jobGenerator.signIn, job: { jobId: job.jobId ?? '', retryAfterSeconds: job.retryAfterSeconds },
        waitSeconds: (seconds) => this.waitUnlessCancelled({ jobKey, seconds }),
        shouldStop: () => this.cancelRequestedJobKeys.has(jobKey),
        onProgress: (status) => void this.saveJob({ ...this.getJob(jobKey), progress: status.progress, stage: status.stage, retryAfterSeconds: status.retryAfterSeconds, updatedAt: this.dependencies.getNow() }),
      });
      if (outcome.kind === 'done') return this.handleFinishedJob({ jobKey, jobGenerator, files: outcome.files, vaultSongId: outcome.vaultSongId });
      if (await this.handleCancelResult({ jobKey, cancelResult: outcome.cancelResult })) return;
    }
  }

  /** True when the job ended; false when the generator couldn't stop it, so Sync goes on waiting for the song. */
  private async handleCancelResult({ jobKey, cancelResult }: { jobKey: string; cancelResult: GeneratorCancelResult }): Promise<boolean> {
    this.cancelRequestedJobKeys.delete(jobKey);
    const job = this.getJob(jobKey);
    if (cancelResult.kind === 'not-cancelled') {
      await this.saveJob({ ...job, message: cancelResult.message, updatedAt: this.dependencies.getNow() });
      await this.logStep({ job, step: 'not-cancelled', message: cancelResult.message });
      return false;
    }
    const message = cancelResult.kind === 'unknown' ? `Sync stopped waiting. ${job.generatorName} didn’t say whether it stopped too.` : null;
    await this.finishJob({ job, changes: { state: 'cancelled', message }, step: 'cancelled' });
    await this.dependencies.jobFiles.removeJobFiles(jobKey);
    return true;
  }

  private async handleFinishedJob({ jobKey, jobGenerator, files, vaultSongId }: { jobKey: string; jobGenerator: JobGenerator; files: Parameters<typeof collectGeneratorFiles>[0]['files']; vaultSongId: string | null }): Promise<void> {
    const job = this.getJob(jobKey);
    if (job.isStepsVault) {
      if (vaultSongId !== null) await this.dependencies.addSongToVault(vaultSongId);
      await this.finishJob({ job, changes: { state: 'done', result: 'added-to-vault' }, step: 'added-to-vault' });
      await this.dependencies.addVaultSongToGame({ job: this.getJob(jobKey), vaultSongId });
      await this.dependencies.jobFiles.removeJobFiles(jobKey);
      return;
    }
    const collectedFiles = await collectGeneratorFiles({ httpClient: this.dependencies.httpClient, generator: jobGenerator.generator, signIn: jobGenerator.signIn, files, downloadGeneratorFile: this.dependencies.jobFiles.buildDownloadGeneratorFile(jobKey) });
    const collectedFilesLocation = await this.dependencies.jobFiles.saveCollectedFiles({ jobKey, files: collectedFiles });
    await this.saveJob({ ...job, collectedFilesLocation, progress: 1, updatedAt: this.dependencies.getNow() });
    await this.writeCollectedSong({ job: this.getJob(jobKey), vaultSongChoice: null });
  }

  private async writeCollectedSong({ job, vaultSongChoice }: { job: SavedGeneratorJob; vaultSongChoice: VaultSongChoice | null }): Promise<void> {
    const files = await this.dependencies.jobFiles.loadCollectedFiles(job.collectedFilesLocation ?? '');
    const request: GeneratedSongRequest = {
      generator: { id: job.generatorId, name: job.generatorName, version: job.generatorVersion }, song: job.song, difficulties: job.difficulties, files,
      playerMusicSourceId: this.dependencies.registerPlayerFile(job.playerMusicLocation), playerVideoSourceId: job.playerVideoLocation === null ? null : this.dependencies.registerPlayerFile(job.playerVideoLocation),
    };
    const result = await this.dependencies.writeSong({ request, vaultSongChoice });
    if (result.kind === 'needs-vault-choice') {
      await this.saveJob({ ...job, state: 'needs-vault-choice', vaultChoice: { vaultSongId: result.vaultSongId, question: result.question }, updatedAt: this.dependencies.getNow() });
      return;
    }
    if (result.kind === 'written' && files.reportText !== null) await this.dependencies.saveReport({ songKey: getGeneratedSongKey(job.song), reportText: files.reportText });
    const folderPath = result.kind === 'written' ? result.generatedSong.folderPath : [];
    await this.finishJob({ job, changes: { state: 'done', result: result.kind === 'written' ? 'written' : 'kept-vault-song', vaultChoice: null }, step: result.kind === 'written' ? 'written' : 'kept-vault-song', folderPath });
    await this.dependencies.jobFiles.removeJobFiles(job.jobKey);
  }

  /** Any failure ends the job with a sentence for the player; its downloaded files are removed. */
  private async runOrFail({ jobKey, work }: { jobKey: string; work: () => Promise<void> }): Promise<void> {
    try {
      await work();
    } catch (error) {
      const job = this.findJob(jobKey);
      if (!job || !isGeneratorJobOpen(job)) return;
      const message = error instanceof Error ? error.message : 'Something went wrong while making the song. Make it again.';
      await this.finishJob({ job, changes: { state: 'failed', message, vaultChoice: null }, step: 'failed' });
      await this.dependencies.jobFiles.removeJobFiles(jobKey).catch(() => undefined);
    }
  }

  private async waitUnlessCancelled({ jobKey, seconds }: { jobKey: string; seconds: number }): Promise<void> {
    for (let waitedMilliseconds = 0; waitedMilliseconds < seconds * 1000 && !this.cancelRequestedJobKeys.has(jobKey); waitedMilliseconds += CANCEL_CHECK_EVERY_MILLISECONDS) {
      await this.dependencies.waitMilliseconds(CANCEL_CHECK_EVERY_MILLISECONDS);
    }
  }

  private async finishJob({ job, changes, step, folderPath = [] }: { job: SavedGeneratorJob; changes: Partial<SavedGeneratorJob>; step: GeneratedSongActivityStep; folderPath?: readonly string[] }): Promise<void> {
    const finishedJob = { ...this.getJob(job.jobKey), ...changes, updatedAt: this.dependencies.getNow() };
    await this.saveJob(finishedJob);
    await this.logStep({ job: finishedJob, step, folderPath, message: finishedJob.state === 'done' ? undefined : (finishedJob.message ?? undefined) });
  }

  private logStep({ job, step, folderPath = [], message }: { job: SavedGeneratorJob; step: GeneratedSongActivityStep; folderPath?: readonly string[]; message?: string }): Promise<void> {
    return this.dependencies.logActivity({ kind: 'generated-song', step, at: this.dependencies.getNow(), songTitle: job.song.title, generatorName: job.generatorName, folderPath, ...(message === undefined ? {} : { message }) });
  }

  private findJob(jobKey: string): SavedGeneratorJob | undefined {
    return this.savedJobs.find((job) => job.jobKey === jobKey);
  }

  private getJob(jobKey: string): SavedGeneratorJob {
    const job = this.findJob(jobKey);
    if (!job) throw new Error('Sync lost track of this song. Make it again.');
    return job;
  }

  private async saveJob(job: SavedGeneratorJob): Promise<void> {
    this.savedJobs = withSavedGeneratorJob({ jobs: this.savedJobs, job });
    await this.saveJobs();
  }

  /** Saves one after another, so an older list never lands on disk after a newer one. */
  private saveJobs(): Promise<void> {
    const jobs = this.savedJobs;
    this.saving = this.saving.then(() => this.dependencies.jobStore.save(jobs)).catch(() => undefined);
    this.dependencies.onChange();
    return this.saving;
  }
}

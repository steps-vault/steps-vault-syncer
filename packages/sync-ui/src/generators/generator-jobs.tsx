import type { ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { joinClassNames } from '../shared/class-names';
import { LifeBar } from '../shared/life-bar';
import type { GeneratorJobView, VaultChoiceAnswer } from '../sync-ui-types';

export interface GeneratorJobActions {
  onCancelJob: (jobKey: string) => void;
  onAnswerVaultChoice: (answer: VaultChoiceAnswer) => void;
}

export const LIBRARY_SONG_QUESTION = 'Already in the library. Keep the library song, or the generated one?';

/** Where one song stands: the generator's stage, the question about the library song, or how it ended. */
export function GeneratorJobProgress({ job, onCancelJob, onAnswerVaultChoice }: { job: GeneratorJobView } & GeneratorJobActions): ReactElement {
  if (job.state === 'working') return <WorkingJob job={job} onCancelJob={onCancelJob} />;
  if (job.state === 'needs-vault-choice') return <VaultChoice job={job} onAnswerVaultChoice={onAnswerVaultChoice} />;
  return <JobEnding job={job} />;
}

/** How a job ended, in one line: done, failed (with why) or cancelled. */
export function JobEnding({ job }: { job: GeneratorJobView }): ReactElement {
  if (job.state === 'done') return <div className="sv-sync-row sv-sync-job-end sv-sync-good-text" role="status"><Icon name="check" size={14} strokeWidth={2.6} />{job.doneText}</div>;
  if (job.state === 'failed') return <div className="sv-sync-row sv-sync-job-end sv-sync-error-text" role="alert"><Icon name="warning" size={14} />Failed: {job.message}</div>;
  return <div className="sv-sync-row sv-sync-job-end sv-sync-muted" role="status"><Icon name="none" size={14} />{job.message ?? 'Cancelled.'}</div>;
}

function WorkingJob({ job, onCancelJob }: { job: GeneratorJobView; onCancelJob: (jobKey: string) => void }): ReactElement {
  return (
    <div className="sv-sync-stack-small" aria-live="polite">
      <div className="sv-sync-row sv-sync-space-between">
        <span className="sv-sync-stage-line"><Icon name="spin" size={18} strokeWidth={2.4} className="sv-sync-spin" />{job.stageText}</span>
        <span className="sv-sync-row">
          {job.progressPercent !== null && <span className="sv-sync-tabular sv-sync-muted sv-sync-small">{job.progressPercent}%</span>}
          <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={() => { onCancelJob(job.jobKey); }} aria-label={`Cancel ${job.songTitle}`}>Cancel</button>
        </span>
      </div>
      <LifeBar label={`Making the steps for ${job.songTitle}`} value={job.progressPercent ?? 0} maximum={100} />
      {job.message !== null && <span className="sv-sync-row sv-sync-small sv-sync-warning-text"><Icon name="warning" size={14} />{job.message}</span>}
    </div>
  );
}

function VaultChoice({ job, onAnswerVaultChoice }: { job: GeneratorJobView; onAnswerVaultChoice: (answer: VaultChoiceAnswer) => void }): ReactElement {
  return (
    <div className="sv-sync-job-question" role="group" aria-label={LIBRARY_SONG_QUESTION}>
      <span>{job.vaultChoiceQuestion ?? LIBRARY_SONG_QUESTION}</span>
      <span className="sv-sync-row sv-sync-wrap">
        <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={() => { onAnswerVaultChoice({ jobKey: job.jobKey, choice: 'keep-vault-song' }); }}>Keep library song</button>
        <button className="sv-sync-button sv-sync-button--small" type="button" onClick={() => { onAnswerVaultChoice({ jobKey: job.jobKey, choice: 'keep-generated-song' }); }}>Use generated</button>
      </span>
    </div>
  );
}

export interface GeneratorJobListProps extends GeneratorJobActions {
  jobs: readonly GeneratorJobView[];
  onDismissJob: (jobKey: string) => void;
}

/** Songs being made, and how the last ones ended. Making a song goes on with the dialog closed. */
export function GeneratorJobList({ jobs, onDismissJob, ...actions }: GeneratorJobListProps): ReactElement | null {
  if (jobs.length === 0) return null;
  return (
    <section className="sv-sync-stack" aria-labelledby="sv-sync-generator-jobs-heading">
      <h2 id="sv-sync-generator-jobs-heading" className="sv-sync-heading-2">Songs being made</h2>
      <ul className="sv-sync-generator-jobs">
        {jobs.map((job) => {
          const hasEnded = job.state !== 'working' && job.state !== 'needs-vault-choice';
          return (
            <li key={job.jobKey} className={joinClassNames('sv-sync-generator-job', hasEnded && 'sv-sync-generator-job--ended')} aria-label={job.songTitle}>
              <div className="sv-sync-row sv-sync-space-between">
                <span className="sv-sync-min-width-0">
                  <b className="sv-sync-strong" dir="auto">{job.songTitle}</b> <span className="sv-sync-muted" dir="auto">— {job.songArtist}</span>
                  <span className="sv-sync-small sv-sync-subtle"> · {job.generatorName}</span>
                </span>
                {hasEnded && (
                  <button className="sv-sync-close-button" type="button" aria-label={`Hide ${job.songTitle}`} onClick={() => { onDismissJob(job.jobKey); }}><Icon name="close" size={14} strokeWidth={2.6} /></button>
                )}
              </div>
              <GeneratorJobProgress job={job} {...actions} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

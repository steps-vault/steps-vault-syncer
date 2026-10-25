import type { GeneratorDifficulty } from '@stepsvault/sync-core';
import { useState, type ReactElement } from 'react';
import { SyncDialog } from '../dialog/sync-dialog';
import { Icon } from '../icons/icon';
import { joinClassNames } from '../shared/class-names';
import type { GeneratorJobView, GeneratorView, MakeSongRequest, MakeSongResult, MusicChoiceView, StepsVaultGeneratorView } from '../sync-ui-types';
import { STEPSVAULT_GENERATOR_ID } from '../views/build-generator-views';
import { MusicUploadWarning } from './add-generator-dialog';
import { GeneratorJobProgress, type GeneratorJobActions } from './generator-jobs';
import { MusicTabs, type MusicSources } from './music-step';

const DIFFICULTY_SHORT_NAMES: Readonly<Record<GeneratorDifficulty, string>> = { Beginner: 'B', Easy: 'E', Medium: 'M', Hard: 'H', Challenge: 'C' };
const DEFAULT_DIFFICULTIES: readonly GeneratorDifficulty[] = ['Easy', 'Medium', 'Hard'];

export interface MakeSongDialogProps extends MusicSources, GeneratorJobActions {
  stepsVaultGenerator: StepsVaultGeneratorView;
  generators: readonly GeneratorView[];
  jobs: readonly GeneratorJobView[];
  /** Gets the music ready and sends it to the generator; resolves once the job started, or with a sentence why not. */
  onMakeSong: (request: MakeSongRequest) => Promise<MakeSongResult>;
  onClose: () => void;
}

type DialogStep = { kind: 'music' } | { kind: 'setup'; music: MusicChoiceView } | { kind: 'job'; music: MusicChoiceView; jobKey: string };

/** Make a song: pick the music, then the generator and difficulties, then watch it being made. */
export function MakeSongDialog(props: MakeSongDialogProps): ReactElement {
  const [step, setStep] = useState<DialogStep>({ kind: 'music' });
  const [pickedMusic, setPickedMusic] = useState<MusicChoiceView | null>(null);
  return (
    <SyncDialog titleId="sv-sync-make-song-title" onClose={props.onClose} focusKey={step.kind}>
      {step.kind === 'music' && (
        <>
          <div className="sv-sync-eyebrow">Make a song · step 1 of 2</div>
          <h2 id="sv-sync-make-song-title" className="sv-sync-heading-2">Pick the music</h2>
          <MusicTabs {...props} pickedMusic={pickedMusic} onPickMusic={setPickedMusic} />
          <div className="sv-sync-dialog-buttons">
            <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={props.onClose} data-autofocus>Cancel</button>
            <button className="sv-sync-button" type="button" disabled={pickedMusic === null} onClick={() => { if (pickedMusic) setStep({ kind: 'setup', music: pickedMusic }); }}>Next</button>
          </div>
        </>
      )}
      {step.kind === 'setup' && <SetupStep {...props} music={step.music} onBack={() => { setStep({ kind: 'music' }); }} onStarted={(jobKey) => { setStep({ kind: 'job', music: step.music, jobKey }); }} />}
      {step.kind === 'job' && <JobStep {...props} music={step.music} jobKey={step.jobKey} />}
    </SyncDialog>
  );
}

interface GeneratorChoice {
  generatorId: string;
  name: string;
  subtitle: string;
  tag: string;
  difficulties: readonly GeneratorDifficulty[];
  /** The address the music goes to, shown as a warning; null on this computer. */
  uploadAddress: string | null;
  uploadWarning: string | null;
}

function getGeneratorChoices({ stepsVaultGenerator, generators }: { stepsVaultGenerator: StepsVaultGeneratorView; generators: readonly GeneratorView[] }): GeneratorChoice[] {
  const tokenText = stepsVaultGenerator.tokenCount === null ? '' : ` · you have ${String(stepsVaultGenerator.tokenCount)} ${stepsVaultGenerator.tokenCount === 1 ? 'token' : 'tokens'}`;
  const stepsVaultChoice: GeneratorChoice = { generatorId: STEPSVAULT_GENERATOR_ID, name: 'StepsVault generator', subtitle: `Goes to the vault for everyone · uses 1 token${tokenText}`, tag: 'Default', difficulties: stepsVaultGenerator.difficulties ?? [], uploadAddress: null, uploadWarning: stepsVaultGenerator.musicUploadWarning };
  const communityChoices = generators.map((generator): GeneratorChoice => {
    const isOnInternet = generator.location.kind === 'internet';
    const whereText = generator.location.kind === 'internet' ? `On the internet: ${generator.location.address}` : 'On this computer';
    return { generatorId: generator.generatorId, name: generator.name, subtitle: `${whereText} · song stays on this computer`, tag: isOnInternet ? 'Internet' : 'This PC', difficulties: generator.difficulties, uploadAddress: generator.location.kind === 'internet' ? generator.location.address : null, uploadWarning: null };
  });
  return [stepsVaultChoice, ...communityChoices];
}

interface SetupStepProps extends MakeSongDialogProps {
  music: MusicChoiceView;
  onBack: () => void;
  onStarted: (jobKey: string) => void;
}

function SetupStep(props: SetupStepProps): ReactElement {
  const choices = getGeneratorChoices(props);
  const [generatorId, setGeneratorId] = useState(choices.find((choice) => choice.difficulties.length > 0)?.generatorId ?? STEPSVAULT_GENERATOR_ID);
  const pickedChoice = choices.find((choice) => choice.generatorId === generatorId) ?? choices[0];
  const [difficulties, setDifficulties] = useState<readonly GeneratorDifficulty[]>(DEFAULT_DIFFICULTIES);
  const [problem, setProblem] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const pickedDifficulties = (pickedChoice?.difficulties ?? []).filter((difficulty) => difficulties.includes(difficulty));
  const toggleDifficulty = (difficulty: GeneratorDifficulty): void => {
    setDifficulties((current) => (current.includes(difficulty) ? current.filter((picked) => picked !== difficulty) : [...current, difficulty]));
  };
  const makeSong = async (): Promise<void> => {
    if (!pickedChoice || pickedDifficulties.length === 0) return;
    setIsStarting(true);
    setProblem(null);
    const result = await props.onMakeSong({ musicId: props.music.musicId, generatorId: pickedChoice.generatorId, difficulties: pickedDifficulties, hasAgreedToMusicUpload: pickedChoice.uploadAddress !== null || pickedChoice.uploadWarning !== null }).catch((): MakeSongResult => ({ kind: 'failed', message: 'Sync couldn’t start this song. Try again.' }));
    setIsStarting(false);
    if (result.kind === 'failed') setProblem(result.message);
    else props.onStarted(result.jobKey);
  };
  const isStepsVault = pickedChoice?.generatorId === STEPSVAULT_GENERATOR_ID;
  const isOutOfTokens = isStepsVault && props.stepsVaultGenerator.tokenCount === 0;
  return (
    <>
      <div className="sv-sync-eyebrow">Make a song · step 2 of 2</div>
      <h2 id="sv-sync-make-song-title" className="sv-sync-heading-2">Pick the generator and difficulties</h2>
      <div className="sv-sync-addon-who"><Icon name="note" size={18} className="sv-sync-link-colour" /><span>Music: <b className="sv-sync-strong" dir="auto">{props.music.title} — {props.music.artist}</b></span></div>
      <span className="sv-sync-label sv-sync-label--plain" id="sv-sync-generator-choice-label">Generator</span>
      <div className="sv-sync-pick-list" role="radiogroup" aria-labelledby="sv-sync-generator-choice-label">
        {choices.map((choice) => (
          <label key={choice.generatorId} className={joinClassNames('sv-sync-pick', choice.generatorId === generatorId && 'sv-sync-pick--on')}>
            <input type="radio" name="sv-sync-generator" checked={choice.generatorId === generatorId} disabled={choice.difficulties.length === 0} onChange={() => { setGeneratorId(choice.generatorId); }} />
            <span className="sv-sync-min-width-0"><span className="sv-sync-pick-title">{choice.name}</span><span className="sv-sync-pick-subtitle">{choice.difficulties.length === 0 ? 'Can’t be reached right now' : choice.subtitle}</span></span>
            <span className={joinClassNames('sv-sync-badge', choice.generatorId === STEPSVAULT_GENERATOR_ID && 'sv-sync-badge--default')}>{choice.tag}</span>
          </label>
        ))}
      </div>
      <DifficultyChecks difficulties={pickedChoice?.difficulties ?? []} pickedDifficulties={pickedDifficulties} onToggle={toggleDifficulty} />
      {pickedDifficulties.length === 0 && <div className="sv-sync-small sv-sync-error-text" role="alert">Pick at least one difficulty.</div>}
      {pickedChoice?.uploadAddress && <MusicUploadWarning address={pickedChoice.uploadAddress} />}
      {pickedChoice?.uploadWarning && <div className="sv-sync-warning-box" role="note"><Icon name="warning" size={18} /><span>{pickedChoice.uploadWarning}</span></div>}
      {isOutOfTokens && (
        <div className="sv-sync-row sv-sync-wrap sv-sync-small sv-sync-warning-text" role="alert">
          <Icon name="warning" size={14} />You have no tokens left. Buy tokens, or pick a community generator.
          <a className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" href={props.stepsVaultGenerator.tokensHref} target="_blank" rel="noreferrer">Buy tokens</a>
        </div>
      )}
      {problem !== null && <div className="sv-sync-small sv-sync-error-text sv-sync-row" role="alert"><Icon name="warning" size={14} />{problem}</div>}
      <div className="sv-sync-dialog-buttons sv-sync-space-between">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={props.onBack}>Back</button>
        <span className="sv-sync-row">
          <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={props.onClose}>Cancel</button>
          <button className="sv-sync-button sv-sync-button--go" type="button" disabled={isStarting || isOutOfTokens || pickedDifficulties.length === 0} onClick={() => void makeSong()}>
            {isStarting ? 'Getting the music ready…' : isStepsVault ? 'Make the steps · 1 token' : 'Make the steps'}
          </button>
        </span>
      </div>
    </>
  );
}

function DifficultyChecks({ difficulties, pickedDifficulties, onToggle }: { difficulties: readonly GeneratorDifficulty[]; pickedDifficulties: readonly GeneratorDifficulty[]; onToggle: (difficulty: GeneratorDifficulty) => void }): ReactElement {
  return (
    <>
      <span className="sv-sync-label sv-sync-label--plain" id="sv-sync-difficulty-label">Difficulties</span>
      <div className="sv-sync-difficulty-checks" role="group" aria-labelledby="sv-sync-difficulty-label">
        {difficulties.map((difficulty) => (
          <label key={difficulty} className={joinClassNames('sv-sync-difficulty-check', `sv-sync-difficulty--${difficulty.toLowerCase()}`)}>
            <input type="checkbox" checked={pickedDifficulties.includes(difficulty)} onChange={() => { onToggle(difficulty); }} />
            <span className="sv-sync-difficulty-letter" aria-hidden="true">{DIFFICULTY_SHORT_NAMES[difficulty]}</span>
            {difficulty}
          </label>
        ))}
      </div>
    </>
  );
}

function JobStep(props: MakeSongDialogProps & { music: MusicChoiceView; jobKey: string }): ReactElement {
  const job = props.jobs.find((candidate) => candidate.jobKey === props.jobKey);
  if (job?.state === 'done') {
    return (
      <>
        <span className="sv-sync-done-icon" aria-hidden="true"><Icon name="check" size={28} strokeWidth={2.8} /></span>
        <h2 id="sv-sync-make-song-title" className="sv-sync-heading-2">Your song is ready</h2>
        <p className="sv-sync-text sv-sync-text--large"><b className="sv-sync-strong" dir="auto">{job.songTitle}</b> — {job.doneText}</p>
        <div className="sv-sync-dialog-buttons"><button className="sv-sync-button" type="button" onClick={props.onClose} data-autofocus>Done</button></div>
      </>
    );
  }
  return (
    <>
      <div className="sv-sync-eyebrow">Make a song</div>
      <h2 id="sv-sync-make-song-title" className="sv-sync-heading-2">Making the steps</h2>
      <span className="sv-sync-text"><b className="sv-sync-strong" dir="auto">{props.music.title} — {props.music.artist}</b>{job ? ` · with ${job.generatorName}` : ''}</span>
      {job ? <GeneratorJobProgress job={job} onCancelJob={props.onCancelJob} onAnswerVaultChoice={props.onAnswerVaultChoice} /> : <span className="sv-sync-small sv-sync-muted">Starting…</span>}
      {job?.state === 'working' && <span className="sv-sync-small sv-sync-muted">You can close this window. Sync keeps going and tells you when it&apos;s done.</span>}
      {job && job.state !== 'working' && job.state !== 'needs-vault-choice' && <div className="sv-sync-dialog-buttons"><button className="sv-sync-button" type="button" onClick={props.onClose}>Close</button></div>}
    </>
  );
}

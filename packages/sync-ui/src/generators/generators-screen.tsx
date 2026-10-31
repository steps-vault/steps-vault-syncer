import { useEffect, useState, type ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { LIBRARY_GENERATOR_NAME } from '../shared/brand-names';
import { InfoPanel, InfoToggleButton, Note } from '../shared/small-parts';
import type { GeneratedSongView, GeneratorInstallPreview, GeneratorJobView, GeneratorLookupResult, GeneratorView, PreselectedSongView, ServiceLookupRequest, StepsVaultGeneratorView } from '../sync-ui-types';
import { AddGeneratorDialog, GENERATOR_TRUST_NOTE } from './add-generator-dialog';
import { GeneratedSongList } from './generated-song-list';
import { GeneratorCard, StepsVaultGeneratorCard } from './generator-card';
import { GeneratorJobList, type GeneratorJobActions } from './generator-jobs';
import { MakeSongDialog, type MakeSongDialogProps } from './make-song-dialog';
import type { MusicSources } from './music-step';

export interface GeneratorsScreenProps extends MusicSources, GeneratorJobActions {
  stepsVaultGenerator: StepsVaultGeneratorView;
  generators: readonly GeneratorView[];
  jobs: readonly GeneratorJobView[];
  generatedSongs: readonly GeneratedSongView[];
  /** Desktop only: offer a start command for a generator on this computer. */
  canUseStartCommand: boolean;
  onLookUpGenerator: (request: ServiceLookupRequest) => Promise<GeneratorLookupResult>;
  onAddGenerator: (generator: GeneratorInstallPreview) => void;
  onRemoveGenerator: (generatorId: string) => void;
  onSetGeneratorOption: (request: { generatorId: string; optionId: string; value: string }) => void;
  onMakeSong: MakeSongDialogProps['onMakeSong'];
  onDismissJob: (jobKey: string) => void;
  onFetchSongReport: (songKey: string) => Promise<string | null>;
  /** The website's My songs page, where the player sees every song they made. */
  mySongsHref?: string;
  /**
   * A song to make, for example from a link on the website. With a generator of their own, Make a song opens with it
   * at once; without one, a note says to add one first.
   */
  preselectedSong?: PreselectedSongView | null;
  /** The player closed Make a song, or the note, without making the preselected song. */
  onDismissPreselectedSong?: (preselectionKey: string) => void;
}

/** Make a song is closed, or open with the song it was opened for (null for a plain Make a song). */
type MakeSongDialogState = { isOpen: false } | { isOpen: true; preselectedSong: PreselectedSongView | null };

/** The Generators section: the site's own generator, the player's community generators, and Make a song. */
export function GeneratorsScreen(props: GeneratorsScreenProps): ReactElement {
  const [isAddingGenerator, setIsAddingGenerator] = useState(false);
  const [makeSongDialog, setMakeSongDialog] = useState<MakeSongDialogState>({ isOpen: false });
  const [isExplaining, setIsExplaining] = useState(false);
  const preselectedSong = props.preselectedSong ?? null;
  const hasOwnGenerator = props.generators.length > 0;
  useEffect(() => {
    if (preselectedSong && hasOwnGenerator) setMakeSongDialog({ isOpen: true, preselectedSong });
    // A new preselection opens Make a song once; so does adding a first generator while one waits.
  }, [preselectedSong?.preselectionKey, hasOwnGenerator]);
  const openMakeSong = (): void => {
    setMakeSongDialog({ isOpen: true, preselectedSong });
  };
  const closeMakeSong = (): void => {
    if (makeSongDialog.isOpen && makeSongDialog.preselectedSong) props.onDismissPreselectedSong?.(makeSongDialog.preselectedSong.preselectionKey);
    setMakeSongDialog({ isOpen: false });
  };
  return (
    <div className="sv-sync-screen">
      <div className="sv-sync-row sv-sync-space-between sv-sync-wrap sv-sync-align-end">
        <div className="sv-sync-stack-small">
          <div className="sv-sync-row">
            <h2 className="sv-sync-heading-1 sv-sync-heading-1--medium">Generators</h2>
            <InfoToggleButton label="What is a generator?" isOpen={isExplaining} onToggle={() => { setIsExplaining(!isExplaining); }} controlsId="sv-sync-generators-explained" />
          </div>
          {isExplaining && <InfoPanel id="sv-sync-generators-explained">A generator listens to your music and makes the steps. You pick one each time you generate a song.</InfoPanel>}
        </div>
        <button className="sv-sync-button" type="button" onClick={openMakeSong}><Icon name="sparkle" strokeWidth={2.4} />Make a song</button>
      </div>
      {preselectedSong && !makeSongDialog.isOpen && <PreselectedSongNote preselectedSong={preselectedSong} hasOwnGenerator={hasOwnGenerator} onDismiss={props.onDismissPreselectedSong} />}
      <StepsVaultGeneratorCard generator={props.stepsVaultGenerator} />
      <GeneratorJobList jobs={props.jobs} onCancelJob={props.onCancelJob} onAnswerVaultChoice={props.onAnswerVaultChoice} onDismissJob={props.onDismissJob} />
      <CommunityGenerators {...props} onAdd={() => { setIsAddingGenerator(true); }} />
      <GeneratedSongList songs={props.generatedSongs} onFetchSongReport={props.onFetchSongReport} onMakeSong={openMakeSong} />
      {isAddingGenerator && (
        <AddGeneratorDialog onLookUpGenerator={props.onLookUpGenerator} canUseStartCommand={props.canUseStartCommand} onAdd={(generator) => { setIsAddingGenerator(false); props.onAddGenerator(generator); }} onClose={() => { setIsAddingGenerator(false); }} />
      )}
      {makeSongDialog.isOpen && <MakeSongDialog key={makeSongDialog.preselectedSong?.preselectionKey ?? 'plain'} {...props} preselectedSong={makeSongDialog.preselectedSong} onClose={closeMakeSong} />}
    </div>
  );
}

/** Shown while a preselected song waits: without a generator of their own, the player adds one first (or pays a token). */
function PreselectedSongNote({ preselectedSong, hasOwnGenerator, onDismiss }: { preselectedSong: PreselectedSongView; hasOwnGenerator: boolean; onDismiss?: (preselectionKey: string) => void }): ReactElement {
  const songName = <b className="sv-sync-strong" dir="auto">{[preselectedSong.title, preselectedSong.artist].filter(Boolean).join(' · ')}</b>;
  return (
    <div className="sv-sync-row sv-sync-wrap" role="status">
      <Note iconName="note" className="sv-sync-grow">
        {hasOwnGenerator
          ? <>To make {songName}, choose <b>Make a song</b>.</>
          : <>To make {songName} for free, you need a generator of your own. Use <b>Add a generator</b> first, then <b>Make a song</b>. Or make it now with the {LIBRARY_GENERATOR_NAME} for 1 token.</>}
      </Note>
      {onDismiss && <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={() => { onDismiss(preselectedSong.preselectionKey); }}>Not now</button>}
    </div>
  );
}

function CommunityGenerators(props: GeneratorsScreenProps & { onAdd: () => void }): ReactElement {
  return (
    <section className="sv-sync-stack" aria-labelledby="sv-sync-community-generators-heading">
      <div className="sv-sync-row sv-sync-space-between sv-sync-wrap sv-sync-align-end">
        <div className="sv-sync-stack-tiny">
          <h2 id="sv-sync-community-generators-heading" className="sv-sync-heading-2">Community generators</h2>
          <span className="sv-sync-text sv-sync-small">{GENERATOR_TRUST_NOTE}</span>
        </div>
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={props.onAdd}><Icon name="plus" strokeWidth={2.6} />Add a generator</button>
      </div>
      <div className="sv-sync-addon-list">
        {props.generators.map((generator) => <GeneratorCard key={generator.generatorId} generator={generator} onRemove={props.onRemoveGenerator} onSetOption={props.onSetGeneratorOption} />)}
        {props.generators.length === 0 && <Note>No community generators yet. Got an address from someone? Use <b>Add a generator</b>.</Note>}
      </div>
      <span className="sv-sync-text sv-sync-small">You can remove one any time. Songs it already made stay.</span>
      <Note iconName="computer">Their songs stay on this computer, never in the library. {props.mySongsHref ? <>See <a href={props.mySongsHref} target="_blank" rel="noreferrer">My songs</a>.</> : <>Find them in <b>My generated songs</b> in your game.</>}</Note>
    </section>
  );
}

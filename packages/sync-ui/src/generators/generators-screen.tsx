import { useState, type ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { Note } from '../shared/small-parts';
import type { GeneratedSongView, GeneratorInstallPreview, GeneratorJobView, GeneratorLookupResult, GeneratorView, ServiceLookupRequest, StepsVaultGeneratorView } from '../sync-ui-types';
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
}

/** The Generators section: StepsVault's own generator, the player's community generators, and Make a song. */
export function GeneratorsScreen(props: GeneratorsScreenProps): ReactElement {
  const [isAddingGenerator, setIsAddingGenerator] = useState(false);
  const [isMakingSong, setIsMakingSong] = useState(false);
  return (
    <div className="sv-sync-screen">
      <div className="sv-sync-row sv-sync-space-between sv-sync-wrap sv-sync-align-end">
        <div className="sv-sync-stack-small">
          <h2 className="sv-sync-heading-1 sv-sync-heading-1--medium">Generators</h2>
          <p className="sv-sync-text">A generator listens to your music and makes the steps. Pick which one makes each song.</p>
        </div>
        <button className="sv-sync-button" type="button" onClick={() => { setIsMakingSong(true); }}><Icon name="sparkle" strokeWidth={2.4} />Make a song</button>
      </div>
      <StepsVaultGeneratorCard generator={props.stepsVaultGenerator} />
      <GeneratorJobList jobs={props.jobs} onCancelJob={props.onCancelJob} onAnswerVaultChoice={props.onAnswerVaultChoice} onDismissJob={props.onDismissJob} />
      <CommunityGenerators {...props} onAdd={() => { setIsAddingGenerator(true); }} />
      <GeneratedSongList songs={props.generatedSongs} onFetchSongReport={props.onFetchSongReport} />
      {isAddingGenerator && (
        <AddGeneratorDialog onLookUpGenerator={props.onLookUpGenerator} canUseStartCommand={props.canUseStartCommand} onAdd={(generator) => { setIsAddingGenerator(false); props.onAddGenerator(generator); }} onClose={() => { setIsAddingGenerator(false); }} />
      )}
      {isMakingSong && <MakeSongDialog {...props} onClose={() => { setIsMakingSong(false); }} />}
    </div>
  );
}

function CommunityGenerators(props: GeneratorsScreenProps & { onAdd: () => void }): ReactElement {
  return (
    <section className="sv-sync-stack" aria-labelledby="sv-sync-community-generators-heading">
      <div className="sv-sync-row sv-sync-space-between sv-sync-wrap sv-sync-align-end">
        <div className="sv-sync-stack-tiny">
          <h2 id="sv-sync-community-generators-heading" className="sv-sync-heading-2">Community generators</h2>
          <span className="sv-sync-text sv-sync-small">Made by other people. Connect one by pasting its address.</span>
        </div>
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={props.onAdd}><Icon name="plus" strokeWidth={2.6} />Add a generator</button>
      </div>
      <div className="sv-sync-addon-list">
        {props.generators.map((generator) => <GeneratorCard key={generator.generatorId} generator={generator} onRemove={props.onRemoveGenerator} onSetOption={props.onSetGeneratorOption} />)}
        {props.generators.length === 0 && <Note>No community generators yet. Got an address from someone? Use <b>Add a generator</b>.</Note>}
      </div>
      <Note iconName="computer">Songs from community generators stay on this computer. They never go to the vault. You find them in <b>My generated songs</b> in your game.</Note>
      <Note>{GENERATOR_TRUST_NOTE} You can remove one any time — songs it already made stay.</Note>
    </section>
  );
}

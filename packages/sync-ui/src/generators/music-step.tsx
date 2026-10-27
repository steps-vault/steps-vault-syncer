import { getCheckedSongSourceInputValue, InvalidSongSourceInputError, type SongSourceInput } from '@stepsvault/sync-core';
import { useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { joinClassNames } from '../shared/class-names';
import { MissLine } from '../shared/miss-line';
import { ReceptorLoader } from '../shared/receptor-loader';
import type { MusicChoiceView, SongSourceSearchRequest, SongSourceSearchResult, SongSourceTabView } from '../sync-ui-types';

const MY_FILES_TAB_ID = 'my-files';
const MUSIC_FOLDERS_TAB_ID = 'music-folders';

export interface MusicSources {
  songSourceTabs: readonly SongSourceTabView[];
  /** Opens the platform's own file picker; null when the player closed it. */
  onChooseMusicFile: () => Promise<MusicChoiceView | null>;
  /** Searches the music folders Sync already knows. */
  onSearchMusic: (query: string) => Promise<readonly MusicChoiceView[]>;
  /** Asks a song source for the song the player described; resolves when it answers, gives up, or is stopped. */
  onFindSong: (request: SongSourceSearchRequest) => Promise<SongSourceSearchResult>;
  onStopFindingSong: () => void;
}

export interface MusicStepProps extends MusicSources {
  pickedMusic: MusicChoiceView | null;
  onPickMusic: (music: MusicChoiceView) => void;
  /** "Yes, use it" on a song a song source found: picks it and goes on to the next step. */
  onUseMusic?: (music: MusicChoiceView) => void;
}

/** "Get music from": the player's files, their music folders, and one tab per song source. */
export function MusicTabs(props: MusicStepProps): ReactElement {
  const tabs = [{ tabId: MY_FILES_TAB_ID, label: 'My files' }, { tabId: MUSIC_FOLDERS_TAB_ID, label: 'My music folders' }, ...props.songSourceTabs.map((tab) => ({ tabId: `addon-${tab.addonId}`, label: tab.name }))];
  const [selectedTabId, setSelectedTabId] = useState(MY_FILES_TAB_ID);
  const songSourceTab = props.songSourceTabs.find((tab) => `addon-${tab.addonId}` === selectedTabId);
  const moveSelection = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    const index = tabs.findIndex((tab) => tab.tabId === selectedTabId);
    setSelectedTabId(tabs[(index + step + tabs.length) % tabs.length]?.tabId ?? MY_FILES_TAB_ID);
  };
  return (
    <div className="sv-sync-stack-small">
      <span className="sv-sync-visually-hidden" id="sv-sync-music-tabs-label">Where the music comes from</span>
      <div className="sv-sync-tabs sv-sync-music-tabs" role="tablist" aria-labelledby="sv-sync-music-tabs-label" onKeyDown={moveSelection}>
        {tabs.map((tab) => (
          <button key={tab.tabId} id={`sv-sync-tab-${tab.tabId}`} type="button" role="tab" aria-selected={tab.tabId === selectedTabId} aria-controls="sv-sync-music-tab-panel" tabIndex={tab.tabId === selectedTabId ? 0 : -1} onClick={() => { setSelectedTabId(tab.tabId); }}>
            {tab.label}
          </button>
        ))}
      </div>
      <div id="sv-sync-music-tab-panel" className="sv-sync-tab-panel" role="tabpanel" aria-labelledby={`sv-sync-tab-${selectedTabId}`}>
        {selectedTabId === MY_FILES_TAB_ID && <MyFilesTab {...props} />}
        {selectedTabId === MUSIC_FOLDERS_TAB_ID && <MusicFoldersTab {...props} />}
        {songSourceTab && <SongSourceTab key={songSourceTab.addonId} tab={songSourceTab} {...props} />}
      </div>
    </div>
  );
}

/** One music the player can pick; the picked one is marked. */
export function MusicChoiceRow({ music, isPicked, onPick }: { music: MusicChoiceView; isPicked: boolean; onPick: (music: MusicChoiceView) => void }): ReactElement {
  return (
    <label className={joinClassNames('sv-sync-pick', isPicked && 'sv-sync-pick--on')}>
      <input type="radio" name="sv-sync-music" checked={isPicked} onChange={() => { onPick(music); }} />
      <span className="sv-sync-min-width-0">
        <span className="sv-sync-pick-title" dir="auto">{music.title} <span className="sv-sync-muted">· {music.artist}</span></span>
        <span className="sv-sync-pick-subtitle">{[music.sourceText, music.lengthText].filter(Boolean).join(' · ')}</span>
      </span>
      {music.hasVideo && <span className="sv-sync-badge">Video too</span>}
    </label>
  );
}

function MyFilesTab({ pickedMusic, onPickMusic, onChooseMusicFile }: MusicStepProps): ReactElement {
  const [chosenMusic, setChosenMusic] = useState<MusicChoiceView | null>(null);
  const chooseFile = async (): Promise<void> => {
    const music = await onChooseMusicFile();
    if (!music) return;
    setChosenMusic(music);
    onPickMusic(music);
  };
  return (
    <div className="sv-sync-stack-small">
      <button className="sv-sync-button sv-sync-button--ghost sv-sync-align-start" type="button" onClick={() => void chooseFile()}><Icon name="file" />Choose a file…</button>
      {chosenMusic && <MusicChoiceRow music={chosenMusic} isPicked={pickedMusic?.musicId === chosenMusic.musicId} onPick={onPickMusic} />}
    </div>
  );
}

function MusicFoldersTab({ pickedMusic, onPickMusic, onSearchMusic }: MusicStepProps): ReactElement {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly MusicChoiceView[] | null>(null);
  const search = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (query.trim() === '') return;
    setResults(await onSearchMusic(query.trim()).catch(() => []));
  };
  return (
    <div className="sv-sync-stack-small">
      <form className="sv-sync-row" role="search" onSubmit={(event) => void search(event)}>
        <label className="sv-sync-grow sv-sync-search-box">
          <span className="sv-sync-visually-hidden">Search your music folders</span>
          <Icon name="search" />
          <input className="sv-sync-field" type="search" value={query} placeholder="Search your music" onChange={(event) => { setQuery(event.target.value); }} />
        </label>
        <button className="sv-sync-button sv-sync-button--ghost" type="submit"><Icon name="search" />Search</button>
      </form>
      {results?.length === 0 && <span className="sv-sync-small sv-sync-muted">No music found for “{query.trim()}”. Check your music folders under Audio sources.</span>}
      {results && results.length > 0 && (
        <div className="sv-sync-pick-list" role="radiogroup" aria-label="Music in your folders">
          {results.map((music) => <MusicChoiceRow key={music.musicId} music={music} isPicked={pickedMusic?.musicId === music.musicId} onPick={onPickMusic} />)}
        </div>
      )}
    </div>
  );
}

type SearchState =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'found'; musics: readonly MusicChoiceView[]; checkedMusic: MusicChoiceView | null }
  | { kind: 'problem'; message: string };

function SongSourceTab({ tab, pickedMusic, onPickMusic, onUseMusic, onFindSong, onStopFindingSong }: MusicStepProps & { tab: SongSourceTabView }): ReactElement {
  const [valuesByInputId, setValuesByInputId] = useState<Record<string, string>>({});
  const [problemsByInputId, setProblemsByInputId] = useState<Record<string, string>>({});
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  const changeValue = ({ input, value }: { input: SongSourceInput; value: string }): void => {
    setValuesByInputId((current) => ({ ...current, [input.id]: value }));
    setProblemsByInputId((current) => ({ ...current, [input.id]: value.trim() === '' ? '' : (getInputProblemOrNull({ input, value }) ?? '') }));
  };
  const findSong = async (): Promise<void> => {
    const firstInput = tab.inputs[0];
    if (firstInput && tab.inputs.every((input) => (valuesByInputId[input.id] ?? '').trim() === '')) {
      setProblemsByInputId({ [firstInput.id]: getInputProblemOrNull({ input: firstInput, value: '' }) ?? '' });
      return;
    }
    setSearch({ kind: 'asking' });
    const result = await onFindSong({ addonId: tab.addonId, valuesByInputId }).catch((): SongSourceSearchResult => ({ kind: 'not-answering', message: `${tab.name} isn’t answering. Try again in a few minutes.` }));
    setSearch(getSearchState(result));
    if (result.kind === 'invalid-input') setProblemsByInputId({ [result.inputId]: result.message });
    const onlyMusic = result.kind === 'found' && result.musics.length === 1 ? result.musics[0] : undefined;
    if (onlyMusic) onPickMusic(onlyMusic);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void findSong();
  };
  const checkMusic = (music: MusicChoiceView): void => {
    onPickMusic(music);
    if (search.kind === 'found') setSearch({ ...search, checkedMusic: music });
  };
  const tryAgainButton = <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={() => void findSong()}>Try again</button>;
  return (
    <form className="sv-sync-stack-small" onSubmit={handleSubmit} noValidate>
      {tab.inputs.map((input) => <SongSourceField key={input.id} input={input} value={valuesByInputId[input.id] ?? ''} problem={problemsByInputId[input.id] ?? ''} onChange={(value) => { changeValue({ input, value }); }} />)}
      <span className="sv-sync-sees-line"><Icon name="info" size={14} />{tab.name} sees what you type here.</span>
      {search.kind === 'asking'
        ? <div className="sv-sync-row sv-sync-wrap" aria-live="polite"><ReceptorLoader label={`Asking ${tab.name}…`} isSmall /><button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={onStopFindingSong}>Stop</button></div>
        : <button className="sv-sync-button sv-sync-align-start" type="submit"><Icon name="search" />Find the song</button>}
      {search.kind === 'problem' && <MissLine action={tryAgainButton}>{search.message}</MissLine>}
      {search.kind === 'found' && search.musics.length > 1 && search.checkedMusic === null && (
        <div className="sv-sync-pick-list" role="radiogroup" aria-label="Music found">
          {search.musics.map((music) => <MusicChoiceRow key={music.musicId} music={music} isPicked={pickedMusic?.musicId === music.musicId} onPick={checkMusic} />)}
        </div>
      )}
      {search.kind === 'found' && (search.checkedMusic ?? (search.musics.length === 1 ? search.musics[0] : null)) && (
        <SongCheck
          music={search.checkedMusic ?? search.musics[0] as MusicChoiceView}
          onUse={onUseMusic}
          onPickAnother={search.musics.length > 1 ? () => { setSearch({ ...search, checkedMusic: null }); } : undefined}
        />
      )}
    </form>
  );
}

/** "Is this the song?": what the song source found, to check before making it. */
function SongCheck({ music, onUse, onPickAnother }: { music: MusicChoiceView; onUse?: (music: MusicChoiceView) => void; onPickAnother?: () => void }): ReactElement {
  return (
    <div className="sv-sync-song-check" role="group" aria-label="Is this the song?">
      <b>Is this the song?</b>
      <span dir="auto">{[`${music.title} · ${music.artist}`, music.sourceText, music.lengthText].filter(Boolean).join(' · ')}{music.hasVideo ? ' · video too' : ''}</span>
      {(onUse ?? onPickAnother) && (
        <span className="sv-sync-row sv-sync-wrap">
          {onUse && <button className="sv-sync-button sv-sync-button--small" type="button" onClick={() => { onUse(music); }}>Yes, use it</button>}
          {onPickAnother && <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={onPickAnother}>Pick another</button>}
        </span>
      )}
    </div>
  );
}

function SongSourceField({ input, value, problem, onChange }: { input: SongSourceInput; value: string; problem: string; onChange: (value: string) => void }): ReactElement {
  const problemId = `sv-sync-input-problem-${input.id}`;
  return (
    <div className="sv-sync-stack-tiny">
      <label className="sv-sync-field-label">
        {input.label}
        <input className="sv-sync-field" type={input.kind === 'link' ? 'url' : 'search'} value={value} placeholder={input.placeholder ?? undefined} aria-invalid={problem !== ''} aria-describedby={problem === '' ? undefined : problemId} onChange={(event) => { onChange(event.target.value); }} />
      </label>
      {problem !== '' && <span id={problemId} className="sv-sync-small sv-sync-error-text" role="alert">{problem}</span>}
    </div>
  );
}

/** The sentence to show under a field as the player types, from the same check Sync runs before calling the addon. */
function getInputProblemOrNull({ input, value }: { input: SongSourceInput; value: string }): string | null {
  try {
    getCheckedSongSourceInputValue({ input, value });
    return null;
  } catch (error) {
    if (error instanceof InvalidSongSourceInputError) return error.message;
    throw error;
  }
}

function getSearchState(result: SongSourceSearchResult): SearchState {
  if (result.kind === 'found') return { kind: 'found', musics: result.musics, checkedMusic: null };
  if (result.kind === 'not-found' || result.kind === 'not-answering') return { kind: 'problem', message: result.message };
  return { kind: 'idle' };
}

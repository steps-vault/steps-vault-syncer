import type { KeyboardEvent, ReactElement } from 'react';
import { ArrowReceptor, type ArrowDirection } from '../icons/arrow-receptor';
import { Icon } from '../icons/icon';
import { handleRadioKeyDown } from '../shared/radio-group';
import { Note, SetupSteps } from '../shared/small-parts';
import type { FoundGameView } from '../sync-ui-types';
import { BrowserPermissionExplainer } from './browser-permission-explainer';
import { UnsupportedBrowserCard } from './unsupported-browser-card';

const GAME_ARROW_DIRECTIONS: readonly ArrowDirection[] = ['up', 'down', 'left', 'right'];

export interface WebsiteConnectGameProps {
  platform: 'website';
  /** False in Firefox and Safari, which can't open folders on the computer. */
  isBrowserSupported: boolean;
  onChooseSongsFolder: () => void;
  desktopAppHref: string;
  onCopySyncAddress: () => void;
}

export interface DesktopConnectGameProps {
  platform: 'desktop';
  foundGames: readonly FoundGameView[];
  selectedGameId: string | null;
  /** For example "checked C:\ and D:\". */
  searchedPlacesText: string;
  onSelectGame: (gameId: string) => void;
  onUseSelectedGame: () => void;
  onChooseAnotherFolder: () => void;
}

export type ConnectGameScreenProps = WebsiteConnectGameProps | DesktopConnectGameProps;

/** Screen 1, first run: pick the game's Songs folder. */
export function ConnectGameScreen(props: ConnectGameScreenProps): ReactElement {
  if (props.platform === 'website' && !props.isBrowserSupported) {
    return <div className="sv-sync-narrow"><UnsupportedBrowserCard desktopAppHref={props.desktopAppHref} onCopySyncAddress={props.onCopySyncAddress} /></div>;
  }
  return (
    <div className="sv-sync-narrow">
      <SetupSteps currentStepIndex={0} />
      <div className="sv-sync-stack-small">
        <h2 className="sv-sync-heading-1">Connect your game</h2>
        <p className="sv-sync-text sv-sync-text--large">Pick your StepMania Songs folder. We only touch the songs we add.</p>
      </div>
      {props.platform === 'website' ? <WebsiteFolderPicker {...props} /> : <FoundGamesPicker {...props} />}
    </div>
  );
}

function WebsiteFolderPicker({ onChooseSongsFolder, desktopAppHref }: WebsiteConnectGameProps): ReactElement {
  return (
    <section className="sv-sync-panel sv-sync-big-pick" aria-label="Choose your Songs folder">
      <button className="sv-sync-pick-button" type="button" onClick={onChooseSongsFolder}>
        <span className="sv-sync-pick-icon"><Icon name="folder" size={24} strokeWidth={2.4} /></span>
        CHOOSE MY SONGS FOLDER
      </button>
      <span className="sv-sync-small sv-sync-muted">Usually <span className="sv-sync-mono sv-sync-soft">C:\Games\StepMania 5\Songs</span></span>
      <BrowserPermissionExplainer desktopAppHref={desktopAppHref} />
    </section>
  );
}

function FoundGamesPicker(props: DesktopConnectGameProps): ReactElement {
  const selectedIndex = props.foundGames.findIndex((game) => game.gameId === props.selectedGameId);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    handleRadioKeyDown({ event, values: props.foundGames.map((game) => game.gameId), currentIndex: selectedIndex, onSelect: props.onSelectGame });
  };
  return (
    <>
      <div className="sv-sync-row sv-sync-space-between">
        <h3 className="sv-sync-heading-2 sv-sync-heading-2--tiny">Found on this computer</h3>
        <span className="sv-sync-small sv-sync-muted">Found {props.foundGames.length} · {props.searchedPlacesText}</span>
      </div>
      <div className="sv-sync-game-cards" role="radiogroup" aria-label="Games found">
        {props.foundGames.map((game, index) => (
          <button key={game.gameId} className="sv-sync-game-card" type="button" role="radio" aria-checked={game.gameId === props.selectedGameId} tabIndex={index === Math.max(0, selectedIndex) ? 0 : -1} onClick={() => { props.onSelectGame(game.gameId); }} onKeyDown={handleKeyDown}>
            <span className="sv-sync-game-icon"><ArrowReceptor direction={GAME_ARROW_DIRECTIONS[index % GAME_ARROW_DIRECTIONS.length]} size={38} /></span>
            <span className="sv-sync-game-facts">
              <span className="sv-sync-game-name">{game.gameName}{game.versionText && <span className="sv-sync-version">{game.versionText}</span>}</span>
              <span className="sv-sync-mono sv-sync-muted sv-sync-ellipsis">{game.songsFolderPath}</span>
            </span>
            <span className="sv-sync-row">
              <span className="sv-sync-small sv-sync-muted sv-sync-tabular"><b className="sv-sync-strong">{game.songCountText}</b> songs</span>
              <span className="sv-sync-radio-mark" aria-hidden="true"><Icon name="check" size={14} strokeWidth={3} /></span>
            </span>
          </button>
        ))}
      </div>
      <div className="sv-sync-row sv-sync-space-between sv-sync-wrap">
        <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={props.onChooseAnotherFolder}><Icon name="folder" />Choose another folder…</button>
        <button className="sv-sync-button sv-sync-button--go sv-sync-button--large" type="button" onClick={props.onUseSelectedGame} disabled={selectedIndex < 0}>Use this folder<Icon name="chevron" strokeWidth={2.6} /></button>
      </div>
      <Note iconName="lock">We only add, update, move or remove the songs we added.</Note>
    </>
  );
}

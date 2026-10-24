import type { FolderLayout } from '@stepsvault/sync-core';
import { useState, type ReactElement } from 'react';
import { JudgmentText } from '../progress/judgment-flash';
import { Icon } from '../icons/icon';
import { handleRadioKeyDown } from '../shared/radio-group';
import { Note } from '../shared/small-parts';
import type { LayoutPreview, LayoutPreviewsByLayout } from '../sync-ui-types';
import { FolderTreePreview } from './folder-tree-preview';
import { FOLDER_LAYOUT_NAMES, LayoutChangeDialog } from './layout-change-dialog';

const FOLDER_LAYOUTS: readonly FolderLayout[] = ['one-group', 'by-genre', 'by-artist'];
const LAYOUT_DESCRIPTIONS: Readonly<Record<FolderLayout, string>> = {
  'one-group': 'Everything in a single StepsVault group.',
  'by-genre': 'Pop, Rock, Electronic… one group per genre.',
  'by-artist': 'Mergui, Sia… one group per artist.',
};
const PREVIEW_PLAYER_GROUP_COUNT = 2;
const NAME_RULE_PREVIEW: LayoutPreview = { groups: [{ groupName: 'StepsVault · Pop', tagText: 'ours', songTitles: ['Pop songs from your vault'] }] };

export interface FolderLayoutScreenProps {
  currentLayout: FolderLayout;
  previewsByLayout: LayoutPreviewsByLayout;
  /** From getSongFolderMoves in sync-core: how many songs each layout would move. */
  movingSongCountsByLayout: Readonly<Record<FolderLayout, number>>;
  playerGroupNames: readonly string[];
  /** Called after the player agreed to the move (or straight away when no song moves). */
  onChangeLayout: (layout: FolderLayout) => void;
  /** Set after a move, for the GREAT message. */
  lastMove?: { layout: FolderLayout; movedSongCount: number } | null;
}

/** Screen 5: how StepsVault songs are grouped in the game. Changing it asks first, because scores start fresh. */
export function FolderLayoutScreen(props: FolderLayoutScreenProps): ReactElement {
  const [pendingLayout, setPendingLayout] = useState<FolderLayout | null>(null);
  const shownLayout = pendingLayout ?? props.currentLayout;
  const chooseLayout = (layout: FolderLayout): void => {
    if (layout === props.currentLayout) {
      setPendingLayout(null);
      return;
    }
    if (props.movingSongCountsByLayout[layout] === 0) {
      props.onChangeLayout(layout);
      return;
    }
    setPendingLayout(layout);
  };
  return (
    <div className="sv-sync-screen">
      <div className="sv-sync-stack-small">
        <h2 className="sv-sync-heading-1 sv-sync-heading-1--medium">Folder layout</h2>
        <p className="sv-sync-text">Choose how StepsVault songs are grouped in your game&apos;s song list. Your own groups stay exactly as they are.</p>
      </div>
      {props.lastMove && (
        <section className="sv-sync-panel sv-sync-moved-toast" role="status">
          <JudgmentText word="GREAT" size="medium" />
          <span className="sv-sync-strong">Moved {props.lastMove.movedSongCount} StepsVault songs into “{FOLDER_LAYOUT_NAMES[props.lastMove.layout]}”.</span>
          <span className="sv-sync-small sv-sync-muted">Your own songs were not touched.</span>
        </section>
      )}
      <div className="sv-sync-layout-options" role="radiogroup" aria-label="Folder layout">
        {FOLDER_LAYOUTS.map((layout) => (
          <button key={layout} className="sv-sync-layout-option" type="button" role="radio" aria-checked={layout === shownLayout} tabIndex={layout === shownLayout ? 0 : -1} onClick={() => { chooseLayout(layout); }} onKeyDown={(event) => { handleRadioKeyDown({ event, values: FOLDER_LAYOUTS, currentIndex: FOLDER_LAYOUTS.indexOf(shownLayout), onSelect: chooseLayout }); }}>
            <span className="sv-sync-layout-option-top">
              <span className="sv-sync-layout-option-name">{FOLDER_LAYOUT_NAMES[layout]}</span>
              {layout === props.currentLayout && <span className="sv-sync-current-badge"><Icon name="check" size={12} strokeWidth={3} />Current</span>}
            </span>
            <span className="sv-sync-small sv-sync-text">{LAYOUT_DESCRIPTIONS[layout]}</span>
            <FolderTreePreview playerGroupNames={props.playerGroupNames.slice(0, PREVIEW_PLAYER_GROUP_COUNT)} morePlayerGroupCount={Math.max(0, props.playerGroupNames.length - PREVIEW_PLAYER_GROUP_COUNT)} preview={props.previewsByLayout[layout]} />
          </button>
        ))}
      </div>
      <NameRuleExplainer />
      <Note>StepMania keeps scores by folder. Moving StepsVault songs to a new layout means their scores start fresh. Your own songs and their scores are never touched.</Note>
      {pendingLayout !== null && (
        <LayoutChangeDialog nextLayout={pendingLayout} movingSongCount={props.movingSongCountsByLayout[pendingLayout]} onCancel={() => { setPendingLayout(null); }} onConfirm={() => { setPendingLayout(null); props.onChangeLayout(pendingLayout); }} />
      )}
    </div>
  );
}

function NameRuleExplainer(): ReactElement {
  return (
    <section className="sv-sync-name-rule" aria-labelledby="sv-sync-name-rule-heading">
      <div className="sv-sync-stack-small">
        <h3 id="sv-sync-name-rule-heading" className="sv-sync-heading-2 sv-sync-heading-2--small">When a name is already yours</h3>
        <p className="sv-sync-text">If you already have a folder with that name — for example your own <b className="sv-sync-strong">Pop</b> — StepsVault uses <b className="sv-sync-light-blue-text">StepsVault · Pop</b> instead. Your folder is never mixed with ours.</p>
        <span className="sv-sync-small sv-sync-muted">This works the same for genres, artists and the single group.</span>
      </div>
      <FolderTreePreview playerGroupNames={['Pop']} morePlayerGroupCount={0} preview={NAME_RULE_PREVIEW} />
    </section>
  );
}

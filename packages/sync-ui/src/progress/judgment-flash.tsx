import type { ReactElement } from 'react';
import { joinClassNames } from '../shared/class-names';
import { usePrefersReducedMotion } from './reduced-motion';

export type JudgmentWord = 'FLAWLESS!!' | 'PERFECT!' | 'GREAT' | 'MISS';

const JUDGMENT_CLASS_NAMES: Readonly<Record<JudgmentWord, string>> = {
  'FLAWLESS!!': 'sv-sync-judgment--flawless',
  'PERFECT!': 'sv-sync-judgment--perfect',
  'GREAT': 'sv-sync-judgment--great',
  'MISS': 'sv-sync-judgment--miss',
};

/** A judgment word in the game's style. It flashes once, or simply appears when the system asks for less motion. */
export function JudgmentText({ word, size = 'large' }: { word: JudgmentWord; size?: 'large' | 'medium' }): ReactElement {
  const shouldReduceMotion = usePrefersReducedMotion();
  return <span className={joinClassNames('sv-sync-judgment', JUDGMENT_CLASS_NAMES[word], `sv-sync-judgment--${size}`, !shouldReduceMotion && 'sv-sync-judgment--flash')}>{word}</span>;
}

export function getSyncJudgmentWord(needsYouCount: number): JudgmentWord {
  return needsYouCount === 0 ? 'FLAWLESS!!' : 'PERFECT!';
}

export interface JudgmentFlashProps {
  syncedCount: number;
  needsYouCount: number;
  onSeeActivity: () => void;
  onDismiss: () => void;
}

/** The end of a sync: FLAWLESS!! when every song synced, PERFECT! when some need the player. */
export function JudgmentFlash({ syncedCount, needsYouCount, onSeeActivity, onDismiss }: JudgmentFlashProps): ReactElement {
  const isAllSynced = needsYouCount === 0;
  return (
    <section className="sv-sync-panel sv-sync-judgment-panel" role="status">
      <JudgmentText word={getSyncJudgmentWord(needsYouCount)} />
      <div className="sv-sync-judgment-text">
        <b>{isAllSynced ? (syncedCount === 1 ? 'Your song is synced' : `All ${String(syncedCount)} songs synced`) : `${String(syncedCount)} synced · ${String(needsYouCount)} ${needsYouCount === 1 ? 'needs' : 'need'} you`}</b>
        <span className="sv-sync-small sv-sync-muted">{isAllSynced ? 'Lined up with your audio.' : 'They wait below.'}</span>
      </div>
      <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={onSeeActivity}>View activity</button>
      <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={onDismiss}>Done</button>
    </section>
  );
}

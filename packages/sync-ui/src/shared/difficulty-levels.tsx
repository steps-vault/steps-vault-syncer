import type { ReactElement } from 'react';
import type { DifficultyLevels } from '../sync-ui-types';
import { joinClassNames } from './class-names';

export const DIFFICULTY_NAMES = ['Beginner', 'Easy', 'Medium', 'Hard', 'Challenge'] as const;
const DIFFICULTY_CLASS_NAMES = ['sv-sync-difficulty--beginner', 'sv-sync-difficulty--easy', 'sv-sync-difficulty--medium', 'sv-sync-difficulty--hard', 'sv-sync-difficulty--challenge'] as const;
const LEVEL_METER_BLOCK_COUNT = 13;

export function getLevelsDescription(levels: DifficultyLevels): string {
  return DIFFICULTY_NAMES.map((name, index) => `${name} ${String(levels[index] ?? 'none')}`).join(', ');
}

/** The five small level badges of a song row, greyed when that chart doesn't exist. */
export function DifficultyLevelBadges({ levels }: { levels: DifficultyLevels }): ReactElement {
  return (
    <div className="sv-sync-levels" role="img" aria-label={getLevelsDescription(levels)}>
      {DIFFICULTY_NAMES.map((name, index) => {
        const level = levels[index] ?? null;
        return (
          <span key={name} className={joinClassNames('sv-sync-level', DIFFICULTY_CLASS_NAMES[index], level === null && 'sv-sync-level--missing')}>
            {level ?? '–'}
          </span>
        );
      })}
    </div>
  );
}

/** The big difficulty panels of the song details, with the game's feet-block level meter. */
export function DifficultyPanels({ levels }: { levels: DifficultyLevels }): ReactElement {
  return (
    <>
      {DIFFICULTY_NAMES.map((name, index) => (
        <DifficultyPanel key={name} difficultyName={name} className={DIFFICULTY_CLASS_NAMES[index] ?? ''} level={levels[index] ?? null} />
      ))}
    </>
  );
}

function DifficultyPanel({ difficultyName, className, level }: { difficultyName: string; className: string; level: number | null }): ReactElement {
  const description = level === null ? `${difficultyName}, not in this chart` : `${difficultyName} level ${String(level)}`;
  return (
    <div className={joinClassNames('sv-sync-difficulty-panel', className)}>
      <span className={joinClassNames('sv-sync-level-badge', level === null && 'sv-sync-level-badge--missing')} role="img" aria-label={description}>
        <b>{level ?? '–'}</b>
      </span>
      <div>
        <div className="sv-sync-difficulty-name">
          {difficultyName.toUpperCase()}
          {level === null && <span>Not in this chart</span>}
        </div>
        <div className="sv-sync-level-meter" aria-hidden="true">
          {Array.from({ length: LEVEL_METER_BLOCK_COUNT }, (_, blockIndex) => (
            <span key={blockIndex} className={joinClassNames('sv-sync-meter-block', level !== null && blockIndex < level && 'sv-sync-meter-block--on')} />
          ))}
        </div>
      </div>
    </div>
  );
}

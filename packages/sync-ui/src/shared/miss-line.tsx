import type { ReactElement, ReactNode } from 'react';
import { joinClassNames } from './class-names';

export interface MissLineProps {
  children: ReactNode;
  /** The next step, for example a Try again button. */
  action?: ReactNode;
  /** Large: the whole dialog says it, as when a song couldn't be made. */
  isLarge?: boolean;
}

/** Something didn't work: the game's MISS, the reason, and what to do next. */
export function MissLine({ children, action, isLarge = false }: MissLineProps): ReactElement {
  return (
    <div className={joinClassNames('sv-sync-miss-line', isLarge && 'sv-sync-miss-line--large')} role="alert">
      <span className="sv-sync-miss-word" aria-hidden="true">MISS</span>
      <span>{children}</span>
      {action}
    </div>
  );
}

/** A list with nothing in it yet: one calm line and, when there is one, the way to add the first thing. */
export function EmptyBox({ children, action }: { children: ReactNode; action?: ReactNode }): ReactElement {
  return (
    <div className="sv-sync-empty-box">
      <span>{children}</span>
      {action}
    </div>
  );
}

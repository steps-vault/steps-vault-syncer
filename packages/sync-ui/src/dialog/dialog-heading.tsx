import type { ReactElement } from 'react';

export interface DialogHeadingProps {
  titleId: string;
  title: string;
  /** For example "Step 1 of 2"; shown under the title, since v3 puts no labels above headings. */
  stepText?: string;
}

/** A dialog's title, with the step it is on when it has more than one. */
export function DialogHeading({ titleId, title, stepText }: DialogHeadingProps): ReactElement {
  return (
    <div className="sv-sync-dialog-heading">
      <h2 id={titleId} className="sv-sync-heading-2">{title}</h2>
      {stepText !== undefined && <span className="sv-sync-step-caption">{stepText}</span>}
    </div>
  );
}

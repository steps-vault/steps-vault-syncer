import type { ReactElement } from 'react';

export type ArrowDirection = 'left' | 'down' | 'up' | 'right';

const ROTATION_DEGREES_BY_DIRECTION: Readonly<Record<ArrowDirection, number>> = { down: 0, left: 90, up: 180, right: -90 };

export interface ArrowReceptorProps {
  direction?: ArrowDirection;
  size?: number;
  className?: string;
}

/** The StepMania step-zone arrow, drawn inline so the components never load images from the network. */
export function ArrowReceptor({ direction = 'down', size = 24, className }: ArrowReceptorProps): ReactElement {
  const classNames = ['sv-sync-receptor', className].filter(Boolean).join(' ');
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 64 64" className={classNames} style={{ transform: `rotate(${ROTATION_DEGREES_BY_DIRECTION[direction]}deg)` }}>
      <path d="M32 58 6 32 l9-9 11 11 V8 h12 v26 l11-11 9 9z" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

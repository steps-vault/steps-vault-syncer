import { useEffect, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Follows the system setting live, so turning it on stops the flashing without a reload. */
export function usePrefersReducedMotion(): boolean {
  const [shouldReduceMotion, setShouldReduceMotion] = useState(getPrefersReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = (): void => { setShouldReduceMotion(mediaQuery.matches); };
    mediaQuery.addEventListener('change', handleChange);
    return () => { mediaQuery.removeEventListener('change', handleChange); };
  }, []);
  return shouldReduceMotion;
}

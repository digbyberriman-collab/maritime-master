import { useCallback, useSyncExternalStore } from 'react';
import { getDensity, setDensity, subscribeDensity, type Density } from './theme-config';

/** Read and change the global density (`data-density` on <html>, persisted locally). */
export function useDensity(): [Density, (next: Density) => void] {
  const density = useSyncExternalStore(subscribeDensity, getDensity, () => 'default' as Density);
  const update = useCallback((next: Density) => setDensity(next), []);
  return [density, update];
}

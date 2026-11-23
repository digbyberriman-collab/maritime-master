import { useCallback, useSyncExternalStore } from 'react';
import { mirrorUiPreference } from '@/app/shell/uiPreferenceSync';
import { getDensity, setDensity, subscribeDensity, type Density } from './theme-config';

/**
 * Read and change the global density (`data-density` on <html>, persisted
 * locally). A change applies on this device at once and is mirrored to the
 * signed-in user's `user_preferences.density` once that column is live; a
 * failed mirror shows a notice and keeps the device value (D-19, Phase 2
 * spec §B.5).
 */
export function useDensity(): [Density, (next: Density) => void] {
  const density = useSyncExternalStore(subscribeDensity, getDensity, () => 'default' as Density);
  const update = useCallback((next: Density) => {
    setDensity(next);
    void mirrorUiPreference({ density: next });
  }, []);
  return [density, update];
}

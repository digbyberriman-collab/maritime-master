/**
 * Runs the UI-preference adoption for the signed-in user (D-19 for density
 * and Show roadmap; Phase 2 spec §B.5; ./uiPreferenceSync.ts has the rule).
 * Mounted once by VesselProvider, the provider every signed-in screen sits
 * under, and again by Appearance (idempotent: one read per user).
 *
 * `useUiPreferenceColumns` tells Appearance whether choices follow the
 * account (`present`) or stay on this device (anything else).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { applyStoredDensity, hasStoredDensityChoice } from '@/components/ui/theme-config';
import { hasStoredShowRoadmapChoice, writeShowRoadmap } from '@/app/nav/roadmap';
import {
  getUiPreferenceSync,
  subscribeUiPreferenceSync,
  syncUiPreferences,
  type UiPreferenceAdopters,
  type UiPreferenceColumns,
} from './uiPreferenceSync';

/** Adopted values land on the device as if chosen there, without being mirrored back. */
export const DEVICE_ADOPTERS: UiPreferenceAdopters = {
  hasDeviceDensity: hasStoredDensityChoice,
  applyDensity: applyStoredDensity,
  hasDeviceShowRoadmap: hasStoredShowRoadmapChoice,
  applyShowRoadmap: writeShowRoadmap,
};

export function useUiPreferenceSync(userId: string | null): void {
  useEffect(() => {
    void syncUiPreferences(userId, DEVICE_ADOPTERS);
  }, [userId]);
}

const SIGNED_OUT_COLUMNS: UiPreferenceColumns = 'unknown';

/** Whether the signed-in user's UI choices follow their account (`present`) or stay on the device. */
export function useUiPreferenceColumns(): UiPreferenceColumns {
  return useSyncExternalStore(subscribeUiPreferenceSync, () => getUiPreferenceSync().columns, () => SIGNED_OUT_COLUMNS);
}

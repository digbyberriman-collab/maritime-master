/**
 * Vessel tables the shell reads but that are not in the generated types yet
 * (gap/00 D2; DECISIONS D-01, C13, G3; gap/01 data model).
 *
 * `vessel_module_settings` holds, per vessel and module key, whether the
 * module is on, the date it is on from and the vessel's label for it
 * (Charter → "Trip", Planner → "Leave"). Its primary key is
 * `(vessel_id, module_key)`. The migration is not applied anywhere this code
 * runs yet, so every read can fail with "relation does not exist": the hook
 * (../hooks/useVesselModuleSettings.ts) treats that as "every module on"
 * (D-01), never as an error and never with mock rows.
 *
 * When the migration lands and `types.ts` is regenerated,
 * src/test/config/pendingTables.test.ts fails until this entry is deleted
 * and the hook reads the generated type.
 */
import type { PendingTable } from '@/integrations/supabase/pending';

export type VesselModuleSettingRow = {
  vessel_id: string;
  module_key: string;
  enabled: boolean;
  /** Date (`YYYY-MM-DD`) the module is on from; null = on now. */
  enabled_from: string | null;
  /** The vessel's own label for the module; display only (slugs never change). */
  label_override: string | null;
  settings: unknown;
  updated_by: string | null;
  updated_at: string | null;
};

export type VesselsPendingTables = {
  vessel_module_settings: PendingTable<VesselModuleSettingRow, 'vessel_id' | 'module_key' | 'enabled'>;
};

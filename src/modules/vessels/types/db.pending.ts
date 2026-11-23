/**
 * Vessel tables and columns the app reads but that are not in the generated
 * types yet (gap/00 D2; DECISIONS D-01, C2, C13, C20, D-25, G3; gap/01 F9,
 * F10, F11, F12). Phase 2 contract: these shapes mirror the SQL in
 * `supabase/migrations/20261123000100_platform_vessel_tenancy.sql` and
 * `20261123000500_platform_module_settings.sql` exactly (the Phase 2 spec,
 * §A.1 and §A.5). `scripts/db/check-pending-contract.mjs` compares them with
 * the harness database and fails on any difference; a mismatch is fixed in
 * whichever side is wrong, never by loosening a type.
 *
 * `vessel_module_settings` holds, per vessel and module key, whether the
 * module is on, the date it is on from and the vessel's label for it
 * (Charter → "Trip", Planner → "Leave"). Primary key `(vessel_id,
 * module_key)`; `company_id` is set by a trigger from the vessel. There is
 * no jsonb settings column (DECISIONS C13: typed configuration lives in
 * `vessel_<module>_settings` tables). The
 * migration is not applied anywhere this code runs yet, so every read can
 * fail with "relation does not exist": the hook
 * (../hooks/useVesselModuleSettings.ts) treats that as "every module on"
 * (D-01, D-63), and any other error, a missing column included, as an error
 * (D-86). Never mock rows.
 *
 * `company_module_settings` is the fleet-wide default per module (gap/01
 * F12). The client does not read it in Phase 2 (D-63); Vessel Settings (X6)
 * will.
 *
 * `VesselsPendingColumns` lists the new columns on the live `vessels` table
 * (P1). VesselContext reads vessels with `select('*')`, so `code` arrives on
 * its own once the column is live; explicit column selects use a client
 * typed with these columns.
 *
 * When the migrations land and `types.ts` is regenerated,
 * src/test/config/pendingTables.test.ts fails until the entries here are
 * deleted and the code reads the generated types.
 */
import type { PendingColumns, PendingTable } from '@/integrations/supabase/pending';

/** `vessels.lifecycle_status` (C2; gap/01 W5). */
export type VesselLifecycleStatus = 'active' | 'inactive' | 'archived';
/** `vessels.vessel_purpose` (C2: replaces is_demo / is_training). */
export type VesselPurpose = 'operational' | 'demo' | 'training';

/** New columns on `vessels` (P1; gap/01 F9, F10; C2, C20, D-25). */
export type VesselTenancyColumns = {
  /** `^[A-Z][A-Z0-9]{2}$`, unique per company; derived (D-03) when not given; locked once records are numbered. */
  code: string;
  /** Two-character template code, `^[A-Z][A-Z0-9]$`, unique per company; no backfill. */
  short_code: string | null;
  lifecycle_status: VesselLifecycleStatus;
  /** Counted in fleet KPIs and "n vessels" labels (with lifecycle_status = 'active'). */
  is_counted: boolean;
  vessel_purpose: VesselPurpose;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
};

export type VesselModuleSettingRow = {
  vessel_id: string;
  /** Set by trigger from the vessel; never trusted from the client. */
  company_id: string;
  /** Dotted snake_case key (`crew_hor`, `technical.jobs`). */
  module_key: string;
  enabled: boolean;
  /** Date (`YYYY-MM-DD`) the module is on from; null = on now. */
  enabled_from: string | null;
  /** The vessel's own label for the module; display only (slugs never change). */
  label_override: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
};

export type CompanyModuleSettingRow = {
  company_id: string;
  module_key: string;
  enabled: boolean;
  enabled_from: string | null;
  label_override: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
};

export type VesselsPendingTables = {
  vessel_module_settings: PendingTable<VesselModuleSettingRow, 'vessel_id' | 'module_key'>;
  company_module_settings: PendingTable<CompanyModuleSettingRow, 'company_id' | 'module_key'>;
};

export type VesselsPendingColumns = {
  vessels: PendingColumns<VesselTenancyColumns>;
};

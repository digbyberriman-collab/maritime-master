-- =================================================================
-- PLATFORM P2: per-vessel and per-company module settings (gap/01 F11,
-- F12; DECISIONS C13, G3, D-63, D-86; Phase 2 spec §A.5; proposed D-137)
-- Tables: vessel_module_settings, company_module_settings
-- Helpers: module_enabled(); triggers trg_vessel_module_settings_stamp,
--   trg_company_module_settings_stamp
-- TS mirror: src/modules/vessels/types/db.pending.ts
--   (VesselModuleSettingRow, CompanyModuleSettingRow, VesselsPendingTables),
--   read by src/modules/vessels/hooks/useVesselModuleSettings.ts; resolver
--   src/modules/vessels/lib/moduleSettings.ts (resolveModuleSettings,
--   frozen in Phase 2)
-- Parity: supabase/tests/fixtures/module-settings-cases.json (generated
--   from the TS by scripts/db/gen-module-settings-fixture.mjs), asserted by
--   supabase/tests/sql/p2_module_settings
-- =================================================================
--
-- Semantics (D-63 / D-86, unchanged): a missing table or row means on;
-- enabled = false means off; enabled_from after today means off; a dotted
-- key inherits its parents (technical.jobs is off whenever technical is);
-- label_override is display only. Flags only: no jsonb settings column
-- (C13 binds typed configuration to vessel_<module>_settings tables; CC-8).
--
-- module_enabled() is the exact SQL mirror of the client resolver and
-- reads vessel rows only (CC-9): the client does not read
-- company_module_settings in Phase 2, and the server and the nav must give
-- the same answer. X6 adds the company fallback to both sides at once.
--
-- Reads: company members who reach the vessel (or have fleet reach).
-- Writes: fleet.operations.vessels.admin of the company; company_id is
-- stamped from the vessel (a client value is overwritten).
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.has_capability(text,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000500_platform_module_settings needs has_capability(text,uuid,uuid): apply 20261123000400_platform_capabilities.sql first';
  END IF;
  IF to_regprocedure('public.user_can_reach_vessel(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_has_fleet_reach(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_is_active(uuid)') IS NULL
     OR to_regprocedure('public.reach_vessel_for(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fleet_reach_for(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000500_platform_module_settings needs the reach helpers: apply 20261123000300_platform_account_memberships.sql first';
  END IF;
  IF to_regprocedure('public.user_belongs_to_company(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123000500_platform_module_settings needs user_belongs_to_company(uuid,uuid)';
  END IF;
END
$$;

-- ---------------------------------------------------------------- tables

CREATE TABLE IF NOT EXISTS public.vessel_module_settings (
  vessel_id uuid NOT NULL,
  company_id uuid NOT NULL,
  module_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  enabled_from date NULL,
  label_override text NULL,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vessel_module_settings_pkey PRIMARY KEY (vessel_id, module_key),
  CONSTRAINT vessel_module_settings_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT vessel_module_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT vessel_module_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT vessel_module_settings_module_key_check CHECK (module_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  CONSTRAINT vessel_module_settings_label_override_check CHECK (label_override IS NULL OR length(btrim(label_override)) BETWEEN 1 AND 40),
  CONSTRAINT vessel_module_settings_enabled_from_range CHECK (enabled_from IS NULL OR enabled_from BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
);

CREATE TABLE IF NOT EXISTS public.company_module_settings (
  company_id uuid NOT NULL,
  module_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  enabled_from date NULL,
  label_override text NULL,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_module_settings_pkey PRIMARY KEY (company_id, module_key),
  CONSTRAINT company_module_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT company_module_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT company_module_settings_module_key_check CHECK (module_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  CONSTRAINT company_module_settings_label_override_check CHECK (label_override IS NULL OR length(btrim(label_override)) BETWEEN 1 AND 40),
  CONSTRAINT company_module_settings_enabled_from_range CHECK (enabled_from IS NULL OR enabled_from BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
);

CREATE INDEX IF NOT EXISTS idx_vessel_module_settings_company ON public.vessel_module_settings (company_id);

ALTER TABLE public.vessel_module_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_module_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.vessel_module_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.company_module_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vessel_module_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_module_settings TO authenticated;
GRANT ALL ON TABLE public.vessel_module_settings TO service_role;
GRANT ALL ON TABLE public.company_module_settings TO service_role;

-- ---------------------------------------------------------------- stamping triggers

-- company_id comes from the vessel (a client value is overwritten; a
-- missing vessel is 23503), updated_by is the caller, updated_at now. The
-- policies' WITH CHECK then evaluates the stamped company_id.
CREATE OR REPLACE FUNCTION public.vessel_module_settings_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT v.company_id INTO v_company FROM public.vessels AS v WHERE v.id = NEW.vessel_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'vessel_not_found';
  END IF;
  NEW.company_id := v_company;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_module_settings_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vessel_module_settings_stamp ON public.vessel_module_settings;
CREATE TRIGGER trg_vessel_module_settings_stamp
  BEFORE INSERT OR UPDATE ON public.vessel_module_settings
  FOR EACH ROW EXECUTE FUNCTION public.vessel_module_settings_stamp();

DROP TRIGGER IF EXISTS trg_company_module_settings_stamp ON public.company_module_settings;
CREATE TRIGGER trg_company_module_settings_stamp
  BEFORE INSERT OR UPDATE ON public.company_module_settings
  FOR EACH ROW EXECUTE FUNCTION public.company_module_settings_stamp();

-- ---------------------------------------------------------------- policies

DROP POLICY IF EXISTS vessel_module_settings_select ON public.vessel_module_settings;
CREATE POLICY vessel_module_settings_select ON public.vessel_module_settings
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.user_has_fleet_reach(auth.uid(), company_id) OR public.user_can_reach_vessel(auth.uid(), vessel_id))
  );

DROP POLICY IF EXISTS vessel_module_settings_insert ON public.vessel_module_settings;
CREATE POLICY vessel_module_settings_insert ON public.vessel_module_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_capability('fleet.operations.vessels.admin', company_id));

DROP POLICY IF EXISTS vessel_module_settings_update ON public.vessel_module_settings;
CREATE POLICY vessel_module_settings_update ON public.vessel_module_settings
  FOR UPDATE TO authenticated
  USING (public.has_capability('fleet.operations.vessels.admin', company_id))
  WITH CHECK (public.has_capability('fleet.operations.vessels.admin', company_id));

DROP POLICY IF EXISTS vessel_module_settings_delete ON public.vessel_module_settings;
CREATE POLICY vessel_module_settings_delete ON public.vessel_module_settings
  FOR DELETE TO authenticated
  USING (public.has_capability('fleet.operations.vessels.admin', company_id));

DROP POLICY IF EXISTS company_module_settings_select ON public.company_module_settings;
CREATE POLICY company_module_settings_select ON public.company_module_settings
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.user_is_active(auth.uid()));

DROP POLICY IF EXISTS company_module_settings_insert ON public.company_module_settings;
CREATE POLICY company_module_settings_insert ON public.company_module_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_capability('fleet.operations.vessels.admin', company_id));

DROP POLICY IF EXISTS company_module_settings_update ON public.company_module_settings;
CREATE POLICY company_module_settings_update ON public.company_module_settings
  FOR UPDATE TO authenticated
  USING (public.has_capability('fleet.operations.vessels.admin', company_id))
  WITH CHECK (public.has_capability('fleet.operations.vessels.admin', company_id));

DROP POLICY IF EXISTS company_module_settings_delete ON public.company_module_settings;
CREATE POLICY company_module_settings_delete ON public.company_module_settings
  FOR DELETE TO authenticated
  USING (public.has_capability('fleet.operations.vessels.admin', company_id));

-- ---------------------------------------------------------------- module_enabled()

-- resolveModuleSettings({ready, settings: the vessel's rows}, _on).isModuleOn(_module_key):
-- every prefix of the key (parentModuleKeys: split on '.', empty segments
-- dropped, so '' and '.' have none and are on) must be on, and a prefix is
-- on without a row, or with enabled = true and enabled_from NULL or not
-- after _on. Unknown vessel, NULL key or NULL date → false; a signed-in
-- caller who neither reaches the vessel nor has fleet reach in its company
-- → false. Company rows are not read in Phase 2 (D-63, CC-9).
CREATE OR REPLACE FUNCTION public.module_enabled(_vessel_id uuid, _module_key text, _on date DEFAULT current_date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH vessel AS (
    SELECT v.id, v.company_id FROM public.vessels AS v WHERE v.id = _vessel_id
  ), parts AS (
    SELECT part, ord
    FROM regexp_split_to_table(coalesce(_module_key, ''), '[.]') WITH ORDINALITY AS t(part, ord)
    WHERE part <> ''
  ), prefixes AS (
    SELECT string_agg(p2.part, '.' ORDER BY p2.ord) AS key
    FROM parts AS p1
    JOIN parts AS p2 ON p2.ord <= p1.ord
    GROUP BY p1.ord
  )
  SELECT CASE
    WHEN _module_key IS NULL OR _on IS NULL THEN false
    WHEN NOT EXISTS (SELECT 1 FROM vessel) THEN false
    WHEN auth.uid() IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM vessel
      WHERE public.reach_vessel_for(auth.uid(), vessel.id) OR public.fleet_reach_for(auth.uid(), vessel.company_id)
    ) THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM prefixes AS k
      JOIN public.vessel_module_settings AS s ON s.vessel_id = _vessel_id AND s.module_key = k.key
      WHERE NOT s.enabled OR (s.enabled_from IS NOT NULL AND s.enabled_from > _on)
    )
  END
$$;

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.vessel_module_settings_stamp() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.company_module_settings_stamp() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.module_enabled(uuid, text, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.module_enabled(uuid, text, date) TO authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.vessel_module_settings IS 'Per vessel and module key: on / off, on from a date, the vessel''s label (D-63, D-86; gap/01 F11). Missing row = on. Flags only (C13: no jsonb settings). Read: company members reaching the vessel or with fleet reach. Write: fleet.operations.vessels.admin. company_id is stamped from the vessel.';
COMMENT ON TABLE public.company_module_settings IS 'Fleet-wide module defaults per company (gap/01 F12). Not read by the client or module_enabled() in Phase 2 (D-63); X6 adds the fallback to both. Read: active company members. Write: fleet.operations.vessels.admin.';
COMMENT ON COLUMN public.vessel_module_settings.module_key IS 'Dotted snake_case key (crew_hor, technical.jobs); a key inherits its parents.';
COMMENT ON COLUMN public.vessel_module_settings.enabled_from IS 'The module is on from this date (inclusive); NULL = on now. Years 0001-9999 (what the client parses as YYYY-MM-DD).';
COMMENT ON COLUMN public.vessel_module_settings.label_override IS 'The vessel''s own label for the module (1-40 characters); display only, slugs never change.';
COMMENT ON FUNCTION public.vessel_module_settings_stamp() IS 'Trigger trg_vessel_module_settings_stamp: company_id from the vessel (client value overwritten), updated_by = auth.uid(), updated_at = now().';
COMMENT ON FUNCTION public.company_module_settings_stamp() IS 'Trigger trg_company_module_settings_stamp: updated_by = auth.uid(), updated_at = now().';
COMMENT ON FUNCTION public.module_enabled(uuid, text, date) IS 'Exact SQL mirror of resolveModuleSettings(...).isModuleOn(key) over the vessel''s rows (CC-9): every dotted prefix on (no row, or enabled and enabled_from not after _on). Unknown vessel or a caller without reach: false. For server-side checks (calendar, notifications, reports); the client does not call it.';

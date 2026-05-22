-- Grant `medical_officer` role access to medical_reports.
--
-- This migration must run AFTER 20260522120000_add_medical_officer_enum.sql so
-- the new enum value is committed before being referenced in policy bodies.
-- Existing policy names matched from 20260127170858_dad2e300-... migration.

DROP POLICY IF EXISTS "Medical reports visible to authorized users" ON public.medical_reports;
CREATE POLICY "Medical reports visible to authorized users"
  ON public.medical_reports FOR SELECT
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['superadmin','dpa','captain','medical_officer']::public.app_role[]
    )
    OR crew_id = auth.uid()
  );

DROP POLICY IF EXISTS "DPA and Captain can manage medical reports" ON public.medical_reports;
CREATE POLICY "Authorized medical roles can manage medical reports"
  ON public.medical_reports FOR ALL
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['superadmin','dpa','captain','medical_officer']::public.app_role[]
    )
  );

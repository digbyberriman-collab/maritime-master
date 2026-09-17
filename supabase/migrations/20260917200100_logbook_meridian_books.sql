-- ═══════════════════════════════════════════════════════════════════════════
-- Meridian logbook workspace: volumes, signatures, sealed pages, registries
-- and captured readings on top of the existing logbooks / logbook_entries.
--
-- Principles carried over from the Meridian ledger:
--   * A volume pins the template edition, flag profile and cover it was
--     opened with. Later template or registry changes never rewrite it.
--   * Every entry stores its section schema snapshot and is validated against
--     it. Signed content is immutable; corrections are new linked entries.
--   * Signatures, Master verification, order acknowledgements and page
--     sealing only happen through SECURITY DEFINER functions that enforce
--     role capacity, optimistic versions and signature policies.
--   * Digests are computed in the database over the canonical entry content.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Capacity mapping (strict onboard) ──────────────────────────────────────
-- master   = captain (RBAC) or legacy profile role 'master'
-- officer  = chief_officer, officer
-- engineer = chief_engineer
-- steward  = crew, purser, hod (crew-witness capacity)
-- Shore, fleet and audit roles have no signing capacity.
CREATE OR REPLACE FUNCTION public.logbook_capacity(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_legacy text;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  IF public.has_any_role(_user_id, ARRAY['captain']::app_role[]) THEN RETURN 'master'; END IF;
  IF public.has_any_role(_user_id, ARRAY['chief_officer','officer']::app_role[]) THEN RETURN 'officer'; END IF;
  IF public.has_any_role(_user_id, ARRAY['chief_engineer']::app_role[]) THEN RETURN 'engineer'; END IF;
  IF public.has_any_role(_user_id, ARRAY['crew','purser','hod']::app_role[]) THEN RETURN 'steward'; END IF;
  SELECT p.role::text INTO v_legacy FROM public.profiles p WHERE p.user_id = _user_id LIMIT 1;
  RETURN CASE v_legacy
    WHEN 'master' THEN 'master'
    WHEN 'chief_officer' THEN 'officer'
    WHEN 'chief_engineer' THEN 'engineer'
    WHEN 'crew' THEN 'steward'
    ELSE NULL
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.logbook_capacity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.logbook_capacity(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.logbook_capacity(uuid) TO authenticated;

-- ── Vessel registries (one saved revision per vessel and flag profile) ──────
CREATE TABLE public.logbook_registries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  flag_profile text NOT NULL CHECK (flag_profile IN ('CISR','MCA')),
  version integer NOT NULL DEFAULT 1,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  book_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_populate_cover boolean NOT NULL DEFAULT true,
  saved_by uuid,
  saved_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vessel_id, flag_profile)
);
GRANT SELECT, INSERT, UPDATE ON public.logbook_registries TO authenticated;
GRANT ALL ON public.logbook_registries TO service_role;
ALTER TABLE public.logbook_registries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logbook_registries_select_company" ON public.logbook_registries
  FOR SELECT TO authenticated USING (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "logbook_registries_insert_master" ON public.logbook_registries
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.logbook_capacity(auth.uid()) = 'master');
CREATE POLICY "logbook_registries_update_master" ON public.logbook_registries
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id) AND public.logbook_capacity(auth.uid()) = 'master')
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));
CREATE INDEX idx_logbook_registries_vessel ON public.logbook_registries(vessel_id);

CREATE OR REPLACE FUNCTION public.logbook_registries_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
    NEW.vessel_id := OLD.vessel_id;
    NEW.flag_profile := OLD.flag_profile;
    NEW.company_id := OLD.company_id;
  ELSE
    NEW.version := 1;
  END IF;
  NEW.saved_by := auth.uid();
  NEW.saved_by_name := public.logbook_actor_name(auth.uid());
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.logbook_registries_stamp() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER logbook_registries_stamp BEFORE INSERT OR UPDATE ON public.logbook_registries
  FOR EACH ROW EXECUTE FUNCTION public.logbook_registries_stamp();

-- ── Captured readings (simulated or pasted; no live gateway) ───────────────
CREATE TABLE public.logbook_samples (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  sample_type text NOT NULL CHECK (sample_type IN ('navigation','machinery')),
  source text NOT NULL,
  protocol text,
  mode text NOT NULL CHECK (mode IN ('simulated','manual-test','live')),
  quality text,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  "values" jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw jsonb,
  captured_by uuid,
  captured_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.logbook_samples TO authenticated;
GRANT ALL ON public.logbook_samples TO service_role;
ALTER TABLE public.logbook_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logbook_samples_select_company" ON public.logbook_samples
  FOR SELECT TO authenticated USING (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "logbook_samples_insert_crew" ON public.logbook_samples
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.logbook_capacity(auth.uid()) IN ('master','officer','engineer'));
CREATE INDEX idx_logbook_samples_vessel ON public.logbook_samples(vessel_id, sample_type, observed_at DESC);

CREATE OR REPLACE FUNCTION public.logbook_samples_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.captured_by := auth.uid();
  NEW.captured_by_name := public.logbook_actor_name(auth.uid());
  IF NEW.observed_at > now() + interval '5 seconds' THEN
    RAISE EXCEPTION 'Sample clock is ahead of the server. Check the source time.';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.logbook_samples_stamp() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER logbook_samples_stamp BEFORE INSERT ON public.logbook_samples
  FOR EACH ROW EXECUTE FUNCTION public.logbook_samples_stamp();

-- ── Volumes ─────────────────────────────────────────────────────────────────
CREATE TABLE public.logbook_volumes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  logbook_id uuid NOT NULL REFERENCES public.logbooks(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  book_id text NOT NULL,
  flag_profile text NOT NULL CHECK (flag_profile IN ('CISR','MCA')),
  label text NOT NULL,
  sequence integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  template_revision text NOT NULL,
  template jsonb NOT NULL,
  cover_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  particulars jsonb NOT NULL DEFAULT '{}'::jsonb,
  registry_source jsonb,
  continuation_of uuid REFERENCES public.logbook_volumes(id) ON DELETE SET NULL,
  opened_by uuid,
  opened_by_name text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_by_name text,
  closed_at timestamptz,
  closure_place text,
  closure_reason text,
  page_count integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.logbook_volumes TO authenticated;
GRANT ALL ON public.logbook_volumes TO service_role;
ALTER TABLE public.logbook_volumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logbook_volumes_select_company" ON public.logbook_volumes
  FOR SELECT TO authenticated USING (public.user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY "logbook_volumes_insert_master" ON public.logbook_volumes
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND public.logbook_capacity(auth.uid()) = 'master');
-- Updates only happen through logbook_close_volume (SECURITY DEFINER).
CREATE INDEX idx_logbook_volumes_logbook ON public.logbook_volumes(logbook_id, flag_profile, sequence);
CREATE INDEX idx_logbook_volumes_vessel ON public.logbook_volumes(vessel_id);

CREATE OR REPLACE FUNCTION public.logbook_volumes_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prior public.logbook_volumes%ROWTYPE;
  v_logbook public.logbooks%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF current_setting('logbook.rpc', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'A volume cover is fixed once opened. Close the volume and open another with the correction noted.';
    END IF;
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  SELECT * INTO v_logbook FROM public.logbooks WHERE id = NEW.logbook_id;
  IF NOT FOUND OR v_logbook.vessel_id <> NEW.vessel_id OR v_logbook.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'Volume must belong to the same vessel logbook.';
  END IF;
  IF NEW.continuation_of IS NOT NULL THEN
    SELECT * INTO v_prior FROM public.logbook_volumes WHERE id = NEW.continuation_of;
    IF NOT FOUND OR v_prior.status <> 'closed' OR v_prior.book_id <> NEW.book_id OR v_prior.flag_profile <> NEW.flag_profile OR v_prior.logbook_id <> NEW.logbook_id THEN
      RAISE EXCEPTION 'Continuation requires a matching closed book.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.logbook_volumes WHERE continuation_of = NEW.continuation_of) THEN
      RAISE EXCEPTION 'This closed volume already has a continuation.';
    END IF;
    -- A continuation keeps its predecessor's template edition and cover schema.
    NEW.template := v_prior.template;
    NEW.template_revision := v_prior.template_revision;
    NEW.cover_fields := v_prior.cover_fields;
    IF NEW.registry_source IS NULL THEN NEW.registry_source := v_prior.registry_source; END IF;
  END IF;
  IF jsonb_typeof(NEW.template -> 'sections') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.template -> 'sections') = 0 THEN
    RAISE EXCEPTION 'A volume requires a template snapshot with sections.';
  END IF;
  IF COALESCE(NEW.particulars ->> 'shipName', '') = '' OR COALESCE(NEW.particulars ->> 'openingPlace', '') = '' THEN
    RAISE EXCEPTION 'Vessel name and opening place are required on the cover.';
  END IF;
  SELECT COALESCE(MAX(sequence), 0) + 1 INTO NEW.sequence FROM public.logbook_volumes
   WHERE logbook_id = NEW.logbook_id AND flag_profile = NEW.flag_profile;
  NEW.status := 'open';
  NEW.opened_by := auth.uid();
  NEW.opened_by_name := public.logbook_actor_name(auth.uid());
  NEW.opened_at := now();
  NEW.closed_by := NULL; NEW.closed_by_name := NULL; NEW.closed_at := NULL; NEW.closure_place := NULL; NEW.closure_reason := NULL;
  NEW.page_count := 0;
  NEW.version := 1;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.logbook_volumes_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER logbook_volumes_guard BEFORE INSERT OR UPDATE ON public.logbook_volumes
  FOR EACH ROW EXECUTE FUNCTION public.logbook_volumes_guard();

-- ── Sealed pages ────────────────────────────────────────────────────────────
CREATE TABLE public.logbook_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  volume_id uuid NOT NULL REFERENCES public.logbook_volumes(id) ON DELETE CASCADE,
  logbook_id uuid NOT NULL REFERENCES public.logbooks(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  section_id text NOT NULL,
  page_number integer NOT NULL,
  entry_ids uuid[] NOT NULL,
  digests text[] NOT NULL,
  digest text NOT NULL,
  sealed_by uuid,
  sealed_by_name text,
  sealed_at timestamptz NOT NULL DEFAULT now(),
  statement text,
  UNIQUE (volume_id, page_number)
);
GRANT SELECT ON public.logbook_pages TO authenticated;
GRANT ALL ON public.logbook_pages TO service_role;
ALTER TABLE public.logbook_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logbook_pages_select_company" ON public.logbook_pages
  FOR SELECT TO authenticated USING (public.user_belongs_to_company(auth.uid(), company_id));
CREATE INDEX idx_logbook_pages_volume ON public.logbook_pages(volume_id, section_id, page_number);

-- ── Entry extensions ────────────────────────────────────────────────────────
ALTER TABLE public.logbook_entries
  ADD COLUMN IF NOT EXISTS volume_id uuid REFERENCES public.logbook_volumes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS section_id text,
  ADD COLUMN IF NOT EXISTS flag_profile text,
  ADD COLUMN IF NOT EXISTS template_revision text,
  ADD COLUMN IF NOT EXISTS schema_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS line_number integer,
  ADD COLUMN IF NOT EXISTS digest text,
  ADD COLUMN IF NOT EXISTS source_sample_id uuid REFERENCES public.logbook_samples(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS superseded_by_id uuid REFERENCES public.logbook_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES public.logbook_pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recorded_capacity text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_logbook_entries_volume_section ON public.logbook_entries(volume_id, section_id, line_number) WHERE volume_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_logbook_entries_page ON public.logbook_entries(page_id);
CREATE INDEX IF NOT EXISTS idx_logbook_entries_amended ON public.logbook_entries(amended_from_id);

-- ── Signatures ──────────────────────────────────────────────────────────────
CREATE TABLE public.logbook_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id uuid NOT NULL REFERENCES public.logbook_entries(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('author','countersign','verify','acknowledge','attested')),
  actor_id uuid,
  actor_name text,
  actor_role text,
  actor_capacity text,
  witness_name text,
  witness_capacity text,
  digest text NOT NULL,
  entry_version integer NOT NULL,
  page_id uuid REFERENCES public.logbook_pages(id) ON DELETE SET NULL,
  method text NOT NULL DEFAULT 'reviewed-attestation',
  statement text,
  signed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.logbook_signatures TO authenticated;
GRANT ALL ON public.logbook_signatures TO service_role;
ALTER TABLE public.logbook_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logbook_signatures_select_company" ON public.logbook_signatures
  FOR SELECT TO authenticated USING (public.user_belongs_to_company(auth.uid(), company_id));
CREATE INDEX idx_logbook_signatures_entry ON public.logbook_signatures(entry_id, signed_at);
CREATE UNIQUE INDEX idx_logbook_signatures_unique ON public.logbook_signatures(entry_id, kind, COALESCE(actor_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(witness_capacity, ''));

-- ── Canonical digest of an entry's signed content ───────────────────────────
CREATE OR REPLACE FUNCTION public.logbook_entry_digest(e public.logbook_entries)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'id', e.id,
    'logbook_id', e.logbook_id,
    'volume_id', e.volume_id,
    'section_id', e.section_id,
    'flag_profile', e.flag_profile,
    'template_revision', e.template_revision,
    'schema', e.schema_snapshot,
    'entry_at', to_char(e.entry_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'data', e.data,
    'remarks', e.remarks,
    'summary', e.summary,
    'source_sample_id', e.source_sample_id,
    'source_snapshot', e.source_snapshot,
    'override_reason', e.override_reason,
    'recorded_by', e.recorded_by,
    'recorded_capacity', e.recorded_capacity,
    'amended_from_id', e.amended_from_id,
    'amendment_reason', e.amendment_reason
  )::text, 'UTF8')), 'hex');
$$;
REVOKE ALL ON FUNCTION public.logbook_entry_digest(public.logbook_entries) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logbook_entry_digest(public.logbook_entries) TO authenticated;

-- ── Signature policy evaluation (mirrors src/modules/logbooks/lib/formRules.ts)
CREATE OR REPLACE FUNCTION public.logbook_missing_signers(_policy text, _capacities text[], _with_master boolean DEFAULT false)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  caps text[] := COALESCE(_capacities, ARRAY[]::text[]);
  missing text[] := ARRAY[]::text[];
  crew_count integer;
BEGIN
  IF _policy IS NULL THEN RETURN missing; END IF;
  IF _with_master THEN caps := array_append(caps, 'master'); END IF;
  IF NOT ('master' = ANY(caps)) THEN missing := array_append(missing, 'Master'); END IF;
  IF _policy = 'master-crew' AND NOT (caps && ARRAY['officer','engineer','steward']) THEN missing := array_append(missing, 'another crew member'); END IF;
  IF _policy = 'master-officer' AND NOT (caps && ARRAY['officer','engineer']) THEN missing := array_append(missing, 'another officer'); END IF;
  IF _policy = 'inspector-crew' THEN
    SELECT count(DISTINCT c) INTO crew_count FROM unnest(caps) c WHERE c IN ('master','officer','engineer','steward');
    IF crew_count < 2 THEN missing := array_append(missing, 'another crew member'); END IF;
  END IF;
  IF _policy = 'master-catering' AND NOT ('steward' = ANY(caps)) THEN missing := array_append(missing, 'catering witness'); END IF;
  IF _policy = 'master-mother' AND NOT ('mother' = ANY(caps)) THEN missing := array_append(missing, 'mother'); END IF;
  IF _policy = 'surveyor-master' AND NOT ('surveyor' = ANY(caps)) THEN missing := array_append(missing, 'authorized surveyor'); END IF;
  IF _policy = 'port-master' AND NOT ('portofficial' = ANY(caps)) THEN missing := array_append(missing, 'port official'); END IF;
  RETURN missing;
END; $$;
REVOKE ALL ON FUNCTION public.logbook_missing_signers(text, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logbook_missing_signers(text, text[], boolean) TO authenticated;

-- Capacities present on an entry (author, countersigners, attested witnesses and the attesting Master).
CREATE OR REPLACE FUNCTION public.logbook_entry_capacities(_entry_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT c), ARRAY[]::text[]) FROM (
    SELECT s.actor_capacity AS c FROM public.logbook_signatures s WHERE s.entry_id = _entry_id AND s.kind <> 'acknowledge' AND s.actor_capacity IS NOT NULL
    UNION ALL
    SELECT s.witness_capacity FROM public.logbook_signatures s WHERE s.entry_id = _entry_id AND s.kind = 'attested' AND s.witness_capacity IS NOT NULL
  ) caps;
$$;
REVOKE ALL ON FUNCTION public.logbook_entry_capacities(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logbook_entry_capacities(uuid) TO authenticated;

-- ── Entry guard: schema snapshot, volume state, immutability, versions ──────
CREATE OR REPLACE FUNCTION public.logbook_entries_meridian_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rpc boolean := COALESCE(current_setting('logbook.rpc', true), 'off') = 'on';
  v_volume public.logbook_volumes%ROWTYPE;
  v_section jsonb;
  v_sample public.logbook_samples%ROWTYPE;
  v_original public.logbook_entries%ROWTYPE;
  v_field jsonb;
  v_changed boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Signed records cannot be deleted. Create a linked correction.'; END IF;
    IF EXISTS (SELECT 1 FROM public.logbook_entries WHERE amended_from_id = OLD.id) THEN
      RAISE EXCEPTION 'This record has a linked correction and cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
    -- Signed content is immutable; only linkage columns may change and only via the RPCs.
    IF OLD.status <> 'draft' THEN
      IF NOT v_rpc THEN
        RAISE EXCEPTION 'Signed records are locked. Create a linked correction.';
      END IF;
      IF NEW.data IS DISTINCT FROM OLD.data OR NEW.entry_at IS DISTINCT FROM OLD.entry_at OR NEW.remarks IS DISTINCT FROM OLD.remarks
         OR NEW.summary IS DISTINCT FROM OLD.summary OR NEW.schema_snapshot IS DISTINCT FROM OLD.schema_snapshot
         OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot OR NEW.override_reason IS DISTINCT FROM OLD.override_reason
         OR NEW.amended_from_id IS DISTINCT FROM OLD.amended_from_id OR NEW.amendment_reason IS DISTINCT FROM OLD.amendment_reason
         OR NEW.volume_id IS DISTINCT FROM OLD.volume_id OR NEW.section_id IS DISTINCT FROM OLD.section_id
         OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by OR NEW.digest IS DISTINCT FROM OLD.digest THEN
        RAISE EXCEPTION 'Signed content cannot change.';
      END IF;
      RETURN NEW;
    END IF;
    -- Draft edits
    IF NEW.status <> 'draft' AND NOT v_rpc THEN
      RAISE EXCEPTION 'Use the signing function to sign a record.';
    END IF;
    IF NOT v_rpc THEN
      IF NEW.volume_id IS DISTINCT FROM OLD.volume_id THEN RAISE EXCEPTION 'A draft cannot move between volumes.'; END IF;
      IF NEW.section_id IS DISTINCT FROM OLD.section_id THEN RAISE EXCEPTION 'A draft cannot change its section.'; END IF;
      IF NEW.logbook_id IS DISTINCT FROM OLD.logbook_id THEN RAISE EXCEPTION 'A draft cannot be moved to a different logbook.'; END IF;
      IF OLD.source_sample_id IS NOT NULL AND NEW.source_sample_id IS DISTINCT FROM OLD.source_sample_id THEN
        RAISE EXCEPTION 'The captured source must remain attached to this draft.';
      END IF;
      IF NEW.amended_from_id IS DISTINCT FROM OLD.amended_from_id THEN RAISE EXCEPTION 'A correction link cannot change.'; END IF;
      NEW.recorded_by := OLD.recorded_by;
      NEW.recorded_by_name := OLD.recorded_by_name;
      NEW.recorded_capacity := OLD.recorded_capacity;
      NEW.schema_snapshot := OLD.schema_snapshot;
      NEW.flag_profile := OLD.flag_profile;
      NEW.template_revision := OLD.template_revision;
      NEW.line_number := OLD.line_number;
      NEW.digest := NULL;
      NEW.page_id := OLD.page_id;
      NEW.superseded_by_id := OLD.superseded_by_id;
      IF OLD.recorded_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Only the draft author can edit this entry.';
      END IF;
    END IF;
  ELSE
    -- INSERT
    IF NOT v_rpc THEN
      NEW.status := 'draft';
      NEW.digest := NULL;
      NEW.page_id := NULL;
      NEW.superseded_by_id := NULL;
      NEW.signed_by := NULL; NEW.signed_by_name := NULL; NEW.signed_at := NULL;
      NEW.recorded_by := auth.uid();
      NEW.recorded_by_name := public.logbook_actor_name(auth.uid());
      NEW.recorded_capacity := public.logbook_capacity(auth.uid());
      NEW.version := 1;
    END IF;
  END IF;

  IF NEW.entry_at > now() + interval '60 seconds' THEN
    RAISE EXCEPTION 'Event time cannot be in the future.';
  END IF;
  NEW.entry_date := (NEW.entry_at AT TIME ZONE 'UTC')::date;

  -- Templated (Meridian) entries: validate against the volume.
  IF NEW.volume_id IS NOT NULL THEN
    SELECT * INTO v_volume FROM public.logbook_volumes WHERE id = NEW.volume_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose a matching opened book.'; END IF;
    IF v_volume.logbook_id <> NEW.logbook_id OR v_volume.company_id <> NEW.company_id THEN
      RAISE EXCEPTION 'Entry must belong to the volume''s logbook.';
    END IF;
    IF v_volume.status <> 'open' AND NOT v_rpc THEN
      RAISE EXCEPTION 'This volume is closed. Open a continuation book.';
    END IF;
    IF NEW.section_id IS NULL THEN RAISE EXCEPTION 'Choose a section in this book.'; END IF;
    IF TG_OP = 'INSERT' THEN
      SELECT s INTO v_section FROM jsonb_array_elements(v_volume.template -> 'sections') s WHERE s ->> 'id' = NEW.section_id;
      IF v_section IS NULL THEN RAISE EXCEPTION 'Choose a section in this book.'; END IF;
      NEW.schema_snapshot := v_section;
      NEW.flag_profile := v_volume.flag_profile;
      NEW.template_revision := v_volume.template_revision;
      NEW.vessel_id := v_volume.vessel_id;
      IF NEW.recorded_capacity IS NULL THEN
        RAISE EXCEPTION 'Your role has no logbook writing capacity.';
      END IF;
      IF NEW.recorded_capacity <> 'master' AND jsonb_typeof(v_volume.template -> 'roles') = 'array'
         AND NOT (v_volume.template -> 'roles') ? NEW.recorded_capacity THEN
        RAISE EXCEPTION 'This role cannot write to this logbook.';
      END IF;
      IF NEW.recorded_capacity <> 'master' AND jsonb_typeof(v_volume.template -> 'roles') = 'array'
         AND NOT (v_volume.template -> 'roles') ? NEW.recorded_capacity THEN
        RAISE EXCEPTION 'This role cannot write to this logbook.';
      END IF;
      IF NEW.recorded_capacity <> 'master' AND v_section ? 'roles' AND jsonb_typeof(v_section -> 'roles') = 'array'
         AND NOT (v_section -> 'roles') ? NEW.recorded_capacity THEN
        RAISE EXCEPTION 'This section requires a different author role.';
      END IF;
      -- Serialise concurrent inserts into the same section so line numbers stay gap-free and unique.
      PERFORM pg_advisory_xact_lock(hashtext(NEW.volume_id::text || ':' || NEW.section_id));
      SELECT COALESCE(MAX(line_number), 0) + 1 INTO NEW.line_number FROM public.logbook_entries
       WHERE volume_id = NEW.volume_id AND section_id = NEW.section_id;
    END IF;
    -- Every stored key must be a schema field.
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(NEW.data) k
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.schema_snapshot -> 'fields') f WHERE f ->> 'key' = k)
    ) THEN
      RAISE EXCEPTION 'Unexpected entry field.';
    END IF;
    -- Type checks on present values (completeness is checked at signing).
    FOR v_field IN SELECT f FROM jsonb_array_elements(NEW.schema_snapshot -> 'fields') f LOOP
      IF NEW.data ? (v_field ->> 'key') AND jsonb_typeof(NEW.data -> (v_field ->> 'key')) <> 'null' THEN
        IF v_field ->> 'type' = 'number' THEN
          IF jsonb_typeof(NEW.data -> (v_field ->> 'key')) <> 'number'
             OR (NEW.data ->> (v_field ->> 'key'))::numeric < COALESCE((v_field ->> 'min')::numeric, -1e18)
             OR (NEW.data ->> (v_field ->> 'key'))::numeric > COALESCE((v_field ->> 'max')::numeric, 1e18) THEN
            RAISE EXCEPTION '% must be between % and %.', v_field ->> 'label', v_field ->> 'min', v_field ->> 'max';
          END IF;
        ELSE
          IF jsonb_typeof(NEW.data -> (v_field ->> 'key')) <> 'string'
             OR length(NEW.data ->> (v_field ->> 'key')) > (CASE WHEN v_field ->> 'type' = 'textarea' THEN 4000 ELSE 500 END) THEN
            RAISE EXCEPTION '% is invalid or too long.', v_field ->> 'label';
          END IF;
          IF v_field ? 'options' AND NOT (v_field -> 'options') ? (NEW.data ->> (v_field ->> 'key')) THEN
            RAISE EXCEPTION 'Choose a valid %.', v_field ->> 'label';
          END IF;
        END IF;
      END IF;
    END LOOP;
    IF NEW.remarks IS NOT NULL AND length(NEW.remarks) > 4000 THEN RAISE EXCEPTION 'Remarks must be text up to 4000 characters.'; END IF;
  END IF;

  -- Captured source evidence.
  IF NEW.source_sample_id IS NOT NULL THEN
    SELECT * INTO v_sample FROM public.logbook_samples WHERE id = NEW.source_sample_id;
    IF NOT FOUND OR v_sample.vessel_id <> NEW.vessel_id THEN RAISE EXCEPTION 'A matching captured source is required.'; END IF;
    IF TG_OP = 'INSERT' OR OLD.source_sample_id IS DISTINCT FROM NEW.source_sample_id THEN
      IF v_sample.observed_at < now() - interval '120 seconds' OR v_sample.observed_at > now() + interval '5 seconds' THEN
        RAISE EXCEPTION 'This sample is stale or its clock is ahead. Capture a fresh sample or enter values manually.';
      END IF;
      NEW.source_snapshot := to_jsonb(v_sample);
    ELSE
      NEW.source_snapshot := OLD.source_snapshot;
    END IF;
    IF abs(extract(epoch FROM (NEW.entry_at - v_sample.observed_at))) > 120 THEN
      RAISE EXCEPTION 'The event time must be within two minutes of the source sample.';
    END IF;
    -- Changed captured values need an explanation.
    IF NEW.schema_snapshot IS NOT NULL THEN
      FOR v_field IN SELECT f FROM jsonb_array_elements(NEW.schema_snapshot -> 'fields') f WHERE f ? 'telemetry' LOOP
        IF (NEW.data -> (v_field ->> 'key')) IS DISTINCT FROM (NEW.source_snapshot -> 'values' -> (v_field ->> 'telemetry')) THEN
          v_changed := true;
        END IF;
      END LOOP;
      IF v_changed AND COALESCE(btrim(NEW.override_reason), '') = '' THEN
        RAISE EXCEPTION 'Reason for changing captured values is required.';
      END IF;
    END IF;
  ELSE
    NEW.source_snapshot := NULL;
  END IF;

  -- Linked corrections keep the original visible until they are fully signed.
  IF TG_OP = 'INSERT' AND NEW.amended_from_id IS NOT NULL THEN
    SELECT * INTO v_original FROM public.logbook_entries WHERE id = NEW.amended_from_id;
    IF NOT FOUND OR v_original.logbook_id <> NEW.logbook_id OR v_original.status NOT IN ('signed','verified') OR v_original.superseded_by_id IS NOT NULL THEN
      RAISE EXCEPTION 'Only a current signed record can be corrected.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.logbook_entries WHERE amended_from_id = v_original.id) THEN
      RAISE EXCEPTION 'A correction already exists for this record.';
    END IF;
    IF COALESCE(btrim(NEW.amendment_reason), '') = '' THEN RAISE EXCEPTION 'Correction reason is required.'; END IF;
    IF v_original.volume_id IS NOT NULL THEN
      IF NEW.section_id IS DISTINCT FROM v_original.section_id OR NEW.flag_profile IS DISTINCT FROM v_original.flag_profile THEN
        RAISE EXCEPTION 'Corrections must retain the section and flag format.';
      END IF;
      IF NEW.volume_id <> v_original.volume_id AND v_volume.continuation_of IS DISTINCT FROM v_original.volume_id THEN
        RAISE EXCEPTION 'Use the original volume or its continuation for this correction.';
      END IF;
      IF NEW.schema_snapshot IS DISTINCT FROM v_original.schema_snapshot THEN
        RAISE EXCEPTION 'Correction schema must match the original edition.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.logbook_entries_meridian_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER logbook_entries_meridian_guard BEFORE INSERT OR UPDATE OR DELETE ON public.logbook_entries
  FOR EACH ROW EXECUTE FUNCTION public.logbook_entries_meridian_guard();

-- Track the new columns in the existing audit trail.
CREATE OR REPLACE FUNCTION public.logbook_entries_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_actor uuid := auth.uid();
  v_tracked text[] := ARRAY[
    'entry_at','entry_date','watch_period','page_number','summary','remarks',
    'data','latitude','longitude','position_text','status','signed_by','signed_by_name','signed_at',
    'volume_id','section_id','override_reason','source_sample_id','superseded_by_id','page_id','amended_from_id','amendment_reason','digest'
  ];
  v_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.logbook_entry_audit (entry_id, logbook_id, company_id, vessel_id, action, new_values, actor_id, actor_name)
    VALUES (NEW.id, NEW.logbook_id, NEW.company_id, NEW.vessel_id, 'created', to_jsonb(NEW) - 'created_at' - 'updated_at' - 'schema_snapshot' - 'source_snapshot', v_actor, public.logbook_actor_name(v_actor));
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.logbook_entry_audit (entry_id, logbook_id, company_id, vessel_id, action, old_values, actor_id, actor_name)
    VALUES (OLD.id, OLD.logbook_id, OLD.company_id, OLD.vessel_id, 'deleted', to_jsonb(OLD) - 'created_at' - 'updated_at' - 'schema_snapshot' - 'source_snapshot', v_actor, public.logbook_actor_name(v_actor));
    RETURN OLD;
  END IF;
  v_old := '{}'::jsonb; v_new := '{}'::jsonb; v_changed := ARRAY[]::text[];
  FOREACH v_key IN ARRAY v_tracked LOOP
    IF to_jsonb(OLD) -> v_key IS DISTINCT FROM to_jsonb(NEW) -> v_key THEN
      v_changed := v_changed || v_key;
      v_old := v_old || jsonb_build_object(v_key, to_jsonb(OLD) -> v_key);
      v_new := v_new || jsonb_build_object(v_key, to_jsonb(NEW) -> v_key);
    END IF;
  END LOOP;
  IF array_length(v_changed, 1) IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.logbook_entry_audit (entry_id, logbook_id, company_id, vessel_id, action, changed_fields, old_values, new_values, actor_id, actor_name)
  VALUES (NEW.id, NEW.logbook_id, NEW.company_id, NEW.vessel_id,
    CASE
      WHEN NEW.status = 'signed' AND OLD.status <> 'signed' THEN 'signed'
      WHEN NEW.status = 'verified' AND OLD.status <> 'verified' THEN 'verified'
      WHEN NEW.superseded_by_id IS NOT NULL AND OLD.superseded_by_id IS NULL THEN 'superseded'
      ELSE 'updated'
    END,
    v_changed, v_old, v_new, v_actor, public.logbook_actor_name(v_actor));
  RETURN NEW;
END;
$$;

-- ── Supersession: a correction replaces its original once fully signed ──────
CREATE OR REPLACE FUNCTION public.logbook_refresh_supersession(_entry_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry public.logbook_entries%ROWTYPE;
BEGIN
  SELECT * INTO v_entry FROM public.logbook_entries WHERE id = _entry_id;
  IF v_entry.amended_from_id IS NULL OR v_entry.status NOT IN ('signed','verified') THEN RETURN; END IF;
  IF array_length(public.logbook_missing_signers(v_entry.schema_snapshot ->> 'signing', public.logbook_entry_capacities(v_entry.id), false), 1) IS NOT NULL THEN
    RETURN;
  END IF;
  PERFORM set_config('logbook.rpc', 'on', true);
  UPDATE public.logbook_entries SET superseded_by_id = v_entry.id WHERE id = v_entry.amended_from_id AND superseded_by_id IS NULL;
END; $$;
REVOKE ALL ON FUNCTION public.logbook_refresh_supersession(uuid) FROM PUBLIC, anon, authenticated;

-- ── Signing RPC: author signature, countersignature, attested witness, Master verification, acknowledgement
CREATE OR REPLACE FUNCTION public.logbook_sign_entry(
  p_entry_id uuid,
  p_expected_version integer,
  p_kind text,
  p_witness_name text DEFAULT NULL,
  p_witness_capacity text DEFAULT NULL
)
RETURNS public.logbook_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_capacity text := public.logbook_capacity(auth.uid());
  v_entry public.logbook_entries%ROWTYPE;
  v_volume public.logbook_volumes%ROWTYPE;
  v_policy text;
  v_field jsonb;
  v_required boolean;
  v_missing text[];
  v_digest text;
  v_statement text := 'Reviewed and attested in the logbook workspace. Not an advanced electronic signature; no flag, MCA or class approval is held.';
  v_witness text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in to attest a record.'; END IF;
  SELECT * INTO v_entry FROM public.logbook_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR NOT public.user_belongs_to_company(v_uid, v_entry.company_id) THEN RAISE EXCEPTION 'Entry not found.'; END IF;
  IF v_entry.version <> p_expected_version THEN RAISE EXCEPTION 'This record changed. Refresh it before continuing.'; END IF;
  IF v_capacity IS NULL THEN RAISE EXCEPTION 'Your role cannot sign logbook records.'; END IF;
  IF v_entry.volume_id IS NOT NULL THEN
    SELECT * INTO v_volume FROM public.logbook_volumes WHERE id = v_entry.volume_id;
  END IF;
  v_policy := v_entry.schema_snapshot ->> 'signing';
  PERFORM set_config('logbook.rpc', 'on', true);

  IF p_kind = 'author' THEN
    IF v_entry.status <> 'draft' THEN RAISE EXCEPTION 'Signed records are locked. Create a linked correction.'; END IF;
    IF v_entry.recorded_by IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Only the draft author can sign this entry.'; END IF;
    IF v_entry.volume_id IS NOT NULL AND v_volume.status <> 'open' THEN RAISE EXCEPTION 'This volume is closed.'; END IF;
    -- Completeness: every required (or conditionally required) field must be present.
    IF v_entry.schema_snapshot IS NOT NULL THEN
      FOR v_field IN SELECT f FROM jsonb_array_elements(v_entry.schema_snapshot -> 'fields') f LOOP
        v_required := COALESCE((v_field ->> 'required')::boolean, false)
          OR (v_field ? 'requiredWhen' AND (v_entry.data ->> (v_field -> 'requiredWhen' ->> 'field')) = (v_field -> 'requiredWhen' ->> 'equals'));
        IF v_required AND (NOT v_entry.data ? (v_field ->> 'key') OR COALESCE(v_entry.data ->> (v_field ->> 'key'), '') = '') THEN
          RAISE EXCEPTION '% is required before signing.', v_field ->> 'label';
        END IF;
      END LOOP;
      IF v_entry.data ? 'startTime' AND v_entry.data ? 'endTime' AND (v_entry.data ->> 'endTime') < (v_entry.data ->> 'startTime') THEN
        RAISE EXCEPTION 'Finish time must be on or after start time.';
      END IF;
    ELSIF COALESCE(btrim(v_entry.summary), '') = '' THEN
      RAISE EXCEPTION 'A summary is required before signing.';
    END IF;
    v_digest := public.logbook_entry_digest(v_entry);
    UPDATE public.logbook_entries
       SET status = 'signed', digest = v_digest, signed_by = v_uid, signed_by_name = public.logbook_actor_name(v_uid), signed_at = now()
     WHERE id = v_entry.id RETURNING * INTO v_entry;
    INSERT INTO public.logbook_signatures (entry_id, company_id, vessel_id, kind, actor_id, actor_name, actor_role, actor_capacity, digest, entry_version, statement)
    VALUES (v_entry.id, v_entry.company_id, v_entry.vessel_id, 'author', v_uid, public.logbook_actor_name(v_uid), v_capacity, v_capacity, v_digest, v_entry.version, v_statement);

  ELSIF p_kind = 'countersign' THEN
    IF v_entry.status NOT IN ('signed','verified') OR v_entry.superseded_by_id IS NOT NULL THEN RAISE EXCEPTION 'Only a current signed record can be countersigned.'; END IF;
    IF v_entry.recorded_by = v_uid THEN RAISE EXCEPTION 'The author cannot countersign their own record.'; END IF;
    IF NOT (
      (v_policy = 'master-catering' AND v_capacity = 'steward') OR
      (v_policy = 'master-officer' AND v_capacity IN ('officer','engineer')) OR
      (v_policy IN ('master-crew','inspector-crew') AND v_capacity IN ('officer','engineer','steward'))
    ) THEN RAISE EXCEPTION 'Your capacity cannot countersign this record.'; END IF;
    IF EXISTS (SELECT 1 FROM public.logbook_signatures WHERE entry_id = v_entry.id AND kind = 'countersign' AND actor_id = v_uid) THEN
      RAISE EXCEPTION 'You have already countersigned this record.';
    END IF;
    IF v_entry.digest IS DISTINCT FROM public.logbook_entry_digest(v_entry) THEN RAISE EXCEPTION 'Record digest mismatch. The signed content has changed.'; END IF;
    INSERT INTO public.logbook_signatures (entry_id, company_id, vessel_id, kind, actor_id, actor_name, actor_role, actor_capacity, digest, entry_version, statement)
    VALUES (v_entry.id, v_entry.company_id, v_entry.vessel_id, 'countersign', v_uid, public.logbook_actor_name(v_uid), v_capacity, v_capacity, v_entry.digest, v_entry.version, v_statement);
    UPDATE public.logbook_entries SET updated_at = now() WHERE id = v_entry.id RETURNING * INTO v_entry;

  ELSIF p_kind = 'attested' THEN
    IF v_capacity <> 'master' THEN RAISE EXCEPTION 'Only the Master can attest an external witness signature.'; END IF;
    IF v_entry.status NOT IN ('signed','verified') OR v_entry.superseded_by_id IS NOT NULL THEN RAISE EXCEPTION 'Only a current signed record can be attested.'; END IF;
    v_witness := CASE v_policy WHEN 'master-mother' THEN 'mother' WHEN 'surveyor-master' THEN 'surveyor' WHEN 'port-master' THEN 'portofficial' ELSE NULL END;
    IF v_witness IS NULL OR p_witness_capacity IS DISTINCT FROM v_witness THEN RAISE EXCEPTION 'This record does not require that external witness.'; END IF;
    IF COALESCE(btrim(p_witness_name), '') = '' THEN RAISE EXCEPTION 'Enter the witness''s full name.'; END IF;
    IF EXISTS (SELECT 1 FROM public.logbook_signatures WHERE entry_id = v_entry.id AND kind = 'attested' AND witness_capacity = v_witness) THEN
      RAISE EXCEPTION 'That witness signature has already been attested.';
    END IF;
    INSERT INTO public.logbook_signatures (entry_id, company_id, vessel_id, kind, actor_id, actor_name, actor_role, actor_capacity, witness_name, witness_capacity, digest, entry_version, statement)
    VALUES (v_entry.id, v_entry.company_id, v_entry.vessel_id, 'attested', v_uid, public.logbook_actor_name(v_uid), v_capacity, 'master', btrim(p_witness_name), v_witness, v_entry.digest, v_entry.version,
            'The Master attests that the named witness signed this record in the required capacity. ' || v_statement);
    UPDATE public.logbook_entries SET updated_at = now() WHERE id = v_entry.id RETURNING * INTO v_entry;

  ELSIF p_kind = 'verify' THEN
    IF v_capacity <> 'master' THEN RAISE EXCEPTION 'Only the Master can verify records.'; END IF;
    IF v_entry.status <> 'signed' OR v_entry.superseded_by_id IS NOT NULL THEN RAISE EXCEPTION 'Only a current signed record can be verified.'; END IF;
    IF v_entry.digest IS DISTINCT FROM public.logbook_entry_digest(v_entry) THEN RAISE EXCEPTION 'Record digest mismatch. The signed content has changed.'; END IF;
    v_missing := public.logbook_missing_signers(v_policy, public.logbook_entry_capacities(v_entry.id), true);
    IF array_length(v_missing, 1) IS NOT NULL THEN RAISE EXCEPTION 'Still requires %.', array_to_string(v_missing, ', '); END IF;
    INSERT INTO public.logbook_signatures (entry_id, company_id, vessel_id, kind, actor_id, actor_name, actor_role, actor_capacity, digest, entry_version, statement)
    VALUES (v_entry.id, v_entry.company_id, v_entry.vessel_id, 'verify', v_uid, public.logbook_actor_name(v_uid), v_capacity, 'master', v_entry.digest, v_entry.version, v_statement);
    UPDATE public.logbook_entries SET status = 'verified' WHERE id = v_entry.id RETURNING * INTO v_entry;

  ELSIF p_kind = 'acknowledge' THEN
    IF COALESCE((v_entry.schema_snapshot ->> 'acknowledgement')::boolean, false) = false OR v_entry.status = 'draft' OR v_entry.superseded_by_id IS NOT NULL THEN
      RAISE EXCEPTION 'Only a current signed order can be acknowledged.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.logbook_signatures WHERE entry_id = v_entry.id AND kind = 'acknowledge' AND actor_id = v_uid) THEN
      RAISE EXCEPTION 'Already acknowledged.';
    END IF;
    INSERT INTO public.logbook_signatures (entry_id, company_id, vessel_id, kind, actor_id, actor_name, actor_role, actor_capacity, digest, entry_version, statement)
    VALUES (v_entry.id, v_entry.company_id, v_entry.vessel_id, 'acknowledge', v_uid, public.logbook_actor_name(v_uid), v_capacity, v_capacity, v_entry.digest, v_entry.version, 'Order read and acknowledged.');
    UPDATE public.logbook_entries SET updated_at = now() WHERE id = v_entry.id RETURNING * INTO v_entry;
  ELSE
    RAISE EXCEPTION 'Unknown signature kind.';
  END IF;

  PERFORM public.logbook_refresh_supersession(v_entry.id);
  SELECT * INTO v_entry FROM public.logbook_entries WHERE id = v_entry.id;
  RETURN v_entry;
END; $$;
REVOKE ALL ON FUNCTION public.logbook_sign_entry(uuid, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logbook_sign_entry(uuid, integer, text, text, text) TO authenticated;

-- ── Page sealing: the Master fixes a group of signed records ────────────────
CREATE OR REPLACE FUNCTION public.logbook_seal_page(p_volume_id uuid, p_section_id text, p_entry_ids uuid[])
RETURNS public.logbook_pages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_volume public.logbook_volumes%ROWTYPE;
  v_entry public.logbook_entries%ROWTYPE;
  v_ordered uuid[] := ARRAY[]::uuid[];
  v_digests text[] := ARRAY[]::text[];
  v_page public.logbook_pages%ROWTYPE;
  v_number integer;
  v_missing text[];
  v_digest text;
BEGIN
  IF v_uid IS NULL OR public.logbook_capacity(v_uid) <> 'master' THEN RAISE EXCEPTION 'Only the Master can sign a completed page.'; END IF;
  SELECT * INTO v_volume FROM public.logbook_volumes WHERE id = p_volume_id FOR UPDATE;
  IF NOT FOUND OR NOT public.user_belongs_to_company(v_uid, v_volume.company_id) THEN RAISE EXCEPTION 'Choose an open volume.'; END IF;
  IF v_volume.status <> 'open' THEN RAISE EXCEPTION 'Choose an open volume.'; END IF;
  IF p_entry_ids IS NULL OR array_length(p_entry_ids, 1) IS NULL OR array_length(p_entry_ids, 1) > 100
     OR (SELECT count(DISTINCT e) FROM unnest(p_entry_ids) e) <> array_length(p_entry_ids, 1) THEN
    RAISE EXCEPTION 'Choose 1–100 distinct records.';
  END IF;
  FOR v_entry IN
    SELECT e.* FROM public.logbook_entries e WHERE e.id = ANY(p_entry_ids) ORDER BY e.entry_at, e.created_at FOR UPDATE
  LOOP
    IF v_entry.volume_id IS DISTINCT FROM p_volume_id OR v_entry.section_id IS DISTINCT FROM p_section_id
       OR v_entry.status = 'draft' OR v_entry.page_id IS NOT NULL OR v_entry.superseded_by_id IS NOT NULL THEN
      RAISE EXCEPTION 'Page records must be current, signed, unpaged and from the same book section.';
    END IF;
    IF v_entry.digest IS DISTINCT FROM public.logbook_entry_digest(v_entry) THEN RAISE EXCEPTION 'Record digest mismatch on line %.', v_entry.line_number; END IF;
    v_missing := public.logbook_missing_signers(v_entry.schema_snapshot ->> 'signing', public.logbook_entry_capacities(v_entry.id), true);
    IF array_length(v_missing, 1) IS NOT NULL THEN RAISE EXCEPTION 'Line % needs %.', v_entry.line_number, array_to_string(v_missing, ', '); END IF;
    v_ordered := v_ordered || v_entry.id;
    v_digests := v_digests || v_entry.digest;
  END LOOP;
  IF array_length(v_ordered, 1) <> array_length(p_entry_ids, 1) THEN RAISE EXCEPTION 'One or more records were not found.'; END IF;
  SELECT COALESCE(MAX(page_number), 0) + 1 INTO v_number FROM public.logbook_pages WHERE volume_id = p_volume_id;
  v_digest := encode(sha256(convert_to(jsonb_build_object('volume_id', p_volume_id, 'section_id', p_section_id, 'number', v_number, 'entries', to_jsonb(v_ordered), 'digests', to_jsonb(v_digests))::text, 'UTF8')), 'hex');
  INSERT INTO public.logbook_pages (volume_id, logbook_id, company_id, vessel_id, section_id, page_number, entry_ids, digests, digest, sealed_by, sealed_by_name, statement)
  VALUES (p_volume_id, v_volume.logbook_id, v_volume.company_id, v_volume.vessel_id, p_section_id, v_number, v_ordered, v_digests, v_digest, v_uid, public.logbook_actor_name(v_uid),
          'Master page review. Reviewed and attested in the logbook workspace. Not an advanced electronic signature.')
  RETURNING * INTO v_page;
  PERFORM set_config('logbook.rpc', 'on', true);
  UPDATE public.logbook_entries SET page_id = v_page.id, page_number = v_number, status = 'verified' WHERE id = ANY(v_ordered);
  INSERT INTO public.logbook_signatures (entry_id, company_id, vessel_id, kind, actor_id, actor_name, actor_role, actor_capacity, digest, entry_version, page_id, statement)
  SELECT e.id, e.company_id, e.vessel_id, 'verify', v_uid, public.logbook_actor_name(v_uid), 'master', 'master', e.digest, e.version, v_page.id, 'Master page review · page ' || v_number
    FROM public.logbook_entries e WHERE e.id = ANY(v_ordered)
     AND NOT EXISTS (SELECT 1 FROM public.logbook_signatures s WHERE s.entry_id = e.id AND s.kind = 'verify');
  UPDATE public.logbook_volumes SET page_count = v_number WHERE id = p_volume_id;
  -- A sealed correction now carries the Master's review: let it supersede its original.
  FOR v_entry IN SELECT e.* FROM public.logbook_entries e WHERE e.id = ANY(v_ordered) AND e.amended_from_id IS NOT NULL LOOP
    PERFORM public.logbook_refresh_supersession(v_entry.id);
  END LOOP;
  RETURN v_page;
END; $$;
REVOKE ALL ON FUNCTION public.logbook_seal_page(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logbook_seal_page(uuid, text, uuid[]) TO authenticated;

-- ── Volume closure ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.logbook_close_volume(p_volume_id uuid, p_expected_version integer, p_place text, p_reason text)
RETURNS public.logbook_volumes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_volume public.logbook_volumes%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR public.logbook_capacity(v_uid) <> 'master' THEN RAISE EXCEPTION 'Only the Master can close a volume.'; END IF;
  SELECT * INTO v_volume FROM public.logbook_volumes WHERE id = p_volume_id FOR UPDATE;
  IF NOT FOUND OR NOT public.user_belongs_to_company(v_uid, v_volume.company_id) THEN RAISE EXCEPTION 'Volume not found.'; END IF;
  IF v_volume.status <> 'open' THEN RAISE EXCEPTION 'Volume is not open.'; END IF;
  IF v_volume.version <> p_expected_version THEN RAISE EXCEPTION 'Volume changed. Refresh and retry.'; END IF;
  IF COALESCE(btrim(p_place), '') = '' OR COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'Closure place and reason are required.'; END IF;
  IF EXISTS (SELECT 1 FROM public.logbook_entries WHERE volume_id = p_volume_id AND superseded_by_id IS NULL AND (status = 'draft' OR page_id IS NULL)) THEN
    RAISE EXCEPTION 'Complete all drafts and sign their pages before closing.';
  END IF;
  PERFORM set_config('logbook.rpc', 'on', true);
  UPDATE public.logbook_volumes
     SET status = 'closed', closed_by = v_uid, closed_by_name = public.logbook_actor_name(v_uid), closed_at = now(),
         closure_place = btrim(p_place), closure_reason = btrim(p_reason)
   WHERE id = p_volume_id RETURNING * INTO v_volume;
  RETURN v_volume;
END; $$;
REVOKE ALL ON FUNCTION public.logbook_close_volume(uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logbook_close_volume(uuid, integer, text, text) TO authenticated;

-- ── Volume opening keeps entries readable after the logbook row changes ─────
CREATE OR REPLACE FUNCTION public.logbook_volume_touch_logbook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.logbooks SET updated_at = now() WHERE id = NEW.logbook_id;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.logbook_volume_touch_logbook() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER logbook_volumes_touch_logbook AFTER INSERT OR UPDATE ON public.logbook_volumes
  FOR EACH ROW EXECUTE FUNCTION public.logbook_volume_touch_logbook();

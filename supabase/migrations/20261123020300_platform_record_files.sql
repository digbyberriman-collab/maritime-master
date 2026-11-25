-- =================================================================
-- PLATFORM P4: record files and links (gap/08 UP1-UP3, DEL6 hook, §I;
-- DECISIONS C7, C8; Phase 2 spec §A.13, CC-12, CC-21)
-- Storage: bucket 'records' (private, 50 MB, the upload-policy MIME
--   allow-list), storage.objects policies records_select / records_insert
-- Tables: file_objects, record_attachments, record_links (vessel_id
--   denormalised from the from-envelope by trg_record_links_scope)
-- Helpers: storage_path_allowed(), register_file_object(),
--   attach_record_file(), remove_record_attachment(), link_records(),
--   unlink_records(); trigger record_links_scope()
-- TS mirror: src/lib/records/services/db.pending.ts (RecordsPendingTables
--   file_objects / record_attachments / record_links,
--   RecordsPendingFunctions register_file_object / attach_record_file /
--   remove_record_attachment / link_records / unlink_records),
--   src/lib/records/services/attachments.ts and links.ts
-- Shared fixture: supabase/tests/fixtures/upload-policy.json (bucket size,
--   MIME types, path / segment / safe-name patterns), asserted by
--   supabase/tests/sql/p4_files and the TS attachments test
-- =================================================================
--
-- Upload flow (spec §B.6): the browser stores the bytes at
--   <company_id>/<vessel_id|fleet>/<module_key>/<entity_type>/<entity_id>/<uuid>-<safe name>
-- in the private 'records' bucket (the storage API checks records_insert
-- with the user's JWT), then calls register_file_object (the object must be
-- stored; size and type checked again) and attach_record_file. Nothing is
-- "uploaded" until the object is stored, registered and attached.
--
-- Reads: every table here is SELECT-only for authenticated, through
-- record_readable(company_id, vessel_id) (active company member with fleet
-- reach or reach to the vessel). record_links carries the from-envelope's
-- vessel (stamped by trigger; a client value is overwritten), so its policy
-- needs no inline subquery (rule 15). No write policy: the definers below
-- are the only write path. Files and attachments are removed softly (no
-- storage UPDATE / DELETE policy; a later purge job uses the service role).
--
-- Errors: a business rule raises 22023 with a stable snake_case code as the
-- message (record_closed, reason_required, legal_hold, …), which the client
-- maps to "refused"; authorisation raises 42501, an unknown id P0002.
--
-- file_objects.vessel_id: the spec lists ON DELETE SET NULL, but the
-- storage_path CHECK pins the vessel segment, so setting it NULL could never
-- succeed; the key is NO ACTION instead (a vessel with files is archived,
-- never deleted, like a vessel with records: record_envelopes RESTRICT).
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.record_envelopes') IS NULL OR to_regprocedure('public.record_readable(uuid,uuid)') IS NULL
     OR to_regprocedure('public.record_log_event(uuid,text,text,jsonb,text,text)') IS NULL
     OR to_regprocedure('public.record_impersonating()') IS NULL OR to_regprocedure('public.record_caller_reaches(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020300_platform_record_files needs the record engine: apply 20261123020000_platform_record_registry.sql (with 020100 and 020200) first';
  END IF;
  IF to_regclass('public.record_thread_entries') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020300_platform_record_files needs the whole record-engine unit: apply 20261123020100 and 20261123020200 first';
  END IF;
  IF to_regprocedure('public.is_company_actor(uuid,uuid)') IS NULL OR to_regprocedure('public.user_has_fleet_reach(uuid,uuid)') IS NULL
     OR to_regprocedure('public.user_can_reach_vessel(uuid,uuid)') IS NULL OR to_regprocedure('public.user_is_active(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020300_platform_record_files needs the reach and capability helpers: apply 20261123000300 and 20261123000400 first';
  END IF;
  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261123020300_platform_record_files needs Supabase Storage (storage.buckets, storage.objects)';
  END IF;
END
$$;

-- ---------------------------------------------------------------- the records bucket (values = upload-policy.json)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('records', 'records', false, 52428800, ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]::text[])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------- path rule

-- The C7 path rule for the 'records' bucket, for auth.uid(): exactly six
-- segments <company_id>/<vessel_id|fleet>/<module_key>/<entity_type>/<entity_id>/<uuid>-<safe name>
-- (lower-case canonical uuids; module and entity type snake_case; the safe
-- name ^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$; no '..', no empty segment). The
-- caller is an active member of the company; 'fleet' needs fleet reach (or
-- being a company actor); a vessel must belong to the company and be
-- reached (fleet reach passes). Writing is the same rule in Phase 2
-- (module write capabilities come with the streams). No caller, another
-- bucket or anything unknown -> false (fail closed).
CREATE OR REPLACE FUNCTION public.storage_path_allowed(p_bucket text, p_name text, p_for_write boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_parts text[];
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_segment constant text := '^[a-z][a-z0-9_]{0,62}$';
  v_file constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9][A-Za-z0-9._-]{0,199}$';
  v_company uuid;
  v_vessel uuid;
BEGIN
  IF v_uid IS NULL OR p_bucket IS DISTINCT FROM 'records' OR p_name IS NULL OR p_for_write IS NULL
     OR length(p_name) > 512 OR position('..' IN p_name) > 0 THEN
    RETURN false;
  END IF;
  v_parts := string_to_array(p_name, '/');
  IF coalesce(array_length(v_parts, 1), 0) <> 6
     OR v_parts[1] !~ v_uuid
     OR (v_parts[2] <> 'fleet' AND v_parts[2] !~ v_uuid)
     OR v_parts[3] !~ v_segment
     OR v_parts[4] !~ v_segment
     OR v_parts[5] !~ v_uuid
     OR v_parts[6] !~ v_file THEN
    RETURN false;
  END IF;
  v_company := v_parts[1]::uuid;
  IF NOT public.user_belongs_to_company(v_uid, v_company) THEN
    RETURN false;
  END IF;
  IF v_parts[2] = 'fleet' THEN
    RETURN public.user_has_fleet_reach(v_uid, v_company) OR public.is_company_actor(v_uid, NULL);
  END IF;
  v_vessel := v_parts[2]::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.vessels AS v WHERE v.id = v_vessel AND v.company_id = v_company) THEN
    RETURN false;
  END IF;
  RETURN public.user_has_fleet_reach(v_uid, v_company) OR public.user_can_reach_vessel(v_uid, v_vessel);
END;
$$;

-- Storage policies (prefix records_: policy names are global across the
-- buckets of storage.objects). No UPDATE / DELETE policy: an object is never
-- overwritten (the client uploads with x-upsert false) or deleted from the
-- browser.
DROP POLICY IF EXISTS records_select ON storage.objects;
CREATE POLICY records_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'records' AND public.storage_path_allowed(bucket_id, name, false));

DROP POLICY IF EXISTS records_insert ON storage.objects;
CREATE POLICY records_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'records' AND public.storage_path_allowed(bucket_id, name, true));

-- ---------------------------------------------------------------- file_objects

CREATE TABLE IF NOT EXISTS public.file_objects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NULL,
  bucket text NOT NULL,
  storage_path text NOT NULL,
  module_key text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NULL,
  width integer NULL,
  height integer NULL,
  uploaded_by uuid NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'upload',
  removed_at timestamptz NULL,
  removed_by uuid NULL,
  removal_reason text NULL,
  legal_hold boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT file_objects_pkey PRIMARY KEY (id),
  CONSTRAINT file_objects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT file_objects_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE NO ACTION,
  CONSTRAINT file_objects_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT file_objects_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT file_objects_bucket_path_key UNIQUE (bucket, storage_path),
  CONSTRAINT file_objects_bucket_check CHECK (bucket = 'records'),
  CONSTRAINT file_objects_module_key_check CHECK (module_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT file_objects_entity_type_check CHECK (entity_type ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT file_objects_original_name_check CHECK (length(original_name) BETWEEN 1 AND 255),
  CONSTRAINT file_objects_mime_type_check CHECK (mime_type IN (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  CONSTRAINT file_objects_size_bytes_check CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  CONSTRAINT file_objects_sha256_check CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT file_objects_dimensions_check CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0)),
  CONSTRAINT file_objects_source_check CHECK (source IN ('upload', 'generated', 'import', 'email')),
  CONSTRAINT file_objects_removal_reason_check CHECK (removal_reason IS NULL OR length(removal_reason) <= 500),
  CONSTRAINT file_objects_storage_path_check CHECK (
    storage_path = company_id::text || '/' || coalesce(vessel_id::text, 'fleet') || '/' || module_key || '/' || entity_type || '/' || entity_id::text || '/' || split_part(storage_path, '/', 6))
);

CREATE INDEX IF NOT EXISTS idx_file_objects_scope ON public.file_objects (company_id, vessel_id);
CREATE INDEX IF NOT EXISTS idx_file_objects_entity ON public.file_objects (entity_type, entity_id);

ALTER TABLE public.file_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.file_objects FROM anon, authenticated;
GRANT SELECT ON TABLE public.file_objects TO authenticated;
GRANT ALL ON TABLE public.file_objects TO service_role;

DROP TRIGGER IF EXISTS trg_file_objects_updated_at ON public.file_objects;
CREATE TRIGGER trg_file_objects_updated_at
  BEFORE UPDATE ON public.file_objects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS file_objects_select ON public.file_objects;
CREATE POLICY file_objects_select ON public.file_objects
  FOR SELECT TO authenticated
  USING (public.record_readable(company_id, vessel_id));

-- ---------------------------------------------------------------- record_attachments

CREATE TABLE IF NOT EXISTS public.record_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL,
  company_id uuid NOT NULL,
  vessel_id uuid NULL,
  envelope_id uuid NULL,
  entity_type text NULL,
  entity_id uuid NULL,
  section_key text NULL,
  caption text NULL,
  version_of uuid NULL,
  sort_order integer NOT NULL DEFAULT 0,
  added_by uuid NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz NULL,
  removed_by uuid NULL,
  removal_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT record_attachments_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.file_objects(id) ON DELETE RESTRICT,
  CONSTRAINT record_attachments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT record_attachments_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE NO ACTION,
  CONSTRAINT record_attachments_envelope_id_fkey FOREIGN KEY (envelope_id) REFERENCES public.record_envelopes(id) ON DELETE RESTRICT,
  CONSTRAINT record_attachments_version_of_fkey FOREIGN KEY (version_of) REFERENCES public.record_attachments(id) ON DELETE RESTRICT,
  CONSTRAINT record_attachments_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT record_attachments_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT record_attachments_target_check CHECK (envelope_id IS NOT NULL OR (entity_type IS NOT NULL AND entity_id IS NOT NULL)),
  CONSTRAINT record_attachments_entity_type_check CHECK (entity_type IS NULL OR entity_type ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT record_attachments_section_key_check CHECK (section_key IS NULL OR section_key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT record_attachments_caption_check CHECK (caption IS NULL OR length(caption) <= 500),
  CONSTRAINT record_attachments_removal_reason_check CHECK (removal_reason IS NULL OR length(removal_reason) <= 500),
  CONSTRAINT record_attachments_version_of_check CHECK (version_of IS DISTINCT FROM id)
);

CREATE INDEX IF NOT EXISTS idx_record_attachments_envelope ON public.record_attachments (envelope_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_record_attachments_entity ON public.record_attachments (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_record_attachments_file ON public.record_attachments (file_id);

ALTER TABLE public.record_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.record_attachments FROM anon, authenticated;
GRANT SELECT ON TABLE public.record_attachments TO authenticated;
GRANT ALL ON TABLE public.record_attachments TO service_role;

DROP TRIGGER IF EXISTS trg_record_attachments_updated_at ON public.record_attachments;
CREATE TRIGGER trg_record_attachments_updated_at
  BEFORE UPDATE ON public.record_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS record_attachments_select ON public.record_attachments;
CREATE POLICY record_attachments_select ON public.record_attachments
  FOR SELECT TO authenticated
  USING (public.record_readable(company_id, vessel_id));

-- ---------------------------------------------------------------- record_links (C8)

CREATE TABLE IF NOT EXISTS public.record_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NULL,
  from_envelope_id uuid NOT NULL,
  to_envelope_id uuid NULL,
  to_entity_type text NULL,
  to_entity_id uuid NULL,
  link_kind text NOT NULL DEFAULT 'related',
  note text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz NULL,
  removed_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_links_pkey PRIMARY KEY (id),
  CONSTRAINT record_links_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT record_links_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE NO ACTION,
  CONSTRAINT record_links_from_envelope_id_fkey FOREIGN KEY (from_envelope_id) REFERENCES public.record_envelopes(id) ON DELETE RESTRICT,
  CONSTRAINT record_links_to_envelope_id_fkey FOREIGN KEY (to_envelope_id) REFERENCES public.record_envelopes(id) ON DELETE RESTRICT,
  CONSTRAINT record_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT record_links_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT record_links_link_kind_check CHECK (link_kind IN ('related', 'duplicate_of', 'follow_up', 'caused_by', 'parent')),
  CONSTRAINT record_links_note_check CHECK (note IS NULL OR length(note) <= 500),
  CONSTRAINT record_links_target_check CHECK ((to_envelope_id IS NOT NULL) <> (to_entity_type IS NOT NULL AND to_entity_id IS NOT NULL)),
  CONSTRAINT record_links_entity_pair_check CHECK ((to_entity_type IS NULL) = (to_entity_id IS NULL)),
  CONSTRAINT record_links_to_entity_type_check CHECK (to_entity_type IS NULL OR to_entity_type ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT record_links_not_self_check CHECK (to_envelope_id IS DISTINCT FROM from_envelope_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS record_links_live_key ON public.record_links (from_envelope_id, to_envelope_id, link_kind)
  WHERE removed_at IS NULL AND to_envelope_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS record_links_live_entity_key ON public.record_links (from_envelope_id, to_entity_type, to_entity_id, link_kind)
  WHERE removed_at IS NULL AND to_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_record_links_to ON public.record_links (to_envelope_id);

ALTER TABLE public.record_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.record_links FROM anon, authenticated;
GRANT SELECT ON TABLE public.record_links TO authenticated;
GRANT ALL ON TABLE public.record_links TO service_role;

DROP TRIGGER IF EXISTS trg_record_links_updated_at ON public.record_links;
CREATE TRIGGER trg_record_links_updated_at
  BEFORE UPDATE ON public.record_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The link's company and vessel are always the from-envelope's (CC-12): a
-- client or service value is overwritten, so the read policy can use the
-- denormalised columns without a subquery.
CREATE OR REPLACE FUNCTION public.record_links_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_vessel uuid;
BEGIN
  SELECT e.company_id, e.vessel_id INTO v_company, v_vessel FROM public.record_envelopes AS e WHERE e.id = NEW.from_envelope_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'record_not_found', DETAIL = 'A link starts from an existing record.';
  END IF;
  NEW.company_id := v_company;
  NEW.vessel_id := v_vessel;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_links_scope ON public.record_links;
CREATE TRIGGER trg_record_links_scope
  BEFORE INSERT OR UPDATE OF from_envelope_id, company_id, vessel_id ON public.record_links
  FOR EACH ROW EXECUTE FUNCTION public.record_links_scope();

DROP POLICY IF EXISTS record_links_select ON public.record_links;
CREATE POLICY record_links_select ON public.record_links
  FOR SELECT TO authenticated
  USING (public.record_readable(company_id, vessel_id));

-- ---------------------------------------------------------------- register a stored object

-- register_file_object: the caller may write the path (storage_path_allowed),
-- the object is stored (storage.objects; P0002 otherwise) and was uploaded by
-- the caller (owner, when Storage recorded one), its stored size and type
-- (metadata, when present) equal what is registered, the type is on the
-- allow-list and the size within 50 MB (22023 otherwise); a given p_sha256
-- is 64 lower-case hex (22023 sha256_invalid, checked first). Company,
-- vessel, module and entity come from the path. Idempotent on (bucket,
-- path): a second call returns the row, except that the uploader's call
-- with a valid p_sha256 fills a missing hash (never overwriting a stored
-- one; review round 3, sign-image-requires-unsent-sha256). The hash is
-- client-asserted: nothing here reads the stored bytes.
CREATE OR REPLACE FUNCTION public.register_file_object(
  p_bucket text,
  p_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text DEFAULT NULL
)
RETURNS public.file_objects
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  f public.file_objects;
  o record;
  v_parts text[];
  v_name text := btrim(coalesce(p_original_name, ''));
  v_owner text;
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'file_access_denied';
  END IF;
  IF NOT public.storage_path_allowed(p_bucket, p_path, true) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'file_access_denied', DETAIL = 'This file path is outside the records you can add files to.';
  END IF;
  IF p_sha256 IS NOT NULL AND p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sha256_invalid';
  END IF;
  SELECT * INTO f FROM public.file_objects WHERE bucket = p_bucket AND storage_path = p_path;
  IF FOUND THEN
    -- A registration without a hash gets it when its uploader registers
    -- the same object again with one (review round 3,
    -- sign-image-requires-unsent-sha256); a stored hash is never
    -- overwritten, and nobody else's call changes the row.
    IF f.sha256 IS NULL AND p_sha256 IS NOT NULL AND f.uploaded_by = v_uid THEN
      UPDATE public.file_objects SET sha256 = p_sha256 WHERE id = f.id AND sha256 IS NULL RETURNING * INTO f;
      IF f.id IS NULL THEN
        SELECT * INTO f FROM public.file_objects WHERE bucket = p_bucket AND storage_path = p_path;
      END IF;
    END IF;
    RETURN f;
  END IF;

  SELECT ob.owner, ob.owner_id, ob.metadata INTO o FROM storage.objects AS ob WHERE ob.bucket_id = p_bucket AND ob.name = p_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'file_not_stored', DETAIL = 'Upload the file before registering it.';
  END IF;
  v_owner := coalesce(o.owner::text, o.owner_id);
  IF v_owner IS NOT NULL AND v_owner <> v_uid::text THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'file_access_denied', DETAIL = 'Only the person who uploaded a file registers it.';
  END IF;
  IF v_name = '' OR length(v_name) > 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'file_name_invalid';
  END IF;
  IF p_mime_type IS NULL OR p_mime_type NOT IN (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'file_type_not_allowed';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'file_empty';
  END IF;
  IF p_size_bytes > 52428800 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'file_too_large';
  END IF;
  IF o.metadata ? 'size' AND (o.metadata ->> 'size') IS DISTINCT FROM p_size_bytes::text THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'file_size_mismatch', DETAIL = 'The stored file has a different size.';
  END IF;
  IF o.metadata ? 'mimetype' AND (o.metadata ->> 'mimetype') IS DISTINCT FROM p_mime_type THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'file_type_mismatch', DETAIL = 'The stored file has a different type.';
  END IF;

  v_parts := string_to_array(p_path, '/');
  INSERT INTO public.file_objects (company_id, vessel_id, bucket, storage_path, module_key, entity_type, entity_id, original_name, mime_type, size_bytes, sha256, uploaded_by, source)
  VALUES (v_parts[1]::uuid, CASE WHEN v_parts[2] = 'fleet' THEN NULL ELSE v_parts[2]::uuid END, p_bucket, p_path, v_parts[3], v_parts[4], v_parts[5]::uuid,
          v_name, p_mime_type, p_size_bytes, p_sha256, v_uid, 'upload')
  ON CONFLICT (bucket, storage_path) DO NOTHING
  RETURNING * INTO f;
  IF f.id IS NULL THEN
    SELECT * INTO f FROM public.file_objects WHERE bucket = p_bucket AND storage_path = p_path;
  END IF;
  RETURN f;
END;
$$;

-- ---------------------------------------------------------------- attachments

-- attach_record_file: the file and the record are readable by the caller
-- and in the same company and vessel; a closed / void record takes no new
-- file (22023 record_closed) unless its kind allows late evidence;
-- version_of names a live attachment of the same record. Without a record
-- the attachment belongs to the file's entity. Event attachment.added.
-- Replaying the same file on the same record returns the live attachment.
CREATE OR REPLACE FUNCTION public.attach_record_file(
  p_file_id uuid,
  p_envelope_id uuid DEFAULT NULL,
  p_section_key text DEFAULT NULL,
  p_caption text DEFAULT NULL,
  p_version_of uuid DEFAULT NULL
)
RETURNS public.record_attachments
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  f public.file_objects;
  e public.record_envelopes;
  a public.record_attachments;
  v_late boolean := false;
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_party text;
  v_sort integer;
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT * INTO f FROM public.file_objects WHERE id = p_file_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'file_not_found';
  END IF;
  IF NOT public.record_readable(f.company_id, f.vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  IF p_envelope_id IS NOT NULL THEN
    SELECT * INTO e FROM public.record_envelopes WHERE id = p_envelope_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'record_not_found';
    END IF;
    IF NOT public.record_readable(e.company_id, e.vessel_id) OR e.company_id <> f.company_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
    END IF;
  END IF;
  IF public.record_impersonating() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'impersonating', DETAIL = 'Records cannot be changed while acting as another user.';
  END IF;
  IF f.removed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'file_removed';
  END IF;
  IF p_section_key IS NOT NULL AND p_section_key !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'section_key_invalid';
  END IF;
  IF v_caption IS NOT NULL AND length(v_caption) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'caption_too_long';
  END IF;

  IF p_envelope_id IS NOT NULL THEN
    IF e.vessel_id IS DISTINCT FROM f.vessel_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'file_scope_mismatch', DETAIL = 'The file was uploaded for another vessel.';
    END IF;
    SELECT * INTO a FROM public.record_attachments
    WHERE envelope_id = e.id AND file_id = f.id AND removed_at IS NULL AND section_key IS NOT DISTINCT FROM p_section_key;
    IF FOUND THEN
      RETURN a;
    END IF;
    SELECT k.allow_late_evidence INTO v_late FROM public.record_kinds AS k WHERE k.key = e.kind_key;
    IF e.status IN ('closed', 'void') AND NOT coalesce(v_late, false) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'record_closed', DETAIL = 'This record is closed; files can no longer be added.';
    END IF;
    IF p_version_of IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.record_attachments AS v WHERE v.id = p_version_of AND v.envelope_id = e.id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'version_of_invalid', DETAIL = 'A new version replaces a file of the same record.';
    END IF;
    SELECT coalesce(max(sort_order), 0) + 1 INTO v_sort FROM public.record_attachments WHERE envelope_id = e.id;
  ELSE
    SELECT * INTO a FROM public.record_attachments
    WHERE envelope_id IS NULL AND entity_type = f.entity_type AND entity_id = f.entity_id AND file_id = f.id
      AND removed_at IS NULL AND section_key IS NOT DISTINCT FROM p_section_key;
    IF FOUND THEN
      RETURN a;
    END IF;
    IF p_version_of IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.record_attachments AS v
      WHERE v.id = p_version_of AND v.envelope_id IS NULL AND v.entity_type = f.entity_type AND v.entity_id = f.entity_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'version_of_invalid', DETAIL = 'A new version replaces a file of the same record.';
    END IF;
    SELECT coalesce(max(sort_order), 0) + 1 INTO v_sort
    FROM public.record_attachments WHERE envelope_id IS NULL AND entity_type = f.entity_type AND entity_id = f.entity_id;
  END IF;

  INSERT INTO public.record_attachments (file_id, company_id, vessel_id, envelope_id, entity_type, entity_id, section_key, caption, version_of, sort_order, added_by)
  VALUES (f.id, f.company_id, f.vessel_id, p_envelope_id, f.entity_type, f.entity_id, p_section_key, v_caption, p_version_of, v_sort, v_uid)
  RETURNING * INTO a;

  v_party := CASE WHEN public.is_company_actor(v_uid, f.vessel_id) THEN 'company' ELSE 'vessel' END;
  IF p_envelope_id IS NOT NULL THEN
    PERFORM public.record_log_event(e.id, 'attachment.added', v_party,
      jsonb_strip_nulls(jsonb_build_object('attachment_id', a.id, 'file_id', f.id, 'section_key', p_section_key, 'version_of', p_version_of)));
  ELSE
    INSERT INTO public.record_events (company_id, vessel_id, module_key, entity_type, entity_id, action, party, actor_user_id, payload)
    VALUES (f.company_id, f.vessel_id, f.module_key, f.entity_type, f.entity_id, 'attachment.added', v_party, v_uid,
            jsonb_strip_nulls(jsonb_build_object('attachment_id', a.id, 'file_id', f.id, 'section_key', p_section_key, 'version_of', p_version_of)));
  END IF;
  RETURN a;
END;
$$;

-- remove_record_attachment: soft remove. Before the record is first
-- submitted (or with no record): the uploader, anyone who reaches the
-- vessel (fleet reach passes) or a company actor. Once submitted: only a
-- company actor, with a reason. A legal hold on the file or the record
-- refuses it. Removing an already removed attachment returns it unchanged.
-- Event attachment.removed.
CREATE OR REPLACE FUNCTION public.remove_record_attachment(p_attachment_id uuid, p_reason text DEFAULT NULL)
RETURNS public.record_attachments
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  a public.record_attachments;
  f public.file_objects;
  e public.record_envelopes;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_actor boolean;
  v_submitted boolean := false;
  v_module text;
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT * INTO a FROM public.record_attachments WHERE id = p_attachment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'attachment_not_found';
  END IF;
  IF NOT public.record_readable(a.company_id, a.vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  IF a.removed_at IS NOT NULL THEN
    RETURN a;
  END IF;
  IF public.record_impersonating() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'impersonating', DETAIL = 'Records cannot be changed while acting as another user.';
  END IF;
  SELECT * INTO f FROM public.file_objects WHERE id = a.file_id;
  IF a.envelope_id IS NOT NULL THEN
    SELECT * INTO e FROM public.record_envelopes WHERE id = a.envelope_id;
    v_submitted := e.submitted_at IS NOT NULL OR e.status IN ('submitted', 'acknowledged', 'awaiting_company_close', 'closed', 'void');
  END IF;
  IF coalesce(f.legal_hold, false) OR coalesce(e.legal_hold, false) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'legal_hold', DETAIL = 'This file is under legal hold.';
  END IF;
  v_actor := public.is_company_actor(v_uid, a.vessel_id);
  IF v_submitted THEN
    IF NOT v_actor THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'not_allowed', DETAIL = 'After submission only the company removes a file.';
    END IF;
    IF v_reason IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_required';
    END IF;
  ELSIF NOT (a.added_by = v_uid OR v_actor OR public.record_caller_reaches(v_uid, a.company_id, a.vessel_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'not_allowed';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'reason_too_long';
  END IF;

  UPDATE public.record_attachments SET removed_at = now(), removed_by = v_uid, removal_reason = v_reason
  WHERE id = a.id
  RETURNING * INTO a;

  IF a.envelope_id IS NOT NULL THEN
    PERFORM public.record_log_event(a.envelope_id, 'attachment.removed', CASE WHEN v_actor THEN 'company' ELSE 'vessel' END,
      jsonb_build_object('attachment_id', a.id, 'file_id', a.file_id), v_reason);
  ELSE
    v_module := coalesce(f.module_key, 'records');
    INSERT INTO public.record_events (company_id, vessel_id, module_key, entity_type, entity_id, action, party, actor_user_id, reason, payload)
    VALUES (a.company_id, a.vessel_id, v_module, a.entity_type, a.entity_id, 'attachment.removed', CASE WHEN v_actor THEN 'company' ELSE 'vessel' END,
            v_uid, v_reason, jsonb_build_object('attachment_id', a.id, 'file_id', a.file_id));
  END IF;
  RETURN a;
END;
$$;

-- ---------------------------------------------------------------- links (C8)

-- link_records: the from-record (and the to-record, when it is one) is
-- readable by the caller and in the same company (42501 otherwise); the
-- target is a record or an entity (type + id), never itself. A live link
-- with the same target and kind is returned as it is. Event link.added.
CREATE OR REPLACE FUNCTION public.link_records(
  p_from_envelope_id uuid,
  p_to_envelope_id uuid DEFAULT NULL,
  p_to_entity_type text DEFAULT NULL,
  p_to_entity_id uuid DEFAULT NULL,
  p_link_kind text DEFAULT 'related',
  p_note text DEFAULT NULL
)
RETURNS public.record_links
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  e public.record_envelopes;
  t public.record_envelopes;
  l public.record_links;
  v_kind text := coalesce(p_link_kind, 'related');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT * INTO e FROM public.record_envelopes WHERE id = p_from_envelope_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'record_not_found';
  END IF;
  IF NOT public.record_readable(e.company_id, e.vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  IF p_to_envelope_id IS NOT NULL THEN
    SELECT * INTO t FROM public.record_envelopes WHERE id = p_to_envelope_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'record_not_found';
    END IF;
    IF t.company_id <> e.company_id OR NOT public.record_readable(t.company_id, t.vessel_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
    END IF;
  END IF;
  IF public.record_impersonating() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'impersonating', DETAIL = 'Records cannot be changed while acting as another user.';
  END IF;
  IF (p_to_envelope_id IS NOT NULL) = (p_to_entity_type IS NOT NULL OR p_to_entity_id IS NOT NULL)
     OR (p_to_envelope_id IS NULL AND (p_to_entity_type IS NULL OR p_to_entity_id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'link_target_invalid', DETAIL = 'Link to one record, or to one item (type and id).';
  END IF;
  IF p_to_entity_type IS NOT NULL AND p_to_entity_type !~ '^[a-z][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'link_target_invalid';
  END IF;
  IF p_to_envelope_id = e.id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'link_to_self';
  END IF;
  IF v_kind NOT IN ('related', 'duplicate_of', 'follow_up', 'caused_by', 'parent') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'link_kind_invalid';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'note_too_long';
  END IF;

  SELECT * INTO l FROM public.record_links AS x
  WHERE x.from_envelope_id = e.id AND x.link_kind = v_kind AND x.removed_at IS NULL
    AND x.to_envelope_id IS NOT DISTINCT FROM p_to_envelope_id
    AND x.to_entity_type IS NOT DISTINCT FROM p_to_entity_type AND x.to_entity_id IS NOT DISTINCT FROM p_to_entity_id;
  IF FOUND THEN
    RETURN l;
  END IF;

  INSERT INTO public.record_links (company_id, vessel_id, from_envelope_id, to_envelope_id, to_entity_type, to_entity_id, link_kind, note, created_by)
  VALUES (e.company_id, e.vessel_id, e.id, p_to_envelope_id, p_to_entity_type, p_to_entity_id, v_kind, v_note, v_uid)
  RETURNING * INTO l;

  PERFORM public.record_log_event(e.id, 'link.added', CASE WHEN public.is_company_actor(v_uid, e.vessel_id) THEN 'company' ELSE 'vessel' END,
    jsonb_strip_nulls(jsonb_build_object('link_id', l.id, 'link_kind', v_kind, 'to_envelope_id', p_to_envelope_id,
      'to_entity_type', p_to_entity_type, 'to_entity_id', p_to_entity_id)));
  RETURN l;
END;
$$;

-- unlink_records: soft remove by the link's creator or a company actor;
-- an already removed link is returned unchanged. Event link.removed.
CREATE OR REPLACE FUNCTION public.unlink_records(p_link_id uuid)
RETURNS public.record_links
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  l public.record_links;
  v_actor boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.user_is_active(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  SELECT * INTO l FROM public.record_links WHERE id = p_link_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'link_not_found';
  END IF;
  IF NOT public.record_readable(l.company_id, l.vessel_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'record_access_denied';
  END IF;
  IF l.removed_at IS NOT NULL THEN
    RETURN l;
  END IF;
  IF public.record_impersonating() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'impersonating', DETAIL = 'Records cannot be changed while acting as another user.';
  END IF;
  v_actor := public.is_company_actor(v_uid, l.vessel_id);
  IF NOT (l.created_by = v_uid OR v_actor) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'not_allowed', DETAIL = 'Only the person who added a link, or the company, removes it.';
  END IF;
  UPDATE public.record_links SET removed_at = now(), removed_by = v_uid WHERE id = l.id RETURNING * INTO l;
  PERFORM public.record_log_event(l.from_envelope_id, 'link.removed', CASE WHEN v_actor THEN 'company' ELSE 'vessel' END,
    jsonb_build_object('link_id', l.id, 'link_kind', l.link_kind));
  RETURN l;
END;
$$;

-- ---------------------------------------------------------------- privileges (rule 5)

REVOKE ALL ON FUNCTION public.storage_path_allowed(text, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_links_scope() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.register_file_object(text, text, text, text, bigint, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.attach_record_file(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.remove_record_attachment(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.link_records(uuid, uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.unlink_records(uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.storage_path_allowed(text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_file_object(text, text, text, text, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attach_record_file(uuid, uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_record_attachment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_records(uuid, uuid, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_records(uuid) TO authenticated;

-- ---------------------------------------------------------------- comments

COMMENT ON TABLE public.file_objects IS 'One stored file of the private records bucket (gap/08 UP1-UP3; C7): its path <company>/<vessel|fleet>/<module>/<entity_type>/<entity_id>/<uuid>-<name>, type, size and hash. Read: record_readable (company + reach). No client writes: register_file_object only. Removed softly; legal hold blocks removal.';
COMMENT ON TABLE public.record_attachments IS 'A file attached to a record (envelope) or to an entity (gap/08 UP2): section, caption, versions, order. Read: record_readable. No client writes: attach_record_file / remove_record_attachment only (soft remove).';
COMMENT ON TABLE public.record_links IS 'Generic links between records, or from a record to an item (C8): related, duplicate_of, follow_up, caused_by, parent. company_id / vessel_id are stamped from the from-record by trg_record_links_scope (CC-12) and read through record_readable. No client writes: link_records / unlink_records only (soft remove).';
COMMENT ON FUNCTION public.storage_path_allowed(text, text, boolean) IS 'The C7 path rule of the records bucket for auth.uid(): six segments, an active member of the company, fleet reach for fleet paths, reach to the vessel otherwise. Unknown anything -> false.';
COMMENT ON FUNCTION public.record_links_scope() IS 'Trigger: a link''s company and vessel are its from-record''s (a client value is overwritten).';
COMMENT ON FUNCTION public.register_file_object(text, text, text, text, bigint, text) IS 'Registers an uploaded object of the records bucket (path allowed, object stored by the caller, size and type checked, a given sha256 64 lower-case hex). Idempotent on (bucket, path); the uploader registering again with a sha256 fills a missing hash (a stored hash is never overwritten). The hash is client-asserted.';
COMMENT ON FUNCTION public.attach_record_file(uuid, uuid, text, text, uuid) IS 'Attaches a registered file to a record (or its entity); refuses closed / void records unless the kind allows late evidence. Event attachment.added.';
COMMENT ON FUNCTION public.remove_record_attachment(uuid, text) IS 'Soft-removes an attachment: the uploader or a vessel member before submission, a company actor with a reason after; legal hold refuses. Event attachment.removed.';
COMMENT ON FUNCTION public.link_records(uuid, uuid, text, uuid, text, text) IS 'Links a record to another record of the same company (or to an item). Both readable by the caller. Event link.added.';
COMMENT ON FUNCTION public.unlink_records(uuid) IS 'Soft-removes a link (its creator or a company actor). Event link.removed.';

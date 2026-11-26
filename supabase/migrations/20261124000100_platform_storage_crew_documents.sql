-- =================================================================
-- PLATFORM PREP PP4: crew-document storage scoping (Phase 3 wave 1;
-- X1 PR-X1-F; gap/08 UP1; gap/04 C25; D-X1-18; platform-prep plan §3 PP4
-- item 2)
-- Storage: bucket 'documents' (private, 50 MB, the UP1 MIME allow-list);
--   storage.objects policies documents_bucket_select / _insert / _update /
--   _delete replace the four legacy policies of 20260125163105
-- Helpers: storage_object_company(), storage_crew_document_path(),
--   storage_crew_document_allowed()
-- TS mirror: src/lib/storage/crewDocuments.ts (uploadCrewDocumentFile,
--   buildCrewDocumentFilePath, CREW_DOCUMENT_MAX_BYTES,
--   CREW_DOCUMENT_MIME_TYPES); the MIME list equals
--   supabase/tests/fixtures/upload-policy.json (the records bucket's)
-- =================================================================
--
-- Why. The documents bucket was created by the Lovable copy 20260125163105
-- with four policies that let every member of a company read, overwrite
-- and delete every object under <company>/…, so a crew member's passport
-- or medical certificate would be open to the whole company. X1 stores crew
-- documents (keyed on profiles.id, since most crew have no login) under
--   <company_id>/crew/<profile_id>/documents/<uuid>-<safe name>
-- and that prefix is now readable only when X1's predicate
-- crew_document_file_readable(user, profile) answers true, and writable
-- (insert, update, delete) only when crew_document_file_writable(user,
-- profile) does. Both are X1-04's (block 06, frozen signatures). Until
-- they are in the database the prefix is closed to everyone but the
-- service role: storage_crew_document_allowed finds them through
-- to_regprocedure and denies when they are missing.
--
-- Every other prefix behaves as before: a signed-in member of the company
-- named by the first folder reads, uploads, updates and deletes. The
-- legacy policies read profiles inline as the caller, so after
-- 20261123010000 a disabled user already read no profile row and got
-- nothing; the new policies say the same through user_belongs_to_company
-- (active-aware), as the build-out rules require (rule 15: no inline
-- profiles subquery). The legacy policies had no role list (PUBLIC); anon
-- never matched (no auth.uid()), so TO authenticated changes nothing.
--
-- The prefix cannot collide with today's crew files. The legacy writer
-- (uploadCrewDocument, src/lib/storage/crewDocuments.ts) writes
-- <company>/crew/<user_id>/<kind>/… with kind one of certificates,
-- attachments, contracts, next-of-kin, evaluations, disciplinary,
-- payslips, right-to-work, recruitment, onboarding; never 'documents'.
-- The other writers to this bucket use <company>/<file>,
-- <company>/recruitment/… and form-templates/…. Any name whose second
-- segment is 'crew' and fourth 'documents' is treated as the prefix (fail
-- closed: a malformed one is denied, never left to the company rule).
--
-- Bucket limits. file_size_limit 25 MB -> 50 MB (gap/08 UP1; C25).
-- allowed_mime_types: the five legacy types (PDF, DOCX, XLSX, PNG, JPEG)
-- become the UP1 list (adds WebP, HEIC, HEIF, GIF, DOC, XLS). Every
-- uploader to this bucket picks from types on the list (crew attachments,
-- certificates, contracts, disciplinary, onboarding, right-to-work, CVs,
-- controlled documents, form templates, generated PDFs), so widening breaks
-- none of them; uploadCrewDocumentFile also checks size and type in the
-- browser with plain sentences. The bucket stays private (reads through
-- signed URLs).
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124000100_platform_storage_crew_documents needs Supabase Storage (storage.buckets, storage.objects)';
  END IF;
  IF to_regprocedure('public.user_is_active(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124000100_platform_storage_crew_documents needs user_is_active(): apply 20261123000300_platform_account_memberships.sql first';
  END IF;
  IF to_regprocedure('public.user_belongs_to_company(uuid,uuid)') IS NULL
     OR position('user_is_active' IN pg_get_functiondef('public.user_belongs_to_company(uuid,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124000100_platform_storage_crew_documents needs the active-aware user_belongs_to_company(): apply 20261123010000_platform_user_status.sql first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- the documents bucket (MIME list = upload-policy.json)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 52428800, ARRAY[
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

-- ---------------------------------------------------------------- path helpers (pure)

-- The company an object name belongs to: its first folder when that is a
-- canonical lower-case uuid (the legacy rule compared it with
-- company_id::text, which is exactly that), else NULL. Pure.
CREATE OR REPLACE FUNCTION public.storage_object_company(p_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_first text := split_part(coalesce(p_name, ''), '/', 1);
BEGIN
  IF position('/' IN coalesce(p_name, '')) = 0
     OR v_first !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN v_first::uuid;
END;
$$;

-- True for any name under the crew-documents prefix: second segment
-- 'crew' and fourth 'documents' (<company>/crew/<profile>/documents/…),
-- whatever the rest looks like. Pure.
CREATE OR REPLACE FUNCTION public.storage_crew_document_path(p_name text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN split_part(coalesce(p_name, ''), '/', 2) = 'crew' AND split_part(coalesce(p_name, ''), '/', 4) = 'documents';
END;
$$;

-- ---------------------------------------------------------------- the crew-document gate

-- Read (p_for_write false) or write (true) access to one object under
-- <company_id>/crew/<profile_id>/documents/<uuid>-<safe name>, for
-- auth.uid(): exactly five segments, canonical lower-case uuids, the file
-- segment <uuid>-<name> with the UP1 safe-name rule, no '..'; the caller
-- an active member of the company; the profile a profile of that company;
-- then X1's predicate (crew_document_file_readable or
-- crew_document_file_writable, (user uuid, profile uuid) -> boolean),
-- called only when to_regprocedure finds that exact signature. No caller,
-- a malformed name, a foreign company or profile, a missing predicate or a
-- NULL answer -> false (fail closed).
CREATE OR REPLACE FUNCTION public.storage_crew_document_allowed(p_name text, p_for_write boolean)
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
  v_file constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9][A-Za-z0-9._-]{0,199}$';
  v_company uuid;
  v_profile uuid;
  v_allowed boolean;
BEGIN
  IF v_uid IS NULL OR p_name IS NULL OR p_for_write IS NULL OR length(p_name) > 512 OR position('..' IN p_name) > 0 THEN
    RETURN false;
  END IF;
  v_parts := string_to_array(p_name, '/');
  IF coalesce(array_length(v_parts, 1), 0) <> 5
     OR v_parts[1] !~ v_uuid
     OR v_parts[2] <> 'crew'
     OR v_parts[3] !~ v_uuid
     OR v_parts[4] <> 'documents'
     OR v_parts[5] !~ v_file THEN
    RETURN false;
  END IF;
  v_company := v_parts[1]::uuid;
  v_profile := v_parts[3]::uuid;
  IF NOT public.user_is_active(v_uid) OR NOT public.user_belongs_to_company(v_uid, v_company) THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = v_profile AND p.company_id = v_company) THEN
    RETURN false;
  END IF;
  IF p_for_write THEN
    IF to_regprocedure('public.crew_document_file_writable(uuid,uuid)') IS NULL THEN
      RETURN false;
    END IF;
    EXECUTE 'SELECT public.crew_document_file_writable($1, $2)' INTO v_allowed USING v_uid, v_profile;
  ELSE
    IF to_regprocedure('public.crew_document_file_readable(uuid,uuid)') IS NULL THEN
      RETURN false;
    END IF;
    EXECUTE 'SELECT public.crew_document_file_readable($1, $2)' INTO v_allowed USING v_uid, v_profile;
  END IF;
  RETURN coalesce(v_allowed, false);
END;
$$;

-- ---------------------------------------------------------------- storage policies of the documents bucket

-- The legacy four (20260125163105; their names on public.documents are other policies and stay).
DROP POLICY IF EXISTS "Users can view documents in their company" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload documents to their company" ON storage.objects;
DROP POLICY IF EXISTS "Users can update documents in their company" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete documents in their company" ON storage.objects;

-- An active member of the company named by the first folder; under the
-- crew-documents prefix also X1's predicate (through the gate).
DROP POLICY IF EXISTS documents_bucket_select ON storage.objects;
CREATE POLICY documents_bucket_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.user_belongs_to_company((SELECT auth.uid()), public.storage_object_company(name))
    AND (NOT public.storage_crew_document_path(name) OR public.storage_crew_document_allowed(name, false))
  );

DROP POLICY IF EXISTS documents_bucket_insert ON storage.objects;
CREATE POLICY documents_bucket_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND public.user_belongs_to_company((SELECT auth.uid()), public.storage_object_company(name))
    AND (NOT public.storage_crew_document_path(name) OR public.storage_crew_document_allowed(name, true))
  );

DROP POLICY IF EXISTS documents_bucket_update ON storage.objects;
CREATE POLICY documents_bucket_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.user_belongs_to_company((SELECT auth.uid()), public.storage_object_company(name))
    AND (NOT public.storage_crew_document_path(name) OR public.storage_crew_document_allowed(name, true))
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND public.user_belongs_to_company((SELECT auth.uid()), public.storage_object_company(name))
    AND (NOT public.storage_crew_document_path(name) OR public.storage_crew_document_allowed(name, true))
  );

DROP POLICY IF EXISTS documents_bucket_delete ON storage.objects;
CREATE POLICY documents_bucket_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.user_belongs_to_company((SELECT auth.uid()), public.storage_object_company(name))
    AND (NOT public.storage_crew_document_path(name) OR public.storage_crew_document_allowed(name, true))
  );

-- ---------------------------------------------------------------- privileges (rule 5)

-- The policies run as the caller, so authenticated executes the three
-- helpers (the two pure ones reveal nothing; the gate answers only for
-- auth.uid()). The service role bypasses RLS and may call them to check a path.
REVOKE ALL ON FUNCTION public.storage_object_company(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.storage_crew_document_path(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.storage_crew_document_allowed(text, boolean) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.storage_object_company(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_crew_document_path(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_crew_document_allowed(text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.storage_object_company(text) IS 'The company of a storage object name: its first folder when that is a canonical lower-case uuid, else NULL (the documents-bucket company rule; pure).';
COMMENT ON FUNCTION public.storage_crew_document_path(text) IS 'True for a documents-bucket name under the crew-documents prefix <company>/crew/<profile>/documents/ (second segment crew, fourth documents; malformed names included, so they are denied by the gate, never left to the company rule). Pure.';
COMMENT ON FUNCTION public.storage_crew_document_allowed(text, boolean) IS 'The crew-document gate of the documents bucket (PR-X1-F, D-X1-18) for auth.uid(): <company>/crew/<profile_id>/documents/<uuid>-<safe name>, an active member of the company, the profile in that company, then X1''s crew_document_file_readable (read) or crew_document_file_writable (insert, update, delete) when to_regprocedure finds it; missing predicate or anything unknown -> false.';

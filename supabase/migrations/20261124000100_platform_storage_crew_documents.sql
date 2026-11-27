-- =================================================================
-- PLATFORM PREP PP4: crew-document storage scoping (Phase 3 wave 1;
-- X1 PR-X1-F; gap/08 UP1; gap/04 C25; D-X1-18; platform-prep plan §3 PP4
-- item 2)
-- Storage: bucket 'documents' (private, 50 MB, the UP1 MIME allow-list);
--   storage.objects policies documents_bucket_select / _insert / _update /
--   _delete replace the four legacy policies of 20260125163105
-- Helpers: storage_object_company(), storage_crew_document_path(),
--   storage_crew_document_allowed(text, text) (action-aware; the
--   (text, boolean) form of the first version is dropped, D-373)
-- TS mirror: src/lib/storage/crewDocuments.ts (uploadCrewDocumentFile,
--   buildCrewDocumentFilePath, CREW_DOCUMENT_MAX_BYTES,
--   CREW_DOCUMENT_MIME_TYPES); the MIME list equals
--   supabase/tests/fixtures/upload-policy.json (the records bucket's)
-- =================================================================
--
-- Why. The documents bucket was created by the Lovable copy 20260125163105
-- with four policies that let every member of a company read, overwrite
-- and delete every object under <company>/…, so a crew member's passport,
-- payslip or disciplinary file was open to the whole company. Everything
-- under <company>/crew/ is personal data (D-373, amending D-322): the
-- company rule covers only the other prefixes, and every crew/ name goes
-- through the action-aware gate storage_crew_document_allowed(name,
-- action), action one of read, insert, update, delete.
--
-- Crew paths. Two writers use the crew/ prefix:
--   <company_id>/crew/<profile_id>/documents/<uuid>-<safe name>   (X1)
--   <company_id>/crew/<user_id or profile_id>/<kind>/<file>       (legacy
--     uploadCrewDocument: kind one of certificates, attachments,
--     contracts, next-of-kin, evaluations, disciplinary, payslips,
--     right-to-work, recruitment, onboarding; usePayroll writes
--     crew_user_id ?? profile_id, so segment 3 is a login id or a profile id)
-- The gate checks the shape (exactly five segments, canonical lower-case
-- uuids in segments 1 and 3, a safe file name, no '..'), that the caller is
-- active and a member of that company, and resolves the subject as the
-- profile of that company whose id or login id is segment 3 (none -> deny).
-- Then, by kind (D-373):
--   documents, certificates, attachments   X1's crew_document_file_readable
--     (read) / crew_document_file_writable (insert, update, delete) for the
--     subject's profile, found through to_regprocedure (missing -> deny):
--     the subject, the vessel's document readers and editors, HR;
--   contracts, payslips, disciplinary, evaluations   read: the subject or
--     an HR viewer (hr_can_view); write: an HR editor (hr_can_edit). Payslips
--     also the payroll readers / editors (payroll_can_view / _edit, whose
--     page writes them); evaluations also the reviewer of one of the
--     subject's reviews (the performance_reviews write rule:
--     reviewer_profile_id = my_profile_id()). The subject never replaces or
--     deletes these;
--   right-to-work, next-of-kin, onboarding   read: the subject or an HR
--     viewer; insert: an HR editor or the subject (a new object only:
--     crew upload their own evidence); update, delete: an HR editor;
--   recruitment   read: an HR viewer; write: an HR editor;
--   anything else   denied (fail closed).
-- Without a JWT nothing matches; the service role bypasses RLS.
--
-- Every other prefix behaves as before: a signed-in member of the company
-- named by the first folder reads, uploads, updates and deletes. The
-- legacy policies read profiles inline as the caller, so after
-- 20261123010000 a disabled user already read no profile row and got
-- nothing; the new policies say the same through user_belongs_to_company
-- (active-aware), as the build-out rules require (rule 15: no inline
-- profiles subquery). The legacy policies had no role list (PUBLIC); anon
-- never matched (no auth.uid()), so TO authenticated changes nothing. The
-- other writers to this bucket use <company>/<file>,
-- <company>/recruitment/… and form-templates/….

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

-- True for any name whose second segment is 'crew' (<company>/crew/…):
-- the personal-data prefix the gate decides, whatever the rest looks like
-- (a malformed name included, so it is denied, never left to the company
-- rule; D-373). The function keeps its first name. Pure.
CREATE OR REPLACE FUNCTION public.storage_crew_document_path(p_name text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN split_part(coalesce(p_name, ''), '/', 2) = 'crew';
END;
$$;

-- ---------------------------------------------------------------- the crew-files gate

-- Access of auth.uid() to one object under <company>/crew/, for p_action
-- read, insert, update or delete (the rules by kind are in the header,
-- D-373). Shape: exactly five segments, canonical lower-case uuids in
-- segments 1 and 3, no '..'; the X1 file segment <uuid>-<safe name> under
-- documents/, a safe name elsewhere. The caller active and a member of the
-- company; the subject the profile of that company whose id or login id is
-- segment 3. X1's predicates (crew_document_file_readable /
-- crew_document_file_writable, (user uuid, profile uuid) -> boolean) are
-- called only when to_regprocedure finds that exact signature. No caller,
-- an unknown action or kind, a malformed name, a foreign company or
-- subject, a missing predicate or a NULL answer -> false (fail closed).
-- The first version's (text, boolean) form is dropped below, before the
-- policies are recreated.
DROP POLICY IF EXISTS documents_bucket_select ON storage.objects;
DROP POLICY IF EXISTS documents_bucket_insert ON storage.objects;
DROP POLICY IF EXISTS documents_bucket_update ON storage.objects;
DROP POLICY IF EXISTS documents_bucket_delete ON storage.objects;
DROP FUNCTION IF EXISTS public.storage_crew_document_allowed(text, boolean);

CREATE OR REPLACE FUNCTION public.storage_crew_document_allowed(p_name text, p_action text)
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
  v_x1_file constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9][A-Za-z0-9._-]{0,199}$';
  v_file constant text := '^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$';
  v_company uuid;
  v_kind text;
  v_profile uuid;
  v_subject_user uuid;
  v_read boolean := p_action = 'read';
  v_allowed boolean;
BEGIN
  IF v_uid IS NULL OR p_name IS NULL OR p_action IS NULL OR p_action NOT IN ('read', 'insert', 'update', 'delete')
     OR length(p_name) > 512 OR position('..' IN p_name) > 0 THEN
    RETURN false;
  END IF;
  v_parts := string_to_array(p_name, '/');
  IF coalesce(array_length(v_parts, 1), 0) <> 5
     OR v_parts[1] !~ v_uuid
     OR v_parts[2] <> 'crew'
     OR v_parts[3] !~ v_uuid
     OR (v_parts[4] = 'documents' AND v_parts[5] !~ v_x1_file)
     OR (v_parts[4] IS DISTINCT FROM 'documents' AND v_parts[5] !~ v_file) THEN
    RETURN false;
  END IF;
  v_company := v_parts[1]::uuid;
  v_kind := v_parts[4];
  IF NOT coalesce(public.user_is_active(v_uid), false) OR NOT coalesce(public.user_belongs_to_company(v_uid, v_company), false) THEN
    RETURN false;
  END IF;
  SELECT p.id, p.user_id INTO v_profile, v_subject_user
  FROM public.profiles AS p
  WHERE p.company_id = v_company AND (p.id = v_parts[3]::uuid OR p.user_id = v_parts[3]::uuid)
  ORDER BY (p.id = v_parts[3]::uuid) DESC
  LIMIT 1;
  IF v_profile IS NULL THEN
    RETURN false;
  END IF;

  IF v_kind IN ('documents', 'certificates', 'attachments') THEN
    IF v_read THEN
      IF to_regprocedure('public.crew_document_file_readable(uuid,uuid)') IS NULL THEN
        RETURN false;
      END IF;
      EXECUTE 'SELECT public.crew_document_file_readable($1, $2)' INTO v_allowed USING v_uid, v_profile;
    ELSE
      IF to_regprocedure('public.crew_document_file_writable(uuid,uuid)') IS NULL THEN
        RETURN false;
      END IF;
      EXECUTE 'SELECT public.crew_document_file_writable($1, $2)' INTO v_allowed USING v_uid, v_profile;
    END IF;
    RETURN coalesce(v_allowed, false);
  END IF;

  IF v_kind IN ('contracts', 'payslips', 'disciplinary', 'evaluations') THEN
    IF v_read THEN
      RETURN (v_subject_user IS NOT NULL AND v_subject_user = v_uid)
          OR coalesce(public.hr_can_view(v_uid), false)
          OR (v_kind = 'payslips' AND coalesce(public.payroll_can_view(v_uid), false))
          OR (v_kind = 'evaluations' AND EXISTS (
                SELECT 1 FROM public.performance_reviews AS r
                WHERE r.profile_id = v_profile AND r.company_id = v_company AND r.reviewer_profile_id = public.my_profile_id()));
    END IF;
    RETURN coalesce(public.hr_can_edit(v_uid), false)
        OR (v_kind = 'payslips' AND coalesce(public.payroll_can_edit(v_uid), false))
        OR (v_kind = 'evaluations' AND EXISTS (
              SELECT 1 FROM public.performance_reviews AS r
              WHERE r.profile_id = v_profile AND r.company_id = v_company AND r.reviewer_profile_id = public.my_profile_id()));
  END IF;

  IF v_kind IN ('right-to-work', 'next-of-kin', 'onboarding') THEN
    IF v_read THEN
      RETURN (v_subject_user IS NOT NULL AND v_subject_user = v_uid) OR coalesce(public.hr_can_view(v_uid), false);
    END IF;
    RETURN coalesce(public.hr_can_edit(v_uid), false)
        OR (p_action = 'insert' AND v_subject_user IS NOT NULL AND v_subject_user = v_uid);
  END IF;

  IF v_kind = 'recruitment' THEN
    RETURN CASE WHEN v_read THEN coalesce(public.hr_can_view(v_uid), false) ELSE coalesce(public.hr_can_edit(v_uid), false) END;
  END IF;

  RETURN false;
END;
$$;

-- ---------------------------------------------------------------- storage policies of the documents bucket

-- The legacy four (20260125163105; their names on public.documents are other policies and stay).
DROP POLICY IF EXISTS "Users can view documents in their company" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload documents to their company" ON storage.objects;
DROP POLICY IF EXISTS "Users can update documents in their company" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete documents in their company" ON storage.objects;

-- An active member of the company named by the first folder; under
-- <company>/crew/ also the gate, per action (D-373). UPDATE asks the gate
-- for the old name (USING) and the new one (WITH CHECK).
DROP POLICY IF EXISTS documents_bucket_select ON storage.objects;
CREATE POLICY documents_bucket_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.user_belongs_to_company((SELECT auth.uid()), public.storage_object_company(name))
    AND (split_part(name, '/', 2) <> 'crew' OR public.storage_crew_document_allowed(name, 'read'))
  );

DROP POLICY IF EXISTS documents_bucket_insert ON storage.objects;
CREATE POLICY documents_bucket_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND public.user_belongs_to_company((SELECT auth.uid()), public.storage_object_company(name))
    AND (split_part(name, '/', 2) <> 'crew' OR public.storage_crew_document_allowed(name, 'insert'))
  );

DROP POLICY IF EXISTS documents_bucket_update ON storage.objects;
CREATE POLICY documents_bucket_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.user_belongs_to_company((SELECT auth.uid()), public.storage_object_company(name))
    AND (split_part(name, '/', 2) <> 'crew' OR public.storage_crew_document_allowed(name, 'update'))
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND public.user_belongs_to_company((SELECT auth.uid()), public.storage_object_company(name))
    AND (split_part(name, '/', 2) <> 'crew' OR public.storage_crew_document_allowed(name, 'update'))
  );

DROP POLICY IF EXISTS documents_bucket_delete ON storage.objects;
CREATE POLICY documents_bucket_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.user_belongs_to_company((SELECT auth.uid()), public.storage_object_company(name))
    AND (split_part(name, '/', 2) <> 'crew' OR public.storage_crew_document_allowed(name, 'delete'))
  );

-- ---------------------------------------------------------------- privileges (rule 5)

-- The policies run as the caller, so authenticated must execute the three
-- helpers (a storage policy cannot call a function its caller may not
-- execute): the two pure ones reveal nothing, and the gate answers only for
-- auth.uid() (it is no browser RPC; nothing in the client calls it). anon
-- and PUBLIC execute none. The service role bypasses RLS and may call them
-- to check a path.
REVOKE ALL ON FUNCTION public.storage_object_company(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.storage_crew_document_path(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.storage_crew_document_allowed(text, text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.storage_object_company(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_crew_document_path(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_crew_document_allowed(text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------- comments

COMMENT ON FUNCTION public.storage_object_company(text) IS 'The company of a storage object name: its first folder when that is a canonical lower-case uuid, else NULL (the documents-bucket company rule; pure).';
COMMENT ON FUNCTION public.storage_crew_document_path(text) IS 'True for a documents-bucket name whose second segment is crew (<company>/crew/…): the personal-data prefix the gate decides, malformed names included, so they are denied, never left to the company rule (D-373). Pure.';
COMMENT ON FUNCTION public.storage_crew_document_allowed(text, text) IS 'The crew-files gate of the documents bucket (D-373, amending D-322) for auth.uid() and an action (read, insert, update, delete): <company>/crew/<profile or login id>/<kind>/<file>, five segments, no ..; an active member of the company; the subject the profile of that company with that id or login id. documents, certificates, attachments: X1''s crew_document_file_readable / _writable when to_regprocedure finds them; contracts, payslips, disciplinary, evaluations: read the subject or HR viewers (payslips also payroll viewers, evaluations also the subject''s reviewers), write HR editors (payslips also payroll editors, evaluations also the reviewers); right-to-work, next-of-kin, onboarding: read the subject or HR viewers, insert HR editors or the subject, update / delete HR editors; recruitment: HR; anything else, a missing predicate or an unknown id -> false.';

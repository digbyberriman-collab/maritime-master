-- =================================================================
-- incident-attachments / crew-travel-documents: file limits + real
-- tenant scoping; equipment_categories / ports: close anon access
-- =================================================================
-- incident-attachments was created with no file_size_limit/
-- allowed_mime_types and a policy scoped only to
-- `auth.role() = 'authenticated'` -- no company check at all, unlike
-- every sibling bucket (documents, legal-attachments, crew-travel-
-- documents since its June fix). The upload paths never carried a
-- company prefix either, so there was nothing to scope against; the
-- client now writes `${company_id}/incidents/...` and
-- `${company_id}/capa-evidence/...` (see useIncidents.ts,
-- useCorrectiveActions.ts), so this migration can finally enforce
-- the same (storage.foldername(name))[1] = company_id pattern used
-- elsewhere.
--
-- crew-travel-documents already has correct company-scoped RLS (per
-- the June 2026 fix); it was only ever missing file_size_limit/
-- allowed_mime_types, added here.
--
-- equipment_categories and ports are legitimate shared reference
-- data (not tenant-specific), so unlike the buckets above they don't
-- get company scoping -- they get the same `TO authenticated` fix
-- already applied to their siblings drill_types/training_courses in
-- 20260610104821, closing the anonymous-read gap those two were
-- missed by.
-- =================================================================

-- ---------------------------------------------------------------
-- 1. incident-attachments: file limits + company-scoped policies
-- ---------------------------------------------------------------
UPDATE storage.buckets
SET file_size_limit = 26214400, -- 25MB, matching the documents bucket
    allowed_mime_types = ARRAY[
      'image/png', 'image/jpeg', 'image/webp', 'image/heic',
      'application/pdf',
      'video/mp4', 'video/quicktime'
    ]
WHERE id = 'incident-attachments';

DROP POLICY IF EXISTS "Users can view incident attachments in their company" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload incident attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their incident attachments" ON storage.objects;

CREATE POLICY "Incident attachments: company members can view"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'incident-attachments'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

CREATE POLICY "Incident attachments: company members can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'incident-attachments'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

CREATE POLICY "Incident attachments: company members can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'incident-attachments'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

-- ---------------------------------------------------------------
-- 2. crew-travel-documents: file limits only (RLS already correct)
-- ---------------------------------------------------------------
UPDATE storage.buckets
SET file_size_limit = 26214400,
    allowed_mime_types = ARRAY[
      'image/png', 'image/jpeg', 'image/webp',
      'application/pdf'
    ]
WHERE id = 'crew-travel-documents';

-- ---------------------------------------------------------------
-- 3. equipment_categories / ports: close anonymous access
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view equipment categories" ON public.equipment_categories;
CREATE POLICY "Authenticated users can view equipment categories"
  ON public.equipment_categories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ports_select" ON public.ports;
CREATE POLICY "ports_select" ON public.ports
  FOR SELECT TO authenticated USING (true);

-- Verification (run after applying):
--   SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets
--   WHERE id IN ('incident-attachments','crew-travel-documents');
--   SELECT tablename, policyname, roles FROM pg_policies
--   WHERE tablename IN ('equipment_categories','ports') AND 'anon' = ANY(roles);
--   -- must return no rows for the second query.

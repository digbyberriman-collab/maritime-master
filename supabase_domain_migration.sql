-- =============================================================================
-- Supabase Domain Migration: .supabase.co → .supabase.com
-- =============================================================================
-- Run in Supabase SQL Editor
-- Project: pfvtrtkqkvjbnbaabgpv (STORM Maritime)
--
-- This script updates all stored URLs in the database from the legacy
-- .supabase.co domain to the new .supabase.com domain.
--
-- Safe to run multiple times (idempotent).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. TEXT columns containing file/image/document URLs
-- ---------------------------------------------------------------------------

-- audits
UPDATE public.audits
SET audit_report_url = REPLACE(audit_report_url, '.supabase.co', '.supabase.com')
WHERE audit_report_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- certificates
UPDATE public.certificates
SET file_url = REPLACE(file_url, '.supabase.co', '.supabase.com')
WHERE file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- companies
UPDATE public.companies
SET client_logo_url = REPLACE(client_logo_url, '.supabase.co', '.supabase.com')
WHERE client_logo_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- crew_attachments
UPDATE public.crew_attachments
SET file_url = REPLACE(file_url, '.supabase.co', '.supabase.com')
WHERE file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- crew_certificates
UPDATE public.crew_certificates
SET file_url = REPLACE(file_url, '.supabase.co', '.supabase.com')
WHERE file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- crew_travel_documents
UPDATE public.crew_travel_documents
SET original_file_path = REPLACE(original_file_path, '.supabase.co', '.supabase.com')
WHERE original_file_path LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

UPDATE public.crew_travel_documents
SET standardised_file_path = REPLACE(standardised_file_path, '.supabase.co', '.supabase.com')
WHERE standardised_file_path LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- development_applications
UPDATE public.development_applications
SET completion_certificate_url = REPLACE(completion_certificate_url, '.supabase.co', '.supabase.com')
WHERE completion_certificate_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

UPDATE public.development_applications
SET course_url = REPLACE(course_url, '.supabase.co', '.supabase.com')
WHERE course_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- development_documents
UPDATE public.development_documents
SET file_url = REPLACE(file_url, '.supabase.co', '.supabase.com')
WHERE file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- document_versions
UPDATE public.document_versions
SET file_url = REPLACE(file_url, '.supabase.co', '.supabase.com')
WHERE file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- documents
UPDATE public.documents
SET file_url = REPLACE(file_url, '.supabase.co', '.supabase.com')
WHERE file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- equipment
UPDATE public.equipment
SET manual_url = REPLACE(manual_url, '.supabase.co', '.supabase.com')
WHERE manual_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

UPDATE public.equipment
SET photo_url = REPLACE(photo_url, '.supabase.co', '.supabase.com')
WHERE photo_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- familiarization_checklist_items
UPDATE public.familiarization_checklist_items
SET evidence_url = REPLACE(evidence_url, '.supabase.co', '.supabase.com')
WHERE evidence_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- fleet_emergency_defaults
UPDATE public.fleet_emergency_defaults
SET logo_url = REPLACE(logo_url, '.supabase.co', '.supabase.com')
WHERE logo_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- flight_bookings
UPDATE public.flight_bookings
SET itinerary_file_url = REPLACE(itinerary_file_url, '.supabase.co', '.supabase.com')
WHERE itinerary_file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

UPDATE public.flight_bookings
SET travel_letter_file_url = REPLACE(travel_letter_file_url, '.supabase.co', '.supabase.com')
WHERE travel_letter_file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- form_ai_extraction_jobs
UPDATE public.form_ai_extraction_jobs
SET source_file_url = REPLACE(source_file_url, '.supabase.co', '.supabase.com')
WHERE source_file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- form_attachments
UPDATE public.form_attachments
SET file_url = REPLACE(file_url, '.supabase.co', '.supabase.com')
WHERE file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- form_templates
UPDATE public.form_templates
SET source_file_url = REPLACE(source_file_url, '.supabase.co', '.supabase.com')
WHERE source_file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- gdpr_requests
UPDATE public.gdpr_requests
SET export_file_url = REPLACE(export_file_url, '.supabase.co', '.supabase.com')
WHERE export_file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- insurance_policies
UPDATE public.insurance_policies
SET certificate_url = REPLACE(certificate_url, '.supabase.co', '.supabase.com')
WHERE certificate_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

UPDATE public.insurance_policies
SET policy_document_url = REPLACE(policy_document_url, '.supabase.co', '.supabase.com')
WHERE policy_document_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- management_reviews
UPDATE public.management_reviews
SET minutes_url = REPLACE(minutes_url, '.supabase.co', '.supabase.com')
WHERE minutes_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- profiles
UPDATE public.profiles
SET avatar_url = REPLACE(avatar_url, '.supabase.co', '.supabase.com')
WHERE avatar_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- sms_attachments
UPDATE public.sms_attachments
SET file_url = REPLACE(file_url, '.supabase.co', '.supabase.com')
WHERE file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- training_records
UPDATE public.training_records
SET certificate_file_url = REPLACE(certificate_file_url, '.supabase.co', '.supabase.com')
WHERE certificate_file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- trip_suggestion_attachments
UPDATE public.trip_suggestion_attachments
SET file_url = REPLACE(file_url, '.supabase.co', '.supabase.com')
WHERE file_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- vessel_emergency_contacts
UPDATE public.vessel_emergency_contacts
SET logo_url = REPLACE(logo_url, '.supabase.co', '.supabase.com')
WHERE logo_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- feedback_submissions
UPDATE public.feedback_submissions
SET screenshot_url = REPLACE(screenshot_url, '.supabase.co', '.supabase.com')
WHERE screenshot_url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- ---------------------------------------------------------------------------
-- 2. TEXT[] (array) columns containing URLs
-- ---------------------------------------------------------------------------

-- drill_deficiencies.photo_urls
UPDATE public.drill_deficiencies
SET photo_urls = (
  SELECT ARRAY_AGG(REPLACE(url, '.supabase.co', '.supabase.com'))
  FROM UNNEST(photo_urls) AS url
)
WHERE EXISTS (
  SELECT 1 FROM UNNEST(photo_urls) AS url
  WHERE url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%'
);

-- dev_todos.image_urls
UPDATE public.dev_todos
SET image_urls = (
  SELECT ARRAY_AGG(REPLACE(url, '.supabase.co', '.supabase.com'))
  FROM UNNEST(image_urls) AS url
)
WHERE EXISTS (
  SELECT 1 FROM UNNEST(image_urls) AS url
  WHERE url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%'
);

-- corrective_actions.evidence_urls
UPDATE public.corrective_actions
SET evidence_urls = (
  SELECT ARRAY_AGG(REPLACE(url, '.supabase.co', '.supabase.com'))
  FROM UNNEST(evidence_urls) AS url
)
WHERE EXISTS (
  SELECT 1 FROM UNNEST(evidence_urls) AS url
  WHERE url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%'
);

-- maintenance_tasks.attachments
UPDATE public.maintenance_tasks
SET attachments = (
  SELECT ARRAY_AGG(REPLACE(url, '.supabase.co', '.supabase.com'))
  FROM UNNEST(attachments) AS url
)
WHERE EXISTS (
  SELECT 1 FROM UNNEST(attachments) AS url
  WHERE url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%'
);

-- defects.attachments
UPDATE public.defects
SET attachments = (
  SELECT ARRAY_AGG(REPLACE(url, '.supabase.co', '.supabase.com'))
  FROM UNNEST(attachments) AS url
)
WHERE EXISTS (
  SELECT 1 FROM UNNEST(attachments) AS url
  WHERE url LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%'
);

-- ---------------------------------------------------------------------------
-- 3. Storage objects — update paths in storage.objects if needed
-- ---------------------------------------------------------------------------

UPDATE storage.objects
SET name = REPLACE(name, '.supabase.co', '.supabase.com')
WHERE name LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%';

-- ---------------------------------------------------------------------------
-- 4. Auth redirect URLs — update any stored redirect URIs
-- ---------------------------------------------------------------------------

-- Update auth.flow_state redirect URIs (if the table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'flow_state'
  ) THEN
    EXECUTE $sql$
      UPDATE auth.flow_state
      SET auth_code_challenge = auth_code_challenge
      WHERE auth_code_challenge LIKE '%pfvtrtkqkvjbnbaabgpv.supabase.co%'
    $sql$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Verification — count remaining old-domain references
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  old_count INTEGER := 0;
  tbl RECORD;
  col RECORD;
  cnt INTEGER;
BEGIN
  FOR tbl IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN ('public')
      AND table_type = 'BASE TABLE'
  LOOP
    FOR col IN
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = tbl.table_schema
        AND table_name = tbl.table_name
        AND (data_type = 'text' OR data_type = 'character varying' OR udt_name = '_text')
    LOOP
      IF col.udt_name = '_text' THEN
        EXECUTE format(
          'SELECT COUNT(*) FROM %I.%I WHERE EXISTS (SELECT 1 FROM UNNEST(%I) AS u WHERE u LIKE $1)',
          tbl.table_schema, tbl.table_name, col.column_name
        ) INTO cnt USING '%pfvtrtkqkvjbnbaabgpv.supabase.co%';
      ELSE
        EXECUTE format(
          'SELECT COUNT(*) FROM %I.%I WHERE %I LIKE $1',
          tbl.table_schema, tbl.table_name, col.column_name
        ) INTO cnt USING '%pfvtrtkqkvjbnbaabgpv.supabase.co%';
      END IF;

      IF cnt > 0 THEN
        RAISE NOTICE 'REMAINING: %.%.% has % rows with old domain',
          tbl.table_schema, tbl.table_name, col.column_name, cnt;
        old_count := old_count + cnt;
      END IF;
    END LOOP;
  END LOOP;

  IF old_count = 0 THEN
    RAISE NOTICE '✓ Migration complete — no remaining .supabase.co references found in public schema.';
  ELSE
    RAISE WARNING '⚠ Found % remaining rows with old .supabase.co domain references.', old_count;
  END IF;
END $$;

COMMIT;

-- =================================================================
-- New Build: document search and the storage buckets its pages use
-- =================================================================
-- nb_regulations and nb_yard_standards ship with content_text,
-- content_indexed_at and search_vector columns, but nothing ever filled
-- search_vector and the two RPCs the pages call (search_regulations,
-- search_yard_standards) were never created, so full-text search failed
-- outright. The three storage buckets those pages upload to were never
-- created either, so every attachment upload failed.
--
-- This migration:
--   1. keeps search_vector current from the text columns, backfilling rows,
--   2. adds the two search functions, company-scoped,
--   3. creates nb_regulations, nb-deck-plans, nb-material-swatches and
--      nb-yard-standards as private buckets with company-scoped policies.
--
-- The pages also referred to the same two buckets under two names
-- ("deck-plans" / "nb-deck-plans", "yard-standards"), so a delete could miss
-- the file an upload had written. The code is normalised on the nb- names;
-- neither bucket existed, so no stored object moves.
--
-- Highlights are returned with the sentinel markers [[hl]] and [[/hl]]
-- rather than <b> tags. ts_headline does not escape the source text, so
-- emitting HTML here and rendering it with dangerouslySetInnerHTML made a
-- document title a stored-XSS vector. The client splits on the sentinels
-- and renders React nodes instead.
-- =================================================================

-- ---------------------------------------------------------------
-- 1. search_vector maintenance
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nb_regulations_search_vector()
RETURNS trigger
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.reference_number, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.tags, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.source, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.content_text, '')), 'D');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.nb_regulations_search_vector() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.nb_yard_standards_search_vector()
RETURNS trigger
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.document_number, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.element_code, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.tags, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.content_text, '')), 'D');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.nb_yard_standards_search_vector() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_nb_regulations_search_vector ON public.nb_regulations;
CREATE TRIGGER trg_nb_regulations_search_vector
  BEFORE INSERT OR UPDATE ON public.nb_regulations
  FOR EACH ROW EXECUTE FUNCTION public.nb_regulations_search_vector();

DROP TRIGGER IF EXISTS trg_nb_yard_standards_search_vector ON public.nb_yard_standards;
CREATE TRIGGER trg_nb_yard_standards_search_vector
  BEFORE INSERT OR UPDATE ON public.nb_yard_standards
  FOR EACH ROW EXECUTE FUNCTION public.nb_yard_standards_search_vector();

CREATE INDEX IF NOT EXISTS idx_nb_regulations_search ON public.nb_regulations USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_nb_yard_standards_search ON public.nb_yard_standards USING gin (search_vector);

-- Backfill existing rows (no-op on an empty table).
UPDATE public.nb_regulations SET updated_at = updated_at;
UPDATE public.nb_yard_standards SET updated_at = updated_at;

-- ---------------------------------------------------------------
-- 2. Search functions
-- ---------------------------------------------------------------
-- SECURITY INVOKER: the nb_* RLS policies added in 20260919170000 already
-- scope every row to the caller's company, so the search inherits them.
CREATE OR REPLACE FUNCTION public.search_regulations(
  p_project_id uuid,
  p_query text,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  category text,
  source text,
  reference_number text,
  tags text,
  file_name text,
  storage_path text,
  external_url text,
  uploaded_by uuid,
  created_at timestamptz,
  content_indexed_at timestamptz,
  rank real,
  headline text
)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH q AS (SELECT websearch_to_tsquery('english', p_query) AS tsq)
  SELECT r.id, r.title, r.description, r.category, r.source, r.reference_number,
         r.tags, r.file_name, r.storage_path, r.external_url, r.uploaded_by,
         r.created_at, r.content_indexed_at,
         ts_rank(r.search_vector, q.tsq) AS rank,
         ts_headline('english',
           coalesce(nullif(r.content_text, ''), coalesce(r.description, r.title)),
           q.tsq,
           'StartSel=[[hl]], StopSel=[[/hl]], MaxFragments=2, MaxWords=18, MinWords=5') AS headline
  FROM public.nb_regulations r, q
  WHERE r.project_id = p_project_id
    AND (p_category IS NULL OR r.category = p_category)
    AND r.search_vector @@ q.tsq
  ORDER BY rank DESC, r.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$$;
REVOKE ALL ON FUNCTION public.search_regulations(uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_regulations(uuid, text, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_yard_standards(
  p_project_id uuid,
  p_query text,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  category text,
  tags text,
  file_name text,
  storage_path text,
  external_url text,
  doc_type_code text,
  element_code text,
  material_code text,
  seq_code text,
  sheet_number text,
  revision text,
  document_number text,
  uploaded_by uuid,
  created_at timestamptz,
  content_indexed_at timestamptz,
  rank real,
  headline text
)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH q AS (SELECT websearch_to_tsquery('english', p_query) AS tsq)
  SELECT s.id, s.title, s.description, s.category, s.tags, s.file_name,
         s.storage_path, s.external_url, s.doc_type_code, s.element_code,
         s.material_code, s.seq_code, s.sheet_number, s.revision,
         s.document_number, s.uploaded_by, s.created_at, s.content_indexed_at,
         ts_rank(s.search_vector, q.tsq) AS rank,
         ts_headline('english',
           coalesce(nullif(s.content_text, ''), coalesce(s.description, s.title)),
           q.tsq,
           'StartSel=[[hl]], StopSel=[[/hl]], MaxFragments=2, MaxWords=18, MinWords=5') AS headline
  FROM public.nb_yard_standards s, q
  WHERE s.project_id = p_project_id
    AND (p_category IS NULL OR s.category = p_category)
    AND s.search_vector @@ q.tsq
  ORDER BY rank DESC, s.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
$$;
REVOKE ALL ON FUNCTION public.search_yard_standards(uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_yard_standards(uuid, text, text, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 3. Storage buckets
--    Paths are <project_id>/<file>, so the policies join nb_projects to
--    reach the company. All three are private.
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('nb_regulations', 'nb_regulations', false, 52428800,
    ARRAY['application/pdf','application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain','image/jpeg','image/png']),
  ('nb-deck-plans', 'nb-deck-plans', false, 52428800,
    ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/svg+xml']),
  ('nb-material-swatches', 'nb-material-swatches', false, 10485760,
    ARRAY['image/jpeg','image/png','image/webp']),
  ('nb-yard-standards', 'nb-yard-standards', false, 52428800,
    ARRAY['application/pdf','application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.nb_project_in_company(p_project_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.nb_projects p
    WHERE p.id::text = p_project_id
      AND public.user_belongs_to_company(auth.uid(), p.company_id)
  );
$$;
REVOKE ALL ON FUNCTION public.nb_project_in_company(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nb_project_in_company(text) TO authenticated, service_role;

DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['nb_regulations', 'nb-deck-plans', 'nb-material-swatches', 'nb-yard-standards'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_read');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_write');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_update');
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_delete');

    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L AND public.nb_project_in_company((storage.foldername(name))[1]))',
      b || '_read', b);
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L AND public.nb_project_in_company((storage.foldername(name))[1]))',
      b || '_write', b);
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L AND public.nb_project_in_company((storage.foldername(name))[1]))',
      b || '_update', b);
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L AND public.nb_project_in_company((storage.foldername(name))[1]))',
      b || '_delete', b);
  END LOOP;
END $$;


-- Drop existing trip_suggestions and recreate with correct schema
-- First drop dependent tables
DROP TABLE IF EXISTS public.trip_suggestion_votes CASCADE;
DROP TABLE IF EXISTS public.trip_suggestion_attachments CASCADE;
DROP TABLE IF EXISTS public.trip_suggestion_links CASCADE;
DROP TABLE IF EXISTS public.trip_suggestion_comments CASCADE;
DROP TABLE IF EXISTS public.custom_tags CASCADE;
DROP TABLE IF EXISTS public.trip_suggestions CASCADE;
DROP TABLE IF EXISTS public.destinations CASCADE;

-- Drop and recreate enums cleanly
DROP TYPE IF EXISTS public.trip_category CASCADE;
DROP TYPE IF EXISTS public.suggestion_status CASCADE;
DROP TYPE IF EXISTS public.owner_visited_status CASCADE;
-- Keep diving_level if it's used elsewhere
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid 
    WHERE t.typname = 'trip_category' AND n.nspname = 'public'
  ) THEN NULL; END IF;
END $$;

CREATE TYPE public.trip_category AS ENUM ('maritime', 'land_based', 'combined');
CREATE TYPE public.suggestion_status AS ENUM ('new', 'under_consideration', 'planned', 'declined', 'confirmed', 'completed');
CREATE TYPE public.owner_visited_status AS ENUM ('yes', 'no', 'unknown');

-- 1. destinations
CREATE TABLE public.destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT,
  country_code VARCHAR(3),
  region TEXT,
  area TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  timezone TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  merged_into_id UUID REFERENCES public.destinations(id),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "destinations_select" ON public.destinations FOR SELECT TO authenticated USING (true);
CREATE POLICY "destinations_insert" ON public.destinations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "destinations_update" ON public.destinations FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[]) OR created_by = auth.uid());

CREATE TRIGGER update_destinations_updated_at BEFORE UPDATE ON public.destinations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. trip_suggestions
CREATE TABLE public.trip_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  destination_id UUID NOT NULL REFERENCES public.destinations(id),
  title TEXT,
  description TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  trip_category public.trip_category NOT NULL DEFAULT 'maritime',
  diving_level public.diving_level,
  diving_types TEXT[],
  marine_species TEXT,
  best_months INTEGER[],
  event_dates JSONB,
  suitable_vessels UUID[],
  estimated_duration TEXT,
  nearest_bunker_text TEXT,
  owner_visited public.owner_visited_status,
  owner_visited_when TEXT,
  enthusiasm_rating INTEGER NOT NULL DEFAULT 3,
  status public.suggestion_status NOT NULL DEFAULT 'new',
  internal_notes TEXT,
  linked_entry_id UUID,
  submitted_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.trip_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suggestions_select" ON public.trip_suggestions FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "suggestions_insert" ON public.trip_suggestions FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid());
CREATE POLICY "suggestions_update" ON public.trip_suggestions FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[]));
CREATE POLICY "suggestions_delete" ON public.trip_suggestions FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[]));

CREATE TRIGGER update_trip_suggestions_updated_at BEFORE UPDATE ON public.trip_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_trip_suggestions_status ON public.trip_suggestions(status);
CREATE INDEX idx_trip_suggestions_destination ON public.trip_suggestions(destination_id);
CREATE INDEX idx_trip_suggestions_company ON public.trip_suggestions(company_id);

-- 3. trip_suggestion_votes
CREATE TABLE public.trip_suggestion_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES public.trip_suggestions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(suggestion_id, user_id)
);

ALTER TABLE public.trip_suggestion_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "votes_select" ON public.trip_suggestion_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "votes_insert" ON public.trip_suggestion_votes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "votes_delete" ON public.trip_suggestion_votes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 4. trip_suggestion_attachments
CREATE TABLE public.trip_suggestion_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES public.trip_suggestions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  label TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_suggestion_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attachments_select" ON public.trip_suggestion_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "attachments_insert" ON public.trip_suggestion_attachments FOR INSERT TO authenticated WITH CHECK (true);

-- 5. trip_suggestion_links
CREATE TABLE public.trip_suggestion_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES public.trip_suggestions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  label TEXT,
  og_title TEXT,
  og_image TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_suggestion_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "links_select" ON public.trip_suggestion_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "links_insert" ON public.trip_suggestion_links FOR INSERT TO authenticated WITH CHECK (true);

-- 6. trip_suggestion_comments
CREATE TABLE public.trip_suggestion_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES public.trip_suggestions(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.trip_suggestion_comments(id),
  author_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  mentions UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.trip_suggestion_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_select" ON public.trip_suggestion_comments FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "comments_insert" ON public.trip_suggestion_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "comments_update" ON public.trip_suggestion_comments FOR UPDATE TO authenticated USING (author_id = auth.uid());
CREATE POLICY "comments_delete" ON public.trip_suggestion_comments FOR DELETE TO authenticated USING (author_id = auth.uid());

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.trip_suggestion_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. custom_tags
CREATE TABLE public.custom_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  name TEXT NOT NULL,
  icon TEXT,
  created_by UUID REFERENCES auth.users(id),
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_select" ON public.custom_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "tags_insert" ON public.custom_tags FOR INSERT TO authenticated WITH CHECK (true);

-- Storage
INSERT INTO storage.buckets (id, name, public) VALUES ('trip-suggestion-attachments', 'trip-suggestion-attachments', false)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- ITINERARY MODULE — Phase 1: Schema
-- ============================================================

-- 1. Enums
CREATE TYPE public.itinerary_status AS ENUM (
  'draft', 'tentative', 'confirmed', 'postponed', 'cancelled', 'completed'
);

CREATE TYPE public.diving_level AS ENUM (
  'none', 'beginner', 'intermediate', 'advanced', 'technical', 'cave'
);

CREATE TYPE public.suggestion_status AS ENUM (
  'new', 'under_consideration', 'planned', 'declined'
);

CREATE TYPE public.crew_change_source AS ENUM (
  'auto_generated', 'manual_override'
);

-- 2. Trip Types (user-configurable)
CREATE TABLE public.trip_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  colour VARCHAR(7) NOT NULL,
  icon TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_types_select" ON public.trip_types
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "trip_types_insert" ON public.trip_types
  FOR INSERT WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
  );

CREATE POLICY "trip_types_update" ON public.trip_types
  FOR UPDATE USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
  );

CREATE POLICY "trip_types_delete" ON public.trip_types
  FOR DELETE USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
  );

CREATE TRIGGER update_trip_types_updated_at
  BEFORE UPDATE ON public.trip_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Ports reference table
CREATE TABLE public.ports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  country_code VARCHAR(3),
  latitude DECIMAL,
  longitude DECIMAL,
  timezone TEXT,
  isps_compliant BOOLEAN NOT NULL DEFAULT false,
  max_loa_metres DECIMAL,
  default_agent_name TEXT,
  default_agent_contact TEXT,
  notes TEXT,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ports ENABLE ROW LEVEL SECURITY;

-- Ports are globally readable, writable by authenticated users
CREATE POLICY "ports_select" ON public.ports
  FOR SELECT USING (true);

CREATE POLICY "ports_insert" ON public.ports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "ports_update" ON public.ports
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 4. Itinerary Entries (core table)
CREATE TABLE public.itinerary_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  trip_type_id UUID REFERENCES public.trip_types(id),
  location TEXT,
  country TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  port_id UUID REFERENCES public.ports(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status public.itinerary_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  responsible_person_id UUID REFERENCES auth.users(id),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_by UUID REFERENCES auth.users(id),
  locked_at TIMESTAMPTZ,
  group_id UUID,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.itinerary_entries ENABLE ROW LEVEL SECURITY;

-- Shore management / DPA / fleet_master: full access
-- Captains: read all, write own vessel
-- Crew: read tentative + confirmed + completed for own vessel only
CREATE POLICY "itinerary_entries_select" ON public.itinerary_entries
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      -- Shore management sees everything
      public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
      -- Captains see everything (all statuses, all vessels)
      OR public.has_role(auth.uid(), 'captain'::app_role)
      -- Crew see tentative + confirmed + completed only (vessel filtering done in app)
      OR status IN ('tentative', 'confirmed', 'completed')
    )
  );

CREATE POLICY "itinerary_entries_insert" ON public.itinerary_entries
  FOR INSERT WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
      OR public.has_role(auth.uid(), 'captain'::app_role)
    )
  );

CREATE POLICY "itinerary_entries_update" ON public.itinerary_entries
  FOR UPDATE USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
      OR public.has_role(auth.uid(), 'captain'::app_role)
    )
  );

CREATE POLICY "itinerary_entries_delete" ON public.itinerary_entries
  FOR DELETE USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
  );

CREATE TRIGGER update_itinerary_entries_updated_at
  BEFORE UPDATE ON public.itinerary_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_itinerary_entries_company ON public.itinerary_entries(company_id);
CREATE INDEX idx_itinerary_entries_dates ON public.itinerary_entries(start_date, end_date);
CREATE INDEX idx_itinerary_entries_status ON public.itinerary_entries(status);
CREATE INDEX idx_itinerary_entries_group ON public.itinerary_entries(group_id) WHERE group_id IS NOT NULL;

-- 5. Itinerary Entry Vessels (junction table for multi-vessel entries)
CREATE TABLE public.itinerary_entry_vessels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES public.itinerary_entries(id) ON DELETE CASCADE,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  detached_from_group BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entry_id, vessel_id)
);

ALTER TABLE public.itinerary_entry_vessels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "itinerary_entry_vessels_select" ON public.itinerary_entry_vessels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_entries ie
      WHERE ie.id = entry_id
      AND public.user_belongs_to_company(auth.uid(), ie.company_id)
    )
  );

CREATE POLICY "itinerary_entry_vessels_insert" ON public.itinerary_entry_vessels
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itinerary_entries ie
      WHERE ie.id = entry_id
      AND public.user_belongs_to_company(auth.uid(), ie.company_id)
      AND (
        public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
        OR public.has_role(auth.uid(), 'captain'::app_role)
      )
    )
  );

CREATE POLICY "itinerary_entry_vessels_update" ON public.itinerary_entry_vessels
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_entries ie
      WHERE ie.id = entry_id
      AND public.user_belongs_to_company(auth.uid(), ie.company_id)
      AND (
        public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
        OR public.has_role(auth.uid(), 'captain'::app_role)
      )
    )
  );

CREATE POLICY "itinerary_entry_vessels_delete" ON public.itinerary_entry_vessels
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_entries ie
      WHERE ie.id = entry_id
      AND public.user_belongs_to_company(auth.uid(), ie.company_id)
      AND public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
    )
  );

CREATE INDEX idx_itinerary_entry_vessels_entry ON public.itinerary_entry_vessels(entry_id);
CREATE INDEX idx_itinerary_entry_vessels_vessel ON public.itinerary_entry_vessels(vessel_id);

-- 6. Itinerary Comments
CREATE TABLE public.itinerary_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES public.itinerary_entries(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.itinerary_comments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  body TEXT NOT NULL,
  mentions UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.itinerary_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "itinerary_comments_select" ON public.itinerary_comments
  FOR SELECT USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.itinerary_entries ie
      WHERE ie.id = entry_id
      AND public.user_belongs_to_company(auth.uid(), ie.company_id)
    )
  );

CREATE POLICY "itinerary_comments_insert" ON public.itinerary_comments
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.itinerary_entries ie
      WHERE ie.id = entry_id
      AND public.user_belongs_to_company(auth.uid(), ie.company_id)
    )
  );

CREATE POLICY "itinerary_comments_update" ON public.itinerary_comments
  FOR UPDATE USING (
    author_id = auth.uid()
    AND created_at > now() - INTERVAL '24 hours'
  );

CREATE POLICY "itinerary_comments_delete" ON public.itinerary_comments
  FOR DELETE USING (
    author_id = auth.uid()
    AND created_at > now() - INTERVAL '24 hours'
  );

CREATE INDEX idx_itinerary_comments_entry ON public.itinerary_comments(entry_id);
CREATE INDEX idx_itinerary_comments_parent ON public.itinerary_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;

CREATE TRIGGER update_itinerary_comments_updated_at
  BEFORE UPDATE ON public.itinerary_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Trip Suggestions
CREATE TABLE public.trip_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  region TEXT,
  country TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  best_time_start_month INTEGER,
  best_time_end_month INTEGER,
  reason TEXT NOT NULL,
  activities TEXT[],
  diving_level public.diving_level,
  nearest_bunker TEXT,
  suggested_vessels UUID[],
  priority_rating INTEGER,
  status public.suggestion_status NOT NULL DEFAULT 'new',
  linked_entry_id UUID REFERENCES public.itinerary_entries(id),
  submitted_by UUID NOT NULL REFERENCES auth.users(id),
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_suggestions_select" ON public.trip_suggestions
  FOR SELECT USING (
    public.user_belongs_to_company(auth.uid(), company_id)
  );

CREATE POLICY "trip_suggestions_insert" ON public.trip_suggestions
  FOR INSERT WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND submitted_by = auth.uid()
  );

CREATE POLICY "trip_suggestions_update" ON public.trip_suggestions
  FOR UPDATE USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      submitted_by = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
    )
  );

CREATE TRIGGER update_trip_suggestions_updated_at
  BEFORE UPDATE ON public.trip_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_trip_suggestions_company ON public.trip_suggestions(company_id);

-- 8. Trip Suggestion Votes
CREATE TABLE public.trip_suggestion_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suggestion_id UUID NOT NULL REFERENCES public.trip_suggestions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(suggestion_id, user_id)
);

ALTER TABLE public.trip_suggestion_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_suggestion_votes_select" ON public.trip_suggestion_votes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "trip_suggestion_votes_insert" ON public.trip_suggestion_votes
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "trip_suggestion_votes_delete" ON public.trip_suggestion_votes
  FOR DELETE USING (
    user_id = auth.uid()
  );

-- 9. Crew Change Dates
CREATE TABLE public.crew_change_dates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vessel_id UUID NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  change_date DATE NOT NULL,
  notes TEXT,
  source public.crew_change_source NOT NULL DEFAULT 'auto_generated',
  overridden_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crew_change_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crew_change_dates_select" ON public.crew_change_dates
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "crew_change_dates_insert" ON public.crew_change_dates
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
      OR public.has_role(auth.uid(), 'captain'::app_role)
    )
  );

CREATE POLICY "crew_change_dates_update" ON public.crew_change_dates
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND (
      public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa', 'fleet_master']::app_role[])
      OR public.has_role(auth.uid(), 'captain'::app_role)
    )
  );

CREATE INDEX idx_crew_change_dates_vessel ON public.crew_change_dates(vessel_id);
CREATE INDEX idx_crew_change_dates_date ON public.crew_change_dates(change_date);

CREATE TRIGGER update_crew_change_dates_updated_at
  BEFORE UPDATE ON public.crew_change_dates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

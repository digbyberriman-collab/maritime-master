-- =================================================================
-- CREW X1-02: the vessel crew list, derived crew status, movements and the
-- crew list as at a date (Phase 3 wave 1, stream X1; gap/04 C3, C4, C7,
-- C8, C9, C11; DECISIONS D-X1-4, D-X1-8, D-199, D-225, D-227; X1 spec §6
-- 060200)
-- Tables: crew_movements (embark / disembark / transfer events per vessel),
--   crew_transfers (the table only, so the list shows On transfer from the
--   start; its writers arrive with X1-11)
-- Functions: crew_status_decide() (pure), crew_vessel_members() (internal,
--   the canonical "who is on this vessel's crew on a day"),
--   crew_caller_is_external() (caller-only policy and RPC helper),
--   crew_vessel_list(), crew_vessel_movements() (RPCs)
-- Triggers: crew_movements_scope_guard(), crew_transfers_scope_guard()
--   (integrity, every writer), crew_transfers_guard() (engine flag on the
--   status and decision columns)
-- TS mirror: src/modules/crew/types/db.pending.ts (tables and RPCs);
--   src/modules/crew/lib/crewStatus.ts (crew_status_decide). Parity cases:
--   src/test/crew/fixtures/crewStatusCases.json, asserted by
--   src/test/crew/crewStatus.test.ts and by
--   supabase/tests/sql/crew/vessel_list.test.sql
-- =================================================================
--
-- Why. Today the vessel crew list is two pages (CrewList: every person on
-- the books; CrewRoster: an admin table) that read every profile of the
-- company in the browser and show the free-text profiles.status. gap/04
-- C3/C4 ask for one list scoped to the route's vessel, read on the server,
-- with a status derived per person and day (gap/04 W2) and the list as at a
-- future date for the crew list report (T-306). D-X1-8 makes that list a
-- definer RPC with one gate.
--
-- Who is on the list (crew_vessel_members, evaluated on a day p_on):
-- * a current assignment on the vessel (D-227: is_current, and the leave
--   or end date unset or after p_on), placement 'assignment';
-- * a current assignment whose join date (else start date) is after p_on,
--   placement 'planned' (D-X1-4: shown as Pending until the join date);
-- * a pending placement (D-199, D-204, D-225): an imported profile of the
--   vessel's company whose profiles.imported_vessel_id is the vessel and
--   whose login (if any) has no current assignment; it reads as
--   fulfil_imported_assignment() will write it: position, else rank, else
--   Crew; joining date, else the profile's created date.
-- Ended and stale rows (leave date on or before p_on) are not on the list.
-- The person's profile must belong to the vessel's company (D-246).
--
-- Status (crew_status_decide, first match wins; gap/04 W2):
--   on_transfer  a scheduled crew_transfers row of the person touches the
--                vessel and p_on is between its sign-off and sign-on dates;
--   pending      placement planned or pending_placement;
--   on_leave     the person's crew_leave_entries day code on p_on is not
--                F (on board) or T (travel day);
--   ashore       the last In/Out board event of the day is out (the board
--                is P2, so the list always passes NULL in wave 1);
--   on_board     otherwise.
--
-- Access. crew_vessel_list() and crew_vessel_movements() need
-- vessel.crew.crew_list.view on the vessel (crew_vessel_gate: P0002 for an
-- unknown vessel, 42501 with a STORM sentence otherwise) and refuse an
-- external viewer of the company (42501). The email column is filled only
-- for holders of vessel.crew.crew_profiles.view on the vessel (and on the
-- caller's own row). crew_movements reads for company members holding
-- crew_list.view on the vessel; crew_transfers for holders of
-- vessel.crew.crew_assignments.view on either vessel and for the person
-- themselves. Both policies hoist the caller-only parts (D-229) and refuse
-- external viewers. There is no browser write policy: the movements come
-- from X1 definers (toggle, planner, transfer) and transfers from X1-11.
-- crew_transfers' status and decision columns change only under the X1
-- engine flag (storm.crew_engine = 'on'), the service role and no-JWT
-- maintenance being exempt (D-132 style).
--
-- Idempotent (D-12): IF NOT EXISTS, DROP ... IF EXISTS before each policy
-- and trigger, CREATE OR REPLACE for every function; no data is seeded.

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regprocedure('public.crew_vessel_gate(text,uuid,text)') IS NULL
     OR to_regprocedure('public.crew_vessel_cap(text,uuid)') IS NULL
     OR to_regprocedure('public.crew_cap_vessel_ids(text)') IS NULL
     OR to_regprocedure('public.crew_position_for(uuid,uuid,text)') IS NULL
     OR to_regclass('public.positions') IS NULL
     OR to_regclass('public.position_manning') IS NULL
     OR to_regclass('public.departments') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060200_crew_vessel_list needs the crew gate helpers and positions: apply 20261124060100_crew_reference_positions.sql first';
  END IF;
  IF to_regclass('public.user_invitations') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060200_crew_vessel_list needs user_invitations: apply 20261123010200_platform_user_invitations.sql first';
  END IF;
  IF to_regprocedure('public.record_user_is_external(uuid,uuid)') IS NULL
     OR to_regprocedure('public.record_normalise_office(text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060200_crew_vessel_list needs record_user_is_external() and record_normalise_office(): apply 20261123020000_platform_record_registry.sql and 20261123020100_platform_record_signatures.sql first';
  END IF;
  IF to_regprocedure('public.my_profile_id()') IS NULL
     OR to_regprocedure('public.get_user_company_id(uuid)') IS NULL
     OR position('user_is_active' IN pg_get_functiondef('public.user_belongs_to_company(uuid,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060200_crew_vessel_list needs the active-aware company helpers: apply 20261123010000_platform_user_status.sql first';
  END IF;
  IF to_regclass('public.crew_leave_entries') IS NULL OR to_regclass('public.frp_travel_movements') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124060200_crew_vessel_list needs crew_leave_entries (legacy 20260215080527) and frp_travel_movements (legacy 20260617195850)';
  END IF;
END
$$;

-- ---------------------------------------------------------------- tables

CREATE TABLE IF NOT EXISTS public.crew_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  kind text NOT NULL,
  occurred_on date NOT NULL,
  occurred_at timestamptz NULL,
  port text NULL,
  source text NOT NULL DEFAULT 'manual',
  source_id uuid NULL,
  notes text NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_movements_pkey PRIMARY KEY (id),
  CONSTRAINT crew_movements_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_movements_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT crew_movements_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT crew_movements_kind_check CHECK (kind IN ('embark', 'disembark', 'transfer_out', 'transfer_in')),
  CONSTRAINT crew_movements_source_check CHECK (source IN ('manual', 'planner', 'transfer', 'toggle', 'assignment')),
  CONSTRAINT crew_movements_port_check CHECK (port IS NULL OR length(btrim(port)) BETWEEN 1 AND 120),
  CONSTRAINT crew_movements_notes_check CHECK (notes IS NULL OR length(notes) <= 2000)
);
CREATE INDEX IF NOT EXISTS crew_movements_vessel_day_idx ON public.crew_movements (vessel_id, occurred_on);
CREATE INDEX IF NOT EXISTS crew_movements_profile_idx ON public.crew_movements (profile_id);
CREATE INDEX IF NOT EXISTS crew_movements_source_idx ON public.crew_movements (source_id) WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crew_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  user_id uuid NULL,
  from_vessel_id uuid NOT NULL,
  to_vessel_id uuid NOT NULL,
  from_assignment_id uuid NULL,
  to_assignment_id uuid NULL,
  from_position_id uuid NULL,
  to_position_id uuid NULL,
  same_role boolean NOT NULL DEFAULT true,
  sign_off_date date NOT NULL,
  sign_on_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  requires_approval boolean NOT NULL DEFAULT false,
  review_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  gaps_snapshot jsonb NULL,
  submitted_by uuid NULL,
  submitted_at timestamptz NULL,
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  decline_reason text NULL,
  completed_at timestamptz NULL,
  cancelled_by uuid NULL,
  cancelled_at timestamptz NULL,
  cancelled_reason text NULL,
  compliant_on_destination_at timestamptz NULL,
  notes text NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crew_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT crew_transfers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT crew_transfers_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT crew_transfers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT crew_transfers_from_vessel_id_fkey FOREIGN KEY (from_vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT crew_transfers_to_vessel_id_fkey FOREIGN KEY (to_vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE,
  CONSTRAINT crew_transfers_from_assignment_id_fkey FOREIGN KEY (from_assignment_id) REFERENCES public.crew_assignments(id) ON DELETE SET NULL,
  CONSTRAINT crew_transfers_to_assignment_id_fkey FOREIGN KEY (to_assignment_id) REFERENCES public.crew_assignments(id) ON DELETE SET NULL,
  CONSTRAINT crew_transfers_from_position_id_fkey FOREIGN KEY (from_position_id) REFERENCES public.positions(id) ON DELETE SET NULL,
  CONSTRAINT crew_transfers_to_position_id_fkey FOREIGN KEY (to_position_id) REFERENCES public.positions(id) ON DELETE SET NULL,
  CONSTRAINT crew_transfers_vessels_check CHECK (to_vessel_id <> from_vessel_id),
  CONSTRAINT crew_transfers_dates_check CHECK (sign_on_date >= sign_off_date),
  CONSTRAINT crew_transfers_status_check CHECK (status IN ('draft', 'review', 'pending_approval', 'scheduled', 'completed', 'cancelled')),
  CONSTRAINT crew_transfers_review_items_check CHECK (jsonb_typeof(review_items) = 'array'),
  CONSTRAINT crew_transfers_gaps_snapshot_check CHECK (gaps_snapshot IS NULL OR jsonb_typeof(gaps_snapshot) IN ('object', 'array')),
  CONSTRAINT crew_transfers_decline_reason_check CHECK (decline_reason IS NULL OR length(decline_reason) <= 2000),
  CONSTRAINT crew_transfers_cancelled_reason_check CHECK (cancelled_reason IS NULL OR length(cancelled_reason) <= 2000),
  CONSTRAINT crew_transfers_notes_check CHECK (notes IS NULL OR length(notes) <= 2000)
);
CREATE INDEX IF NOT EXISTS crew_transfers_from_vessel_status_idx ON public.crew_transfers (from_vessel_id, status);
CREATE INDEX IF NOT EXISTS crew_transfers_to_vessel_status_idx ON public.crew_transfers (to_vessel_id, status);
CREATE INDEX IF NOT EXISTS crew_transfers_profile_idx ON public.crew_transfers (profile_id);

COMMENT ON TABLE public.crew_movements IS 'Crew movements per vessel (gap/04 C9): embark, disembark and transfer events with the date, port and source (manual, planner, transfer, toggle, assignment). Read with vessel.crew.crew_list.view on the vessel (not by external viewers); written only by X1 definers and the service role. crew_vessel_movements() adds the embark and disembark events derived from crew_assignments, de-duplicated against these rows.';
COMMENT ON TABLE public.crew_transfers IS 'Controlled crew transfers between two vessels of a company (gap/04 W9, C58; writers arrive with X1-11). A scheduled row whose sign-off to sign-on window covers a day makes the person On transfer on both vessels'' crew lists. Read with vessel.crew.crew_assignments.view on either vessel, or by the person themselves; status and decision columns change only under the X1 engine flag (storm.crew_engine), service role and no-JWT maintenance exempt.';

-- ---------------------------------------------------------------- integrity guards (every writer, the service role included)

-- A movement belongs to its vessel's company and names a person of that company.
CREATE OR REPLACE FUNCTION public.crew_movements_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_vessel_company uuid;
  v_profile_company uuid;
BEGIN
  SELECT v.company_id INTO v_vessel_company FROM public.vessels AS v WHERE v.id = NEW.vessel_id;
  SELECT p.company_id INTO v_profile_company FROM public.profiles AS p WHERE p.id = NEW.profile_id;
  IF NEW.company_id IS DISTINCT FROM v_vessel_company OR NEW.company_id IS DISTINCT FROM v_profile_company THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_movement_scope_mismatch',
      DETAIL = 'A crew movement must name a vessel and a person of its own company.';
  END IF;
  RETURN NEW;
END;
$$;

-- A transfer moves a person of the company between two vessels of the company.
CREATE OR REPLACE FUNCTION public.crew_transfers_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_from_company uuid;
  v_to_company uuid;
  v_profile_company uuid;
BEGIN
  SELECT v.company_id INTO v_from_company FROM public.vessels AS v WHERE v.id = NEW.from_vessel_id;
  SELECT v.company_id INTO v_to_company FROM public.vessels AS v WHERE v.id = NEW.to_vessel_id;
  SELECT p.company_id INTO v_profile_company FROM public.profiles AS p WHERE p.id = NEW.profile_id;
  IF NEW.company_id IS DISTINCT FROM v_from_company
     OR NEW.company_id IS DISTINCT FROM v_to_company
     OR NEW.company_id IS DISTINCT FROM v_profile_company THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'crew_transfer_scope_mismatch',
      DETAIL = 'A transfer must move a person of the company between two vessels of the same company.';
  END IF;
  RETURN NEW;
END;
$$;

-- The status and decision columns belong to the X1 transfer engine
-- (X1-11). A signed-in writer without storm.crew_engine = 'on' may create
-- only a draft with no decision, change none of these columns, and delete
-- only a draft. The service role and no-JWT maintenance are exempt.
CREATE OR REPLACE FUNCTION public.crew_transfers_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('storm.crew_engine', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.requires_approval
       OR NEW.submitted_by IS NOT NULL OR NEW.submitted_at IS NOT NULL
       OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.decline_reason IS NOT NULL
       OR NEW.completed_at IS NOT NULL OR NEW.cancelled_by IS NOT NULL OR NEW.cancelled_at IS NOT NULL
       OR NEW.cancelled_reason IS NOT NULL OR NEW.compliant_on_destination_at IS NOT NULL
       OR NEW.gaps_snapshot IS NOT NULL OR NEW.review_items <> '[]'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_transfer_engine_only',
        DETAIL = 'A transfer moves on only through STORM''s transfer steps.';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_transfer_engine_only',
        DETAIL = 'Only a draft transfer can be deleted; cancel it instead.';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.requires_approval IS DISTINCT FROM OLD.requires_approval
     OR NEW.review_items IS DISTINCT FROM OLD.review_items
     OR NEW.gaps_snapshot IS DISTINCT FROM OLD.gaps_snapshot
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.decline_reason IS DISTINCT FROM OLD.decline_reason
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
     OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
     OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
     OR NEW.cancelled_reason IS DISTINCT FROM OLD.cancelled_reason
     OR NEW.compliant_on_destination_at IS DISTINCT FROM OLD.compliant_on_destination_at THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_transfer_engine_only',
      DETAIL = 'A transfer moves on only through STORM''s transfer steps.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crew_movements_scope_guard ON public.crew_movements;
CREATE TRIGGER crew_movements_scope_guard BEFORE INSERT OR UPDATE ON public.crew_movements
  FOR EACH ROW EXECUTE FUNCTION public.crew_movements_scope_guard();
DROP TRIGGER IF EXISTS crew_transfers_scope_guard ON public.crew_transfers;
CREATE TRIGGER crew_transfers_scope_guard BEFORE INSERT OR UPDATE ON public.crew_transfers
  FOR EACH ROW EXECUTE FUNCTION public.crew_transfers_scope_guard();
DROP TRIGGER IF EXISTS crew_transfers_guard ON public.crew_transfers;
CREATE TRIGGER crew_transfers_guard BEFORE INSERT OR UPDATE OR DELETE ON public.crew_transfers
  FOR EACH ROW EXECUTE FUNCTION public.crew_transfers_guard();
DROP TRIGGER IF EXISTS update_crew_movements_updated_at ON public.crew_movements;
CREATE TRIGGER update_crew_movements_updated_at BEFORE UPDATE ON public.crew_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_crew_transfers_updated_at ON public.crew_transfers;
CREATE TRIGGER update_crew_transfers_updated_at BEFORE UPDATE ON public.crew_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- status and membership

-- The status of a crew member on a vessel on a day (gap/04 W2), first match
-- wins: on_transfer > pending > on_leave > ashore > on_board. A day code is
-- trimmed and upper-cased; F (on board) and T (travel day) are not leave;
-- an empty code is no code. Pure; mirrored by crewStatusDecide() in
-- src/modules/crew/lib/crewStatus.ts and pinned case by case by
-- src/test/crew/fixtures/crewStatusCases.json.
CREATE OR REPLACE FUNCTION public.crew_status_decide(
  p_transfer_active boolean,
  p_placement_kind text,
  p_leave_code text,
  p_in_out_last text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(p_transfer_active, false) THEN 'on_transfer'
    WHEN p_placement_kind IN ('planned', 'pending_placement') THEN 'pending'
    WHEN nullif(upper(btrim(coalesce(p_leave_code, ''))), '') IS NOT NULL
         AND upper(btrim(p_leave_code)) NOT IN ('F', 'T') THEN 'on_leave'
    WHEN lower(btrim(coalesce(p_in_out_last, ''))) = 'out' THEN 'ashore'
    ELSE 'on_board'
  END
$$;

-- The crew of a vessel on a day (X1 spec §6; D-227, D-X1-4, D-199, D-225):
-- one row per person, with how they are on the list ('assignment',
-- 'planned' or 'pending_placement'), the free-text titles, the department
-- text and the join and leave dates. Internal: X1 definers call it with a
-- vessel id they resolved and gated themselves (crew_vessel_list,
-- crew_vessel_movements and later X1 slices), and it is offered to fleet
-- operations as the canonical current-crew helper (D-X1-22). No caller
-- rule here; nothing is granted to authenticated.
CREATE OR REPLACE FUNCTION public.crew_vessel_members(p_vessel_id uuid, p_on date)
RETURNS TABLE (
  profile_id uuid,
  user_id uuid,
  assignment_id uuid,
  placement_kind text,
  position_text text,
  rank_text text,
  department_text text,
  join_date date,
  leave_date date
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH vessel AS (
    SELECT v.id, v.company_id FROM public.vessels AS v WHERE v.id = p_vessel_id
  ),
  assigned AS (
    SELECT DISTINCT ON (p.id)
           p.id AS profile_id,
           ca.user_id,
           ca.id AS assignment_id,
           CASE WHEN coalesce(ca.join_date, ca.start_date) > coalesce(p_on, current_date) THEN 'planned' ELSE 'assignment' END AS placement_kind,
           nullif(btrim(ca.position), '') AS position_text,
           nullif(btrim(ca.rank), '') AS rank_text,
           nullif(btrim(coalesce(nullif(btrim(ca.department), ''), p.department)), '') AS department_text,
           coalesce(ca.join_date, ca.start_date) AS join_date,
           coalesce(ca.leave_date, ca.end_date) AS leave_date
    FROM vessel AS v
    JOIN public.crew_assignments AS ca ON ca.vessel_id = v.id
    JOIN public.profiles AS p ON p.user_id = ca.user_id AND p.company_id = v.company_id
    WHERE coalesce(ca.is_current, false)
      AND NOT coalesce(coalesce(ca.leave_date, ca.end_date) <= coalesce(p_on, current_date), false)
    -- A joined row beats a planned one; then the latest join.
    ORDER BY p.id,
             (coalesce(ca.join_date, ca.start_date) > coalesce(p_on, current_date)),
             coalesce(ca.join_date, ca.start_date) DESC NULLS LAST,
             ca.id
  ),
  pending AS (
    SELECT p.id AS profile_id,
           p.user_id,
           NULL::uuid AS assignment_id,
           'pending_placement'::text AS placement_kind,
           coalesce(nullif(btrim(p.position), ''), nullif(btrim(p.rank), ''), 'Crew') AS position_text,
           nullif(btrim(p.rank), '') AS rank_text,
           nullif(btrim(p.department), '') AS department_text,
           coalesce(p.joining_date, p.created_at::date) AS join_date,
           NULL::date AS leave_date
    FROM vessel AS v
    JOIN public.profiles AS p ON p.imported_vessel_id = v.id AND p.company_id = v.company_id
    WHERE coalesce(p.is_imported, false)
      AND NOT EXISTS (SELECT 1 FROM assigned AS a WHERE a.profile_id = p.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.crew_assignments AS x
        WHERE p.user_id IS NOT NULL AND x.user_id = p.user_id
          AND coalesce(x.is_current, false)
          AND NOT coalesce(coalesce(x.leave_date, x.end_date) <= coalesce(p_on, current_date), false)
      )
  )
  SELECT * FROM assigned
  UNION ALL
  SELECT * FROM pending
$$;

-- Caller-only (D-229): true when the caller is an external viewer of their
-- company (account_memberships.kind 'external'), and also without a JWT
-- and for an inactive caller (get_user_company_id answers NULL), so a
-- policy or RPC that refuses externals fails closed. Policies use it as
-- `NOT (SELECT public.crew_caller_is_external())`, once per statement.
CREATE OR REPLACE FUNCTION public.crew_caller_is_external()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN true;
  END IF;
  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RETURN true;
  END IF;
  RETURN coalesce(public.record_user_is_external(v_uid, v_company), true);
END;
$$;

-- ---------------------------------------------------------------- RPCs

-- The vessel's crew list on a day (gap/04 C3, C4, C7; D-X1-8; T-306 for a
-- later day). One gate: vessel.crew.crew_list.view on the vessel
-- (crew_vessel_gate: P0002 unknown vessel, 42501 with a sentence), and no
-- external viewer; 22023 as_at_out_of_range more than two years from today.
-- One row per crew_vessel_members() row:
-- * the person (names, avatar; email only with crew_profiles.view on the
--   vessel, or on the caller's own row; nationality from profiles: the
--   client merges crew_personal_details once 060300 is applied, D-X1-8);
-- * the position the titles map to (crew_position_for: position, then
--   rank), its department (else the legacy department text matched to a
--   department by key or label), tier, and the vessel's rank order;
-- * status (crew_status_decide) with status_detail, a code the client
--   turns into words: transfer_in / transfer_out (with transfer_vessel_id,
--   the other vessel), planned / pending_placement, leave (with
--   leave_code);
-- * travel_today: a frp_travel_movements row of the person for the vessel
--   (or none named) on the day (changeover date, else flight date);
-- * login_state: pending_login without a login (D-199), disabled, active;
--   the newest user_invitations row (id, stored status, expiry, last sent,
--   last error code) for the invitation column;
-- * is_master_office: a Master or Captain title (record_normalise_office).
-- Ordered by the vessel's rank order (unmapped titles last), then name.
CREATE OR REPLACE FUNCTION public.crew_vessel_list(p_vessel_id uuid, p_on date DEFAULT current_date)
RETURNS TABLE (
  profile_id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  preferred_name text,
  avatar_url text,
  email text,
  position_id uuid,
  position_name text,
  position_text text,
  department_key text,
  department_label text,
  rank_tier text,
  sort_order integer,
  assignment_id uuid,
  placement_kind text,
  join_date date,
  leave_date date,
  status text,
  status_detail text,
  transfer_vessel_id uuid,
  leave_code text,
  travel_today boolean,
  login_state text,
  account_status text,
  invitation_id uuid,
  invitation_status text,
  invitation_expires_at timestamptz,
  invitation_last_sent_at timestamptz,
  invitation_last_error_code text,
  nationality text,
  is_master_office boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company uuid;
  v_on date := coalesce(p_on, current_date);
  v_email boolean;
  v_me uuid;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.crew_list.view', p_vessel_id, 'You can''t see the crew of this vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t see the crew of this vessel.';
  END IF;
  IF v_on < (current_date - interval '2 years')::date OR v_on > (current_date + interval '2 years')::date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'as_at_out_of_range', DETAIL = 'Choose a date within two years of today.';
  END IF;
  v_email := coalesce(public.crew_vessel_cap('vessel.crew.crew_profiles.view', p_vessel_id), false);
  v_me := public.my_profile_id();

  RETURN QUERY
  WITH members AS (
    SELECT m.*,
           coalesce(public.crew_position_for(v_company, p_vessel_id, m.position_text),
                    public.crew_position_for(v_company, p_vessel_id, m.rank_text)) AS pid
    FROM public.crew_vessel_members(p_vessel_id, v_on) AS m
  ),
  transfers AS (
    SELECT DISTINCT ON (t.profile_id)
           t.profile_id,
           CASE WHEN t.to_vessel_id = p_vessel_id THEN 'transfer_in' ELSE 'transfer_out' END AS direction,
           CASE WHEN t.to_vessel_id = p_vessel_id THEN t.from_vessel_id ELSE t.to_vessel_id END AS other_vessel
    FROM public.crew_transfers AS t
    WHERE t.company_id = v_company
      AND t.status = 'scheduled'
      AND (t.from_vessel_id = p_vessel_id OR t.to_vessel_id = p_vessel_id)
      AND v_on BETWEEN t.sign_off_date AND t.sign_on_date
      AND t.profile_id IN (SELECT mb.profile_id FROM members AS mb)
    ORDER BY t.profile_id, t.sign_on_date, t.id
  ),
  invitations AS (
    SELECT DISTINCT ON (ui.profile_id)
           ui.profile_id, ui.id, ui.status, ui.expires_at, ui.last_sent_at, ui.last_error_code
    FROM public.user_invitations AS ui
    WHERE ui.company_id = v_company
      AND ui.profile_id IN (SELECT mb.profile_id FROM members AS mb)
    ORDER BY ui.profile_id, ui.created_at DESC, ui.id DESC
  ),
  listed AS (
    SELECT mb.*,
           pos.name AS pos_name,
           pos.rank_tier AS pos_tier,
           CASE WHEN pos.id IS NULL THEN NULL ELSE coalesce(pm.sort_order, pos.sort_order) END AS pos_sort,
           dep.key AS dep_key,
           dep.label AS dep_label,
           tr.direction AS tr_direction,
           tr.other_vessel AS tr_vessel,
           nullif(upper(btrim(coalesce(lc.status_code, ''))), '') AS day_code
    FROM members AS mb
    LEFT JOIN public.positions AS pos ON pos.id = mb.pid
    LEFT JOIN public.position_manning AS pm ON pm.vessel_id = p_vessel_id AND pm.position_id = mb.pid
    LEFT JOIN LATERAL (
      SELECT d.key, d.label
      FROM public.departments AS d
      WHERE d.key = pos.department_key
         OR (pos.department_key IS NULL AND d.is_active
             AND (d.key = public.record_normalise_office(mb.department_text)
                  OR public.record_normalise_office(d.label) = public.record_normalise_office(mb.department_text)))
      ORDER BY (d.key = pos.department_key) DESC NULLS LAST, d.sort_order
      LIMIT 1
    ) AS dep ON true
    LEFT JOIN transfers AS tr ON tr.profile_id = mb.profile_id
    LEFT JOIN LATERAL (
      SELECT e.status_code
      FROM public.crew_leave_entries AS e
      WHERE mb.user_id IS NOT NULL AND e.crew_id = mb.user_id AND e.date = v_on AND e.company_id = v_company
      LIMIT 1
    ) AS lc ON true
  )
  SELECT r.profile_id,
         r.user_id,
         p.first_name,
         p.last_name,
         p.preferred_name,
         p.avatar_url,
         CASE WHEN v_email OR p.id = v_me THEN p.email ELSE NULL END,
         r.pid,
         r.pos_name,
         r.position_text,
         r.dep_key,
         r.dep_label,
         r.pos_tier,
         r.pos_sort,
         r.assignment_id,
         r.placement_kind,
         r.join_date,
         r.leave_date,
         s.status,
         CASE s.status
           WHEN 'on_transfer' THEN r.tr_direction
           WHEN 'pending' THEN r.placement_kind
           WHEN 'on_leave' THEN 'leave'
           ELSE NULL
         END,
         CASE WHEN s.status = 'on_transfer' THEN r.tr_vessel ELSE NULL END,
         r.day_code,
         (r.user_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.frp_travel_movements AS f
           WHERE f.company_id = v_company
             AND f.crew_user_id = r.user_id
             AND (f.vessel_id IS NULL OR f.vessel_id = p_vessel_id)
             AND coalesce(f.changeover_date, (f.flight_datetime AT TIME ZONE 'UTC')::date) = v_on
         )),
         CASE
           WHEN p.user_id IS NULL THEN 'pending_login'
           WHEN lower(btrim(coalesce(p.account_status, ''))) IN ('disabled', 'deactivated') THEN 'disabled'
           ELSE 'active'
         END,
         p.account_status,
         inv.id,
         inv.status,
         inv.expires_at,
         inv.last_sent_at,
         inv.last_error_code,
         p.nationality,
         (coalesce(public.record_normalise_office(r.position_text) IN ('master', 'captain'), false)
          OR coalesce(public.record_normalise_office(r.rank_text) IN ('master', 'captain'), false))
  FROM listed AS r
  JOIN public.profiles AS p ON p.id = r.profile_id
  CROSS JOIN LATERAL (SELECT public.crew_status_decide(r.tr_direction IS NOT NULL, r.placement_kind, r.day_code, NULL) AS status) AS s
  LEFT JOIN invitations AS inv ON inv.profile_id = r.profile_id
  ORDER BY r.pos_sort NULLS LAST, lower(p.last_name), lower(p.first_name), r.profile_id;
END;
$$;

-- A vessel's crew movements between two days (gap/04 C9), newest first:
-- the stored crew_movements rows, plus an embark on each assignment's join
-- (else start) date and a disembark on its leave (else end) date that fall
-- in the range, unless a stored row already records it (same assignment
-- as its source, or the same person, day and direction). Gate as
-- crew_vessel_list (crew_list.view, no external viewer); 22023
-- range_required, range_invalid (to before from), range_too_long (more
-- than three years).
CREATE OR REPLACE FUNCTION public.crew_vessel_movements(p_vessel_id uuid, p_from date, p_to date)
RETURNS TABLE (
  movement_id uuid,
  profile_id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  preferred_name text,
  position_text text,
  kind text,
  occurred_on date,
  occurred_at timestamptz,
  port text,
  source text,
  source_id uuid,
  notes text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company uuid;
BEGIN
  v_company := public.crew_vessel_gate('vessel.crew.crew_list.view', p_vessel_id, 'You can''t see the crew of this vessel.');
  IF public.crew_caller_is_external() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crew_not_permitted', DETAIL = 'You can''t see the crew of this vessel.';
  END IF;
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_required', DETAIL = 'Choose a start and an end date.';
  END IF;
  IF p_to < p_from THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_invalid', DETAIL = 'The end date is before the start date.';
  END IF;
  IF p_to > (p_from + interval '3 years')::date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'range_too_long', DETAIL = 'Choose a range of three years or less.';
  END IF;

  RETURN QUERY
  WITH stored AS (
    SELECT cm.id, cm.profile_id, cm.kind, cm.occurred_on, cm.occurred_at, cm.port, cm.source, cm.source_id, cm.notes,
           NULL::text AS title
    FROM public.crew_movements AS cm
    WHERE cm.vessel_id = p_vessel_id AND cm.company_id = v_company
      AND cm.occurred_on BETWEEN p_from AND p_to
  ),
  derived AS (
    SELECT NULL::uuid AS id, p.id AS profile_id, 'embark'::text AS kind, coalesce(ca.join_date, ca.start_date) AS occurred_on,
           NULL::timestamptz AS occurred_at, NULL::text AS port, 'assignment'::text AS source, ca.id AS source_id, NULL::text AS notes,
           nullif(btrim(coalesce(nullif(btrim(ca.position), ''), ca.rank)), '') AS title
    FROM public.crew_assignments AS ca
    JOIN public.profiles AS p ON p.user_id = ca.user_id AND p.company_id = v_company
    WHERE ca.vessel_id = p_vessel_id
      AND coalesce(ca.join_date, ca.start_date) BETWEEN p_from AND p_to
    UNION ALL
    SELECT NULL::uuid, p.id, 'disembark'::text, coalesce(ca.leave_date, ca.end_date),
           NULL::timestamptz, NULL::text, 'assignment'::text, ca.id, NULL::text,
           nullif(btrim(coalesce(nullif(btrim(ca.position), ''), ca.rank)), '')
    FROM public.crew_assignments AS ca
    JOIN public.profiles AS p ON p.user_id = ca.user_id AND p.company_id = v_company
    WHERE ca.vessel_id = p_vessel_id
      AND coalesce(ca.leave_date, ca.end_date) BETWEEN p_from AND p_to
  ),
  merged AS (
    SELECT * FROM stored
    UNION ALL
    SELECT d.* FROM derived AS d
    WHERE NOT EXISTS (
      SELECT 1 FROM stored AS s
      WHERE s.source_id = d.source_id
         OR (s.profile_id = d.profile_id AND s.occurred_on = d.occurred_on
             AND (s.kind IN ('embark', 'transfer_in')) = (d.kind IN ('embark', 'transfer_in')))
    )
  )
  SELECT mv.id,
         mv.profile_id,
         p.user_id,
         p.first_name,
         p.last_name,
         p.preferred_name,
         coalesce(mv.title, (
           SELECT nullif(btrim(coalesce(nullif(btrim(ca.position), ''), ca.rank)), '')
           FROM public.crew_assignments AS ca
           WHERE ca.vessel_id = p_vessel_id AND ca.user_id = p.user_id
           ORDER BY coalesce(ca.join_date, ca.start_date) DESC NULLS LAST, ca.id
           LIMIT 1
         )),
         mv.kind,
         mv.occurred_on,
         mv.occurred_at,
         mv.port,
         mv.source,
         mv.source_id,
         mv.notes
  FROM merged AS mv
  JOIN public.profiles AS p ON p.id = mv.profile_id
  ORDER BY mv.occurred_on DESC, mv.occurred_at DESC NULLS LAST, mv.kind, lower(p.last_name), mv.profile_id;
END;
$$;

-- ---------------------------------------------------------------- RLS

ALTER TABLE public.crew_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_transfers ENABLE ROW LEVEL SECURITY;

-- Movements: company members holding crew_list.view on the vessel; never an
-- external viewer. The caller-only parts are hoisted (D-229).
DROP POLICY IF EXISTS crew_movements_select_crew_list ON public.crew_movements;
CREATE POLICY crew_movements_select_crew_list ON public.crew_movements
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_company((SELECT auth.uid()), company_id)
    AND NOT (SELECT public.crew_caller_is_external())
    AND vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.crew_list.view'))
  );

-- Transfers: holders of crew_assignments.view on either vessel, or the
-- person themselves (my_profile_id() answers NULL for an inactive caller);
-- never an external viewer.
DROP POLICY IF EXISTS crew_transfers_select_scoped ON public.crew_transfers;
CREATE POLICY crew_transfers_select_scoped ON public.crew_transfers
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_company((SELECT auth.uid()), company_id)
    AND NOT (SELECT public.crew_caller_is_external())
    AND (
      from_vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.crew_assignments.view'))
      OR to_vessel_id IN (SELECT public.crew_cap_vessel_ids('vessel.crew.crew_assignments.view'))
      OR profile_id = (SELECT public.my_profile_id())
    )
  );

-- ---------------------------------------------------------------- grants

-- Reads only for the browser (writes go through X1 definers); nothing for anon.
REVOKE ALL ON TABLE public.crew_movements, public.crew_transfers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.crew_movements, public.crew_transfers TO authenticated;
GRANT ALL ON TABLE public.crew_movements, public.crew_transfers TO service_role;

-- Trigger functions: nobody calls them.
REVOKE ALL ON FUNCTION public.crew_movements_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_transfers_scope_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_transfers_guard() FROM PUBLIC, anon, authenticated, service_role;

-- The policy helper and the two RPCs.
REVOKE ALL ON FUNCTION public.crew_caller_is_external() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_caller_is_external() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_vessel_list(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_vessel_list(uuid, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_vessel_movements(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_vessel_movements(uuid, date, date) TO authenticated, service_role;

-- Internal: definers (and the service role) only.
REVOKE ALL ON FUNCTION public.crew_status_decide(boolean, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_status_decide(boolean, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.crew_vessel_members(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crew_vessel_members(uuid, date) TO service_role;

COMMENT ON FUNCTION public.crew_status_decide(boolean, text, text, text) IS 'A crew member''s status on a vessel on a day (gap/04 W2), first match wins: on_transfer (a scheduled transfer covers the day) > pending (planned or pending placement) > on_leave (a day code other than F or T, trimmed and upper-cased) > ashore (last In/Out event out) > on_board. Pure; mirrored by crewStatusDecide() in src/modules/crew/lib/crewStatus.ts (parity: src/test/crew/fixtures/crewStatusCases.json).';
COMMENT ON FUNCTION public.crew_vessel_members(uuid, date) IS 'Internal (definers, service role): the crew of a vessel on a day, one row per person: current assignments (D-227 at that day; planned when the join date is later), and pending placements of the vessel''s company (imported_vessel_id, no current assignment for the login; position, else rank, else Crew; joining date, else created date, D-225). The canonical current-crew helper (D-X1-22).';
COMMENT ON FUNCTION public.crew_caller_is_external() IS 'X1 caller-only helper (D-229): true when the caller is an external viewer of their company, and also without a JWT or for an inactive caller (fail closed). Policies use NOT (SELECT crew_caller_is_external()); the crew RPCs refuse an external viewer with it.';
COMMENT ON FUNCTION public.crew_vessel_list(uuid, date) IS 'The vessel''s crew list on a day (gap/04 C3, C4, C7; D-X1-8, T-306): who is on it (crew_vessel_members), position and department, the vessel''s rank order, derived status with detail, travel today, login state and the newest invitation. Gate: vessel.crew.crew_list.view on the vessel, no external viewer (P0002 unknown vessel, 42501); 22023 as_at_out_of_range beyond two years from today. Email only with vessel.crew.crew_profiles.view (or the caller''s own row).';
COMMENT ON FUNCTION public.crew_vessel_movements(uuid, date, date) IS 'A vessel''s crew movements in a date range (gap/04 C9): stored crew_movements plus embark / disembark derived from assignment join and leave dates, de-duplicated against the stored rows. Gate as crew_vessel_list; 22023 range_required / range_invalid / range_too_long (three years at most).';
COMMENT ON FUNCTION public.crew_movements_scope_guard() IS 'Trigger crew_movements_scope_guard (every writer): a movement names a vessel and a person of its own company (23514 crew_movement_scope_mismatch).';
COMMENT ON FUNCTION public.crew_transfers_scope_guard() IS 'Trigger crew_transfers_scope_guard (every writer): a transfer moves a person of its company between two vessels of the same company (23514 crew_transfer_scope_mismatch).';
COMMENT ON FUNCTION public.crew_transfers_guard() IS 'Trigger crew_transfers_guard: for a signed-in writer without storm.crew_engine = ''on'', an insert is a draft with no decision, an update leaves the status and decision columns as they are, and only a draft may be deleted (42501 crew_transfer_engine_only). Service role and no-JWT maintenance exempt.';

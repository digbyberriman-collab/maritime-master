-- =================================================================
-- ISM Forms: server-side signature workflow, numbering and statuses
-- =================================================================
-- Findings H5 and H6 of docs/SYSTEM-AUDIT-2026-09-19.md.
--
-- The ISM form workflow (form_templates / form_submissions /
-- form_signatures) lived entirely in the client. What that meant in
-- practice, all verified against the live database:
--
--   1. form_submissions had an UPDATE policy with no WITH CHECK and no
--      column or status guard, so the crew member who created a
--      checklist could set status = 'SIGNED' on it directly, unlock a
--      locked form, rewrite form_data after signing, rewrite the
--      integrity hash to match, or move the row to another company.
--      Nothing on the server said otherwise: canTransition() and the
--      "all signatures collected" check in useFormSubmissions.ts were
--      the only gate, and a signed ISM record is exactly the artefact a
--      flag-state or class audit relies on.
--   2. form_signatures had no INSERT policy at all, so the sign path
--      could never have worked; its UPDATE policy was USING-only
--      (signer_user_id = auth.uid()) with no WITH CHECK, so a signer
--      could reassign their own signature row to another user or
--      rewrite the name and role recorded against it.
--   3. signer identity was whatever the client sent: signer_name,
--      signer_role and signature_order all came from the browser, and
--      signature_order was picked as max(existing) + 1, so signing
--      order was advisory.
--   4. submission_number came from a trigger that read
--      MAX(split_part(submission_number,'-',3)) + 1 with no lock, so
--      two concurrent inserts produce the same number and one fails on
--      the UNIQUE; and with a hyphen in template_code, part 3 is the
--      date, so the counter jumps to 20260919.
--   5. status had no CHECK on any of the three tables and three
--      vocabularies in use at once. Live rows are 'PUBLISHED' and
--      'ARCHIVED', but DraftTemplates read 'draft' and published to
--      'active', FormsArchive / FormSchedules / FormExports read
--      'active', and get_vessel_dashboard_summary counted
--      'pending_signatures'. Every one of those is permanently empty.
--
-- This migration moves the workflow into the database: identity, role,
-- order and transitions are decided server-side, signatures become
-- append-only through two RPCs, numbering becomes atomic, and the
-- status vocabulary gets CHECK constraints so a fourth spelling cannot
-- be introduced silently.
--
-- The three sms_* signature tables are the same feature against a
-- parallel schema; they hold no rows, nothing imports the hook, and the
-- hook is deleted in this change rather than hardened twice.
-- =================================================================

-- ---------------------------------------------------------------
-- 1. Status vocabulary
-- ---------------------------------------------------------------
-- Normalise first so the constraints can be validated. Live data is
-- already correct; these statements exist so the migration is safe on
-- any database where a client wrote one of the other spellings.
UPDATE public.form_templates SET status = CASE upper(coalesce(status, 'DRAFT'))
  WHEN 'ACTIVE' THEN 'PUBLISHED'
  WHEN 'PUBLISH' THEN 'PUBLISHED'
  WHEN 'UNDER_REVIEW' THEN 'DRAFT'
  ELSE upper(coalesce(status, 'DRAFT')) END
WHERE status IS NULL OR status <> CASE upper(coalesce(status, 'DRAFT'))
  WHEN 'ACTIVE' THEN 'PUBLISHED'
  WHEN 'PUBLISH' THEN 'PUBLISHED'
  WHEN 'UNDER_REVIEW' THEN 'DRAFT'
  ELSE upper(coalesce(status, 'DRAFT')) END;

UPDATE public.form_templates SET status = 'DRAFT'
WHERE status NOT IN ('DRAFT', 'PUBLISHED', 'ARCHIVED');

ALTER TABLE public.form_templates
  ALTER COLUMN status SET DEFAULT 'DRAFT',
  ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.form_templates DROP CONSTRAINT IF EXISTS form_templates_status_check;
ALTER TABLE public.form_templates
  ADD CONSTRAINT form_templates_status_check
  CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));

UPDATE public.form_submissions SET status = CASE upper(coalesce(status, 'DRAFT'))
  WHEN 'PENDING_SIGNATURES' THEN 'PENDING_SIGNATURE'
  WHEN 'COMPLETED' THEN 'SIGNED'
  WHEN 'ACTIVE' THEN 'IN_PROGRESS'
  ELSE upper(coalesce(status, 'DRAFT')) END;

UPDATE public.form_submissions SET status = 'DRAFT'
WHERE status NOT IN ('DRAFT', 'IN_PROGRESS', 'PENDING_SIGNATURE', 'SIGNED', 'REJECTED', 'AMENDED', 'ARCHIVED');

ALTER TABLE public.form_submissions
  ALTER COLUMN status SET DEFAULT 'DRAFT',
  ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.form_submissions DROP CONSTRAINT IF EXISTS form_submissions_status_check;
ALTER TABLE public.form_submissions
  ADD CONSTRAINT form_submissions_status_check
  CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'PENDING_SIGNATURE', 'SIGNED', 'REJECTED', 'AMENDED', 'ARCHIVED'));

UPDATE public.form_signatures SET status = upper(coalesce(status, 'PENDING'));
UPDATE public.form_signatures SET status = 'PENDING'
WHERE status NOT IN ('PENDING', 'SIGNED', 'REJECTED', 'DELEGATED');

ALTER TABLE public.form_signatures
  ALTER COLUMN status SET DEFAULT 'PENDING',
  ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.form_signatures DROP CONSTRAINT IF EXISTS form_signatures_status_check;
ALTER TABLE public.form_signatures
  ADD CONSTRAINT form_signatures_status_check
  CHECK (status IN ('PENDING', 'SIGNED', 'REJECTED', 'DELEGATED'));

ALTER TABLE public.form_signatures DROP CONSTRAINT IF EXISTS form_signatures_type_check;
ALTER TABLE public.form_signatures
  ADD CONSTRAINT form_signatures_type_check
  CHECK (signature_type IS NULL OR signature_type IN ('TYPED', 'DRAWN', 'PIN', 'BIOMETRIC', 'SSO'));

-- ---------------------------------------------------------------
-- 2. Signer roles
-- ---------------------------------------------------------------
-- Template required_signers[].role was free text, and the client
-- matched it against profiles.rank ("2nd Officer", "Bosun", and for one
-- master, "Cook"). Live templates ask for 'Captain', 'Chief_Officer' and
-- 'Crew', none of which is a rank or a role value, so no submission
-- could ever be matched to a signer. Canonicalise onto the role
-- vocabularies the rest of the database authorises with: profiles.role
-- (user_role) and user_roles.role (app_role).
CREATE OR REPLACE FUNCTION public.form_normalize_signer_role(p_role text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE trim(both '_' from regexp_replace(lower(coalesce(p_role, '')), '[^a-z0-9]+', '_', 'g'))
    WHEN 'captain' THEN 'master'
    WHEN 'cpt' THEN 'master'
    WHEN 'skipper' THEN 'master'
    WHEN 'fleet_master' THEN 'master'
    WHEN 'masters' THEN 'master'
    WHEN 'chief_mate' THEN 'chief_officer'
    WHEN 'first_officer' THEN 'chief_officer'
    WHEN '1st_officer' THEN 'chief_officer'
    WHEN 'mate' THEN 'chief_officer'
    WHEN 'chief_eng' THEN 'chief_engineer'
    WHEN 'ce' THEN 'chief_engineer'
    WHEN 'designated_person_ashore' THEN 'dpa'
    WHEN 'shore' THEN 'shore_management'
    WHEN 'office' THEN 'shore_management'
    WHEN 'management' THEN 'shore_management'
    WHEN 'crew_member' THEN 'crew'
    WHEN '' THEN 'crew'
    ELSE trim(both '_' from regexp_replace(lower(coalesce(p_role, '')), '[^a-z0-9]+', '_', 'g'))
  END;
$$;
COMMENT ON FUNCTION public.form_normalize_signer_role(text) IS
  'Canonical signer role for ISM forms. Captain and Master are the same office at sea, so both normalise to master.';

-- A superadmin is deliberately not a universal signer: the point of the
-- signature is who attested, not who could.
CREATE OR REPLACE FUNCTION public.form_user_satisfies_signer_role(p_user_id uuid, p_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    -- A "crew" slot is the crew member the form concerns, so any
    -- company member can fill it. Every other slot needs the role.
    WHEN public.form_normalize_signer_role(p_role) = 'crew' THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = p_user_id
        AND public.form_normalize_signer_role(p.role::text) = public.form_normalize_signer_role(p_role)
    ) OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p_user_id
        AND public.form_normalize_signer_role(ur.role::text) = public.form_normalize_signer_role(p_role)
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.form_user_satisfies_signer_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.form_user_satisfies_signer_role(uuid, text) TO authenticated, service_role;

-- Rewrite the stored requirements to the canonical spelling so the
-- template editor, the pending queue and the sign check all read the
-- same values.
UPDATE public.form_templates t
SET required_signers = s.rewritten
FROM (
  SELECT t2.id,
         coalesce(jsonb_agg(
           CASE WHEN jsonb_typeof(e.value) = 'object'
                THEN jsonb_set(e.value, '{role}',
                               to_jsonb(public.form_normalize_signer_role(e.value ->> 'role')))
                ELSE e.value
           END
           ORDER BY e.ord
         ), '[]'::jsonb) AS rewritten
  FROM public.form_templates t2
  CROSS JOIN LATERAL jsonb_array_elements(t2.required_signers) WITH ORDINALITY AS e(value, ord)
  WHERE jsonb_typeof(t2.required_signers) = 'array'
  GROUP BY t2.id
) s
WHERE s.id = t.id AND s.rewritten <> t.required_signers;

ALTER TABLE public.form_templates
  ALTER COLUMN required_signers SET DEFAULT '[]'::jsonb;
UPDATE public.form_templates SET required_signers = '[]'::jsonb
WHERE required_signers IS NULL OR jsonb_typeof(required_signers) <> 'array';
ALTER TABLE public.form_templates ALTER COLUMN required_signers SET NOT NULL;

-- ---------------------------------------------------------------
-- 3. Race-free submission numbers
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_submission_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  year integer NOT NULL,
  next_value integer NOT NULL DEFAULT 1,
  PRIMARY KEY (company_id, template_id, year)
);

-- The counter is an implementation detail of the numbering function.
-- RLS on with no policy means nothing but a SECURITY DEFINER function
-- can read or write it.
ALTER TABLE public.form_submission_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.form_submission_counters FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.form_next_submission_number(
  p_company_id uuid,
  p_template_id uuid,
  p_created_date date
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text;
  v_seq integer;
  v_date date := coalesce(p_created_date, current_date);
BEGIN
  SELECT ft.template_code INTO v_code
  FROM public.form_templates ft WHERE ft.id = p_template_id;

  -- One statement, so two concurrent inserts serialise on the primary
  -- key rather than both reading the same maximum.
  INSERT INTO public.form_submission_counters (company_id, template_id, year, next_value)
  VALUES (p_company_id, p_template_id, extract(year from v_date)::integer, 2)
  ON CONFLICT (company_id, template_id, year)
  DO UPDATE SET next_value = public.form_submission_counters.next_value + 1
  RETURNING next_value - 1 INTO v_seq;

  RETURN coalesce(nullif(v_code, ''), 'FORM')
         || '-' || to_char(v_date, 'YYYYMMDD')
         || '-' || lpad(v_seq::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.form_next_submission_number(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

-- Kept in place so that if the original BEFORE INSERT trigger is ever
-- recreated (the schema is also edited through Lovable), it gets the
-- atomic body rather than the max()+1 one.
CREATE OR REPLACE FUNCTION public.generate_form_submission_number()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.submission_number IS NULL OR NEW.submission_number = '' THEN
    NEW.submission_number := public.form_next_submission_number(
      NEW.company_id, NEW.template_id, NEW.created_date);
  END IF;
  RETURN NEW;
END;
$$;

-- The old trigger was conditional on submission_number being empty, so
-- a client could supply its own. Numbering now happens unconditionally
-- inside form_submissions_before_write.
DROP TRIGGER IF EXISTS generate_submission_number ON public.form_submissions;

-- Numbers are scoped per company, so the global unique was wrong as
-- well as unnecessary.
ALTER TABLE public.form_submissions DROP CONSTRAINT IF EXISTS form_submissions_submission_number_key;
ALTER TABLE public.form_submissions DROP CONSTRAINT IF EXISTS form_submissions_company_number_key;
ALTER TABLE public.form_submissions
  ADD CONSTRAINT form_submissions_company_number_key UNIQUE (company_id, submission_number);

-- ---------------------------------------------------------------
-- 4. Signing cycles
-- ---------------------------------------------------------------
-- A rejected form goes back for correction and is signed again. The old
-- unique key (submission, signer, order) meant the second round
-- collided with the first, and deleting the first round to make room
-- would throw away the audit trail an ISM record exists for. Number the
-- rounds instead and keep every signature.
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS signing_cycle integer NOT NULL DEFAULT 1;
ALTER TABLE public.form_signatures
  ADD COLUMN IF NOT EXISTS signing_cycle integer NOT NULL DEFAULT 1;

ALTER TABLE public.form_signatures
  DROP CONSTRAINT IF EXISTS form_signatures_submission_id_signer_user_id_signature_ord_key;
ALTER TABLE public.form_signatures
  DROP CONSTRAINT IF EXISTS form_signatures_submission_id_signer_user_id_sign;
ALTER TABLE public.form_signatures
  DROP CONSTRAINT IF EXISTS form_signatures_cycle_signer_key;
ALTER TABLE public.form_signatures
  ADD CONSTRAINT form_signatures_cycle_signer_key
  UNIQUE (submission_id, signing_cycle, signer_user_id, signature_order);

CREATE INDEX IF NOT EXISTS idx_form_signatures_cycle
  ON public.form_signatures (submission_id, signing_cycle, signature_order);

-- ---------------------------------------------------------------
-- 5. Submission write guard
-- ---------------------------------------------------------------
-- Everything the client used to decide for itself. Runs as the table
-- owner so it can read the template and the caller's roles regardless
-- of the caller's own visibility.
CREATE OR REPLACE FUNCTION public.form_submissions_before_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_privileged boolean := false;
  v_signing boolean := coalesce(current_setting('storm.form_signing', true), 'off') = 'on';
  v_mandatory integer := 0;
BEGIN
  IF v_uid IS NOT NULL THEN
    v_privileged :=
      public.has_any_role(v_uid, ARRAY['dpa', 'fleet_master', 'superadmin']::app_role[])
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = v_uid
          AND p.role::text IN ('dpa', 'shore_management', 'master')
      );
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_uid IS NOT NULL THEN
      -- The INSERT policy already requires this; setting it removes the
      -- chance of a mismatch between the two.
      NEW.created_by := v_uid;
      NEW.company_id := coalesce(NEW.company_id, public.get_user_company_id(v_uid));
      -- A submission starts as a draft. Seeding a finished record is a
      -- service-role operation, not something a session can do.
      IF NEW.status IS NULL OR NEW.status NOT IN ('DRAFT', 'IN_PROGRESS') THEN
        NEW.status := 'DRAFT';
      END IF;
      NEW.is_locked := false;
      NEW.locked_at := NULL;
      NEW.submitted_at := NULL;
      NEW.submitted_by := NULL;
      NEW.signing_cycle := 1;
    END IF;

    NEW.created_date := coalesce(NEW.created_date, current_date);
    NEW.created_time_utc := coalesce(NEW.created_time_utc, now());
    NEW.form_data := coalesce(NEW.form_data, '{}'::jsonb);
    NEW.submission_number := public.form_next_submission_number(
      NEW.company_id, NEW.template_id, NEW.created_date);
    NEW.content_hash := encode(sha256(convert_to(NEW.form_data::text, 'UTF8')), 'hex');
    RETURN NEW;
  END IF;

  -- ---- UPDATE ----

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'A submission cannot be moved to another company';
  END IF;

  -- Identity and numbering are fixed for the life of the record.
  NEW.submission_number := OLD.submission_number;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.created_time_utc := OLD.created_time_utc;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'ARCHIVED' THEN
      RAISE EXCEPTION 'Submission % is archived and cannot change status', OLD.submission_number;
    ELSIF NEW.status = 'ARCHIVED' THEN
      IF v_uid IS NOT NULL AND NOT v_privileged THEN
        RAISE EXCEPTION 'Only the DPA, fleet management or the master can archive a submission';
      END IF;
    ELSIF NEW.status = 'SIGNED' THEN
      IF NOT v_signing THEN
        RAISE EXCEPTION
          'Submission % is signed by recording signatures, not by setting its status: call form_sign_submission',
          OLD.submission_number;
      END IF;
      IF OLD.status <> 'PENDING_SIGNATURE' THEN
        RAISE EXCEPTION 'Submission % is % and cannot become SIGNED', OLD.submission_number, OLD.status;
      END IF;
    ELSIF NEW.status = 'REJECTED' THEN
      IF NOT v_signing AND v_uid IS NOT NULL AND NOT v_privileged THEN
        RAISE EXCEPTION
          'Submission % is rejected through form_reject_submission so the reason is recorded',
          OLD.submission_number;
      END IF;
      IF OLD.status <> 'PENDING_SIGNATURE' THEN
        RAISE EXCEPTION 'Only a submission awaiting signature can be rejected (% is %)',
          OLD.submission_number, OLD.status;
      END IF;
    ELSIF NEW.status = 'PENDING_SIGNATURE' THEN
      IF OLD.status NOT IN ('DRAFT', 'IN_PROGRESS', 'REJECTED') THEN
        RAISE EXCEPTION 'Submission % is % and cannot be submitted for signature',
          OLD.submission_number, OLD.status;
      END IF;
    ELSIF NEW.status = 'AMENDED' THEN
      IF OLD.status <> 'SIGNED' THEN
        RAISE EXCEPTION 'Only a signed submission can be superseded by an amendment (% is %)',
          OLD.submission_number, OLD.status;
      END IF;
    ELSIF NEW.status IN ('DRAFT', 'IN_PROGRESS') THEN
      IF OLD.status NOT IN ('DRAFT', 'IN_PROGRESS', 'REJECTED') THEN
        RAISE EXCEPTION 'Submission % is % and cannot go back to %',
          OLD.submission_number, OLD.status, NEW.status;
      END IF;
    ELSE
      RAISE EXCEPTION 'Unknown submission status %', NEW.status;
    END IF;
  END IF;

  -- Content is frozen once the form leaves the crew member's hands.
  IF OLD.is_locked OR OLD.status NOT IN ('DRAFT', 'IN_PROGRESS', 'REJECTED') THEN
    IF NEW.form_data IS DISTINCT FROM OLD.form_data
       OR NEW.line_items IS DISTINCT FROM OLD.line_items
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.template_version IS DISTINCT FROM OLD.template_version
       OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id
       OR NEW.created_date IS DISTINCT FROM OLD.created_date THEN
      RAISE EXCEPTION 'Submission % is locked (%); correct it by raising an amendment',
        OLD.submission_number, OLD.status;
    END IF;
  END IF;

  IF OLD.is_locked AND NOT coalesce(NEW.is_locked, false) THEN
    IF NOT v_signing AND NEW.status <> 'REJECTED' AND v_uid IS NOT NULL AND NOT v_privileged THEN
      RAISE EXCEPTION 'Only the DPA, fleet management or the master can unlock submission %',
        OLD.submission_number;
    END IF;
  END IF;

  -- The hash is a property of the content, never an input.
  IF NEW.form_data IS DISTINCT FROM OLD.form_data THEN
    NEW.content_hash := encode(sha256(convert_to(coalesce(NEW.form_data, '{}'::jsonb)::text, 'UTF8')), 'hex');
  ELSE
    NEW.content_hash := OLD.content_hash;
  END IF;

  IF NEW.status = 'PENDING_SIGNATURE' AND OLD.status <> 'PENDING_SIGNATURE' THEN
    NEW.submitted_at := now();
    NEW.submitted_by := coalesce(v_uid, OLD.submitted_by, OLD.created_by);
    NEW.is_locked := true;
    NEW.locked_at := now();
    -- A resubmission after rejection starts a new round of signatures.
    IF OLD.status = 'REJECTED' THEN
      NEW.signing_cycle := OLD.signing_cycle + 1;
    ELSE
      NEW.signing_cycle := OLD.signing_cycle;
    END IF;

    SELECT count(*) INTO v_mandatory
    FROM public.form_templates ft
    CROSS JOIN LATERAL jsonb_array_elements(ft.required_signers) AS e(value)
    WHERE ft.id = NEW.template_id
      AND coalesce((e.value ->> 'is_mandatory')::boolean, true);

    -- Nothing to wait for, so do not park it in a queue no one can clear.
    IF v_mandatory = 0 THEN
      NEW.status := 'SIGNED';
    END IF;
  ELSE
    NEW.signing_cycle := OLD.signing_cycle;
  END IF;

  IF NEW.status = 'REJECTED' AND OLD.status <> 'REJECTED' THEN
    NEW.is_locked := false;
    NEW.locked_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_form_submissions_before_write ON public.form_submissions;
CREATE TRIGGER trg_form_submissions_before_write
  BEFORE INSERT OR UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.form_submissions_before_write();

-- ---------------------------------------------------------------
-- 6. Signing and rejection
-- ---------------------------------------------------------------
-- Signatures are append-only and are only ever written by these two
-- functions, so the signer, the role they signed in and the position in
-- the order are facts the server established, not values a client sent.

-- The requirements of a submission's template, flattened, with the
-- current round's signatures resolved against them.
CREATE OR REPLACE FUNCTION public.form_signature_requirements(p_submission_id uuid)
RETURNS TABLE (
  signature_order integer,
  signer_role text,
  is_mandatory boolean,
  signed boolean,
  signed_by uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT req.ord_value,
         public.form_normalize_signer_role(req.role_value),
         req.mandatory,
         sig.id IS NOT NULL,
         sig.signer_user_id
  FROM public.form_submissions fs
  JOIN public.form_templates ft ON ft.id = fs.template_id
  CROSS JOIN LATERAL (
    SELECT coalesce((e.value ->> 'order')::integer, e.ord::integer) AS ord_value,
           e.value ->> 'role' AS role_value,
           coalesce((e.value ->> 'is_mandatory')::boolean, true) AS mandatory
    FROM jsonb_array_elements(ft.required_signers) WITH ORDINALITY AS e(value, ord)
  ) req
  LEFT JOIN public.form_signatures sig
    ON sig.submission_id = fs.id
   AND sig.signing_cycle = fs.signing_cycle
   AND sig.signature_order = req.ord_value
   AND sig.status = 'SIGNED'
  WHERE fs.id = p_submission_id
  ORDER BY req.ord_value;
$$;
REVOKE ALL ON FUNCTION public.form_signature_requirements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.form_signature_requirements(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.form_sign_submission(
  p_submission_id uuid,
  p_signature_data text DEFAULT NULL,
  p_signature_type text DEFAULT 'TYPED'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sub public.form_submissions;
  v_parallel boolean;
  v_order integer;
  v_role text;
  v_name text;
  v_rank text;
  v_type text := upper(coalesce(nullif(trim(p_signature_type), ''), 'TYPED'));
  v_blocking integer;
  v_outstanding integer;
  v_sig_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_type NOT IN ('TYPED', 'DRAWN', 'PIN', 'BIOMETRIC', 'SSO') THEN
    v_type := 'TYPED';
  END IF;

  SELECT * INTO v_sub FROM public.form_submissions WHERE id = p_submission_id;
  -- Same message either way: whether a submission exists in another
  -- company is not the caller's business.
  IF NOT FOUND OR NOT public.user_belongs_to_company(v_uid, v_sub.company_id) THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;
  IF v_sub.status <> 'PENDING_SIGNATURE' THEN
    RAISE EXCEPTION 'Submission % is % and is not awaiting signature',
      v_sub.submission_number, v_sub.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.form_signatures s
    WHERE s.submission_id = p_submission_id
      AND s.signing_cycle = v_sub.signing_cycle
      AND s.signer_user_id = v_uid
      AND s.status = 'SIGNED'
  ) THEN
    RAISE EXCEPTION 'You have already signed submission %', v_sub.submission_number;
  END IF;

  SELECT coalesce(ft.allow_parallel_signing, false) INTO v_parallel
  FROM public.form_templates ft WHERE ft.id = v_sub.template_id;

  -- The earliest unsigned requirement this signer is entitled to fill.
  SELECT r.signature_order, r.signer_role INTO v_order, v_role
  FROM public.form_signature_requirements(p_submission_id) r
  WHERE NOT r.signed
    AND public.form_user_satisfies_signer_role(v_uid, r.signer_role)
  ORDER BY r.signature_order
  LIMIT 1;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Submission % does not require your signature', v_sub.submission_number;
  END IF;

  IF NOT v_parallel THEN
    SELECT count(*) INTO v_blocking
    FROM public.form_signature_requirements(p_submission_id) r
    WHERE r.is_mandatory AND NOT r.signed AND r.signature_order < v_order;
    IF v_blocking > 0 THEN
      RAISE EXCEPTION 'Submission % is signed in order and % earlier signature(s) are outstanding',
        v_sub.submission_number, v_blocking;
    END IF;
  END IF;

  SELECT nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.rank
    INTO v_name, v_rank
  FROM public.profiles p WHERE p.user_id = v_uid;

  IF v_name IS NULL THEN
    SELECT u.email INTO v_name FROM auth.users u WHERE u.id = v_uid;
  END IF;

  INSERT INTO public.form_signatures (
    submission_id, signing_cycle, signer_user_id, signer_name, signer_role, signer_rank,
    signature_order, signature_type, signature_data, signed_at, status
  ) VALUES (
    p_submission_id, v_sub.signing_cycle, v_uid,
    coalesce(v_name, v_uid::text), v_role, v_rank,
    v_order, v_type, nullif(left(coalesce(p_signature_data, ''), 200000), ''), now(), 'SIGNED'
  )
  RETURNING id INTO v_sig_id;

  SELECT count(*) INTO v_outstanding
  FROM public.form_signature_requirements(p_submission_id) r
  WHERE r.is_mandatory AND NOT r.signed;

  IF v_outstanding = 0 THEN
    -- The guard trigger refuses a client-set SIGNED; this is the one
    -- path allowed to set it, and the flag is cleared straight after so
    -- a second statement in the same transaction cannot ride on it.
    PERFORM set_config('storm.form_signing', 'on', true);
    UPDATE public.form_submissions SET status = 'SIGNED' WHERE id = p_submission_id;
    PERFORM set_config('storm.form_signing', 'off', true);
  END IF;

  RETURN jsonb_build_object(
    'signature_id', v_sig_id,
    'signature_order', v_order,
    'signer_role', v_role,
    'signing_cycle', v_sub.signing_cycle,
    'outstanding_signatures', v_outstanding,
    'submission_status', CASE WHEN v_outstanding = 0 THEN 'SIGNED' ELSE 'PENDING_SIGNATURE' END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.form_sign_submission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.form_sign_submission(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.form_reject_submission(
  p_submission_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sub public.form_submissions;
  v_order integer;
  v_role text;
  v_name text;
  v_rank text;
  v_privileged boolean;
  v_sig_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  SELECT * INTO v_sub FROM public.form_submissions WHERE id = p_submission_id;
  IF NOT FOUND OR NOT public.user_belongs_to_company(v_uid, v_sub.company_id) THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;
  IF v_sub.status <> 'PENDING_SIGNATURE' THEN
    RAISE EXCEPTION 'Submission % is % and is not awaiting signature',
      v_sub.submission_number, v_sub.status;
  END IF;

  SELECT r.signature_order, r.signer_role INTO v_order, v_role
  FROM public.form_signature_requirements(p_submission_id) r
  WHERE NOT r.signed
    AND public.form_user_satisfies_signer_role(v_uid, r.signer_role)
  ORDER BY r.signature_order
  LIMIT 1;

  IF v_order IS NULL THEN
    -- A signer rejects from their own slot. The DPA, fleet management or
    -- the master can also send a form back without being one.
    v_privileged :=
      public.has_any_role(v_uid, ARRAY['dpa', 'fleet_master', 'superadmin']::app_role[])
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = v_uid AND p.role::text IN ('dpa', 'shore_management', 'master')
      );
    IF NOT v_privileged THEN
      RAISE EXCEPTION 'Submission % does not require your signature', v_sub.submission_number;
    END IF;
    SELECT coalesce(max(r.signature_order), 0) + 1 INTO v_order
    FROM public.form_signature_requirements(p_submission_id) r;
    v_role := 'dpa';
  END IF;

  SELECT nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.rank
    INTO v_name, v_rank
  FROM public.profiles p WHERE p.user_id = v_uid;
  IF v_name IS NULL THEN
    SELECT u.email INTO v_name FROM auth.users u WHERE u.id = v_uid;
  END IF;

  INSERT INTO public.form_signatures (
    submission_id, signing_cycle, signer_user_id, signer_name, signer_role, signer_rank,
    signature_order, signature_type, signed_at, status, rejection_reason
  ) VALUES (
    p_submission_id, v_sub.signing_cycle, v_uid,
    coalesce(v_name, v_uid::text), v_role, v_rank,
    v_order, 'TYPED', now(), 'REJECTED', trim(p_reason)
  )
  ON CONFLICT (submission_id, signing_cycle, signer_user_id, signature_order)
  DO UPDATE SET status = 'REJECTED',
                rejection_reason = excluded.rejection_reason,
                signed_at = excluded.signed_at
  RETURNING id INTO v_sig_id;

  -- The trigger unlocks the form so the originator can correct it; the
  -- next submit starts signing cycle + 1, keeping this round's record.
  PERFORM set_config('storm.form_signing', 'on', true);
  UPDATE public.form_submissions
  SET status = 'REJECTED', requires_amendment = true
  WHERE id = p_submission_id;
  PERFORM set_config('storm.form_signing', 'off', true);

  RETURN jsonb_build_object(
    'signature_id', v_sig_id,
    'signature_order', v_order,
    'signing_cycle', v_sub.signing_cycle,
    'submission_status', 'REJECTED'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.form_reject_submission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.form_reject_submission(uuid, text) TO authenticated, service_role;

-- The submissions waiting on the caller, decided by the same rules as
-- form_sign_submission rather than by a filter in the browser that
-- compared the template's role against profiles.rank.
CREATE OR REPLACE FUNCTION public.form_pending_signatures()
RETURNS TABLE (submission_id uuid, next_signature_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  subs AS (
    SELECT fs.id, fs.signing_cycle, coalesce(ft.allow_parallel_signing, false) AS parallel
    FROM public.form_submissions fs
    JOIN public.form_templates ft ON ft.id = fs.template_id
    CROSS JOIN me
    WHERE fs.status = 'PENDING_SIGNATURE'
      AND me.uid IS NOT NULL
      AND public.user_belongs_to_company(me.uid, fs.company_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.form_signatures s
        WHERE s.submission_id = fs.id
          AND s.signing_cycle = fs.signing_cycle
          AND s.signer_user_id = me.uid
          AND s.status = 'SIGNED'
      )
  ),
  open_reqs AS (
    SELECT s.id, s.parallel, r.signature_order, r.signer_role, r.is_mandatory
    FROM subs s
    CROSS JOIN LATERAL public.form_signature_requirements(s.id) r
    WHERE NOT r.signed
  )
  SELECT DISTINCT ON (o.id) o.id, o.signature_order
  FROM open_reqs o
  CROSS JOIN me
  WHERE public.form_user_satisfies_signer_role(me.uid, o.signer_role)
    AND (
      o.parallel
      OR NOT EXISTS (
        SELECT 1 FROM open_reqs e
        WHERE e.id = o.id AND e.is_mandatory AND e.signature_order < o.signature_order
      )
    )
  ORDER BY o.id, o.signature_order;
$$;
REVOKE ALL ON FUNCTION public.form_pending_signatures() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.form_pending_signatures() TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 7. Policies and grants
-- ---------------------------------------------------------------
-- The UPDATE policy had a USING clause and no WITH CHECK, which is what
-- allowed the row to be written back with a different company_id.
DROP POLICY IF EXISTS "Users can update their own draft submissions" ON public.form_submissions;
CREATE POLICY "Users can update their own submissions"
  ON public.form_submissions FOR UPDATE TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      created_by = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'superadmin', 'captain']::app_role[])
    )
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      created_by = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'superadmin', 'captain']::app_role[])
    )
  );

-- There was no DELETE policy, so useDeleteSubmission's "delete draft"
-- silently affected no rows.
DROP POLICY IF EXISTS "Users can delete their own drafts" ON public.form_submissions;
CREATE POLICY "Users can delete their own drafts"
  ON public.form_submissions FOR DELETE TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND status IN ('DRAFT', 'IN_PROGRESS')
    AND NOT coalesce(is_locked, false)
    AND (
      created_by = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['dpa', 'fleet_master', 'superadmin']::app_role[])
    )
  );

-- Signatures are written only by form_sign_submission and
-- form_reject_submission. A signature that its signer can edit after
-- the fact is not evidence of anything, so the UPDATE policy goes and
-- the write privileges go with it.
DROP POLICY IF EXISTS "Users can sign their own signatures" ON public.form_signatures;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.form_signatures FROM authenticated;
REVOKE ALL ON TABLE public.form_signatures FROM anon;
REVOKE ALL ON TABLE public.form_submissions FROM anon;
REVOKE ALL ON TABLE public.form_templates FROM anon;
REVOKE ALL ON TABLE public.form_amendments FROM anon;
REVOKE ALL ON TABLE public.form_attachments FROM anon;
REVOKE ALL ON TABLE public.form_schedules FROM anon;

DROP POLICY IF EXISTS "form_signatures_anon_deny" ON public.form_signatures;
CREATE POLICY "form_signatures_anon_deny" ON public.form_signatures
  FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "form_submissions_anon_deny" ON public.form_submissions;
CREATE POLICY "form_submissions_anon_deny" ON public.form_submissions
  FOR ALL TO anon USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------
-- 8. Dashboard count
-- ---------------------------------------------------------------
-- get_vessel_dashboard_summary counts pending signatures as
-- status = 'pending_signatures', a spelling the column has never held,
-- so the tile on the vessel dashboard reads zero whatever is pending.
-- The function is also edited through Lovable, so patch the literal in
-- place rather than freezing a copy of the whole body here.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_vessel_dashboard_summary'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'get_vessel_dashboard_summary not present; nothing to patch';
  ELSIF position('''pending_signatures''' IN v_def) = 0 THEN
    RAISE NOTICE 'get_vessel_dashboard_summary already uses the PENDING_SIGNATURE spelling';
  ELSE
    EXECUTE replace(v_def, '''pending_signatures''', '''PENDING_SIGNATURE''');
    RAISE NOTICE 'get_vessel_dashboard_summary: pending signature count repointed to PENDING_SIGNATURE';
  END IF;
END $$;

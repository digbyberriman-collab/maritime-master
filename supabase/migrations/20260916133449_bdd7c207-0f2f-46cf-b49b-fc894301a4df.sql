CREATE OR REPLACE FUNCTION public.sync_crew_import_to_profiles(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  r record;
  v_email text;
  v_vessel_id uuid;
  v_profile_id uuid;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','purser']::app_role[]) THEN
    RAISE EXCEPTION 'Insufficient permissions to sync crew';
  END IF;

  v_company_id := COALESCE(p_company_id, public.get_user_company_id(auth.uid()));
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context for crew sync';
  END IF;

  FOR r IN
    SELECT * FROM public.crew_import
    WHERE is_archived IS NOT TRUE
    ORDER BY imported_at NULLS LAST
  LOOP
    IF COALESCE(NULLIF(TRIM(r.first_name), ''), NULLIF(TRIM(r.last_name), ''), NULLIF(TRIM(r.full_legal_name), '')) IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_email := LOWER(TRIM(COALESCE(
      NULLIF(TRIM(r.work_email), ''),
      NULLIF(TRIM(r.krakenfleet_email), ''),
      NULLIF(TRIM(r.personal_email), '')
    )));

    SELECT v.id INTO v_vessel_id
    FROM public.vessels v
    WHERE v.company_id = v_company_id
      AND LOWER(TRIM(v.name)) = LOWER(TRIM(COALESCE(r.vessel, '')))
    LIMIT 1;

    v_profile_id := NULL;

    IF r.airtable_id IS NOT NULL THEN
      SELECT p.id INTO v_profile_id FROM public.profiles p
      WHERE p.company_id = v_company_id AND p.airtable_id = r.airtable_id LIMIT 1;
    END IF;

    IF v_profile_id IS NULL AND v_email IS NOT NULL THEN
      SELECT p.id INTO v_profile_id FROM public.profiles p
      WHERE p.company_id = v_company_id AND LOWER(p.email) = v_email LIMIT 1;
    END IF;

    IF v_profile_id IS NULL THEN
      SELECT p.id INTO v_profile_id FROM public.profiles p
      WHERE p.company_id = v_company_id
        AND LOWER(TRIM(COALESCE(p.first_name, ''))) = LOWER(TRIM(COALESCE(r.first_name, '')))
        AND LOWER(TRIM(COALESCE(p.last_name, ''))) = LOWER(TRIM(COALESCE(r.last_name, '')))
      LIMIT 1;
    END IF;

    IF v_profile_id IS NOT NULL THEN
      UPDATE public.profiles p SET
        first_name = COALESCE(NULLIF(TRIM(r.first_name), ''), p.first_name),
        last_name = COALESCE(NULLIF(TRIM(r.last_name), ''), p.last_name),
        preferred_name = COALESCE(NULLIF(TRIM(r.preferred_name), ''), NULLIF(TRIM(r.casual_name), ''), p.preferred_name),
        rank = COALESCE(NULLIF(TRIM(r.role), ''), p.rank),
        department = COALESCE(NULLIF(TRIM(r.department), ''), p.department),
        nationality = COALESCE(NULLIF(TRIM(r.nationality), ''), p.nationality),
        phone = COALESCE(NULLIF(TRIM(r.cellular_phone), ''), NULLIF(TRIM(r.secondary_phone), ''), p.phone),
        date_of_birth = COALESCE(r.date_of_birth, p.date_of_birth),
        status = COALESCE(NULLIF(TRIM(r.status), ''), p.status),
        airtable_id = COALESCE(r.airtable_id, p.airtable_id),
        imported_vessel_id = COALESCE(v_vessel_id, p.imported_vessel_id),
        updated_at = now()
      WHERE p.id = v_profile_id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.profiles (
        user_id, email, first_name, last_name, company_id, role, rank, department,
        nationality, phone, date_of_birth, preferred_name, status, account_status,
        is_imported, airtable_id, imported_vessel_id
      ) VALUES (
        NULL,
        COALESCE(v_email, 'imported.' || REPLACE(gen_random_uuid()::text, '-', '') || '@no-email.local'),
        COALESCE(NULLIF(TRIM(r.first_name), ''), SPLIT_PART(COALESCE(r.full_legal_name, 'Crew'), ' ', 1)),
        COALESCE(NULLIF(TRIM(r.last_name), ''), NULLIF(TRIM(SPLIT_PART(COALESCE(r.full_legal_name, ''), ' ', 2)), ''), 'Member'),
        v_company_id,
        'crew'::user_role,
        NULLIF(TRIM(r.role), ''),
        NULLIF(TRIM(r.department), ''),
        NULLIF(TRIM(r.nationality), ''),
        COALESCE(NULLIF(TRIM(r.cellular_phone), ''), NULLIF(TRIM(r.secondary_phone), '')),
        r.date_of_birth,
        COALESCE(NULLIF(TRIM(r.preferred_name), ''), NULLIF(TRIM(r.casual_name), '')),
        COALESCE(NULLIF(TRIM(r.status), ''), 'active'),
        'not_invited',
        true,
        r.airtable_id,
        v_vessel_id
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_crew_import_to_profiles(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_crew_import_to_profiles(uuid) TO authenticated;
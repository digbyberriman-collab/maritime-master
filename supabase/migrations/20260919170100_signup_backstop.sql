-- =================================================================
-- Sign-up backstop
-- =================================================================
-- The browser sign-up flow (AuthContext.signUp) inserted a companies row
-- and then a profiles row with a user-chosen role, and the policies let
-- it: "Service role can create companies" was in fact granted to
-- authenticated with WITH CHECK (true), and the profile insert policy only
-- required user_id = auth.uid(). A registrant could therefore create a
-- tenant and make themselves its DPA, or insert a profile pointing at an
-- existing company.
--
-- Public sign-up is being switched off in Supabase Auth. This migration is
-- the database-side backstop so the same outcome holds even if it is
-- switched back on:
--   * companies can no longer be created from the browser (the service
--     role bypasses RLS, so administrative tooling is unaffected);
--   * a self-inserted profile can only be a crew profile with no company.
-- Server-side flows that create profiles (create-crew-member,
-- send-invitation, recruitment_hire_candidate) run with the service role
-- or as SECURITY DEFINER and are unaffected.
-- =================================================================

DROP POLICY IF EXISTS "Service role can create companies" ON public.companies;

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'crew'
    AND company_id IS NULL
  );

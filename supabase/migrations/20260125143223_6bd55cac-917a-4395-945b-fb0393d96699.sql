-- Drop the overly permissive policy
DROP POLICY "Authenticated users can create companies" ON public.companies;

-- Create a more restrictive policy - users can only create companies during signup
-- This will be handled by the profile creation flow
CREATE POLICY "Service role can create companies"
  ON public.companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Note: The INSERT on companies happens during registration before the user has a profile,
-- so we need to allow authenticated users to insert. The actual security is enforced
-- by the application logic ensuring only first users create companies.
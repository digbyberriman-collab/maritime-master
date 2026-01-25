-- First, drop the problematic policies causing infinite recursion
DROP POLICY IF EXISTS "Users can view profiles in their company" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their company" ON public.companies;
DROP POLICY IF EXISTS "Users can update their company" ON public.companies;
DROP POLICY IF EXISTS "Users can view vessels in their company" ON public.vessels;
DROP POLICY IF EXISTS "Users can manage vessels in their company" ON public.vessels;

-- Create a security definer function to get user's company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Create a security definer function to check if user belongs to company
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

-- Recreate profiles policies using security definer functions
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can view profiles in their company"
ON public.profiles FOR SELECT
USING (public.user_belongs_to_company(auth.uid(), company_id));

-- Recreate companies policies
CREATE POLICY "Users can view their company"
ON public.companies FOR SELECT
USING (public.user_belongs_to_company(auth.uid(), id));

CREATE POLICY "Users can update their company"
ON public.companies FOR UPDATE
USING (public.user_belongs_to_company(auth.uid(), id));

-- Recreate vessels policies
CREATE POLICY "Users can view vessels in their company"
ON public.vessels FOR SELECT
USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can manage vessels in their company"
ON public.vessels FOR ALL
USING (public.user_belongs_to_company(auth.uid(), company_id));

-- Extend companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS imo_company_number text,
ADD COLUMN IF NOT EXISTS address text;

-- Extend profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS rank text,
ADD COLUMN IF NOT EXISTS nationality text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active';

-- Extend vessels table
ALTER TABLE public.vessels
ADD COLUMN IF NOT EXISTS classification_society text,
ADD COLUMN IF NOT EXISTS gross_tonnage decimal,
ADD COLUMN IF NOT EXISTS build_year integer,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active';

-- Rename flag to flag_state if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vessels' AND column_name = 'flag') THEN
    ALTER TABLE public.vessels RENAME COLUMN flag TO flag_state;
  END IF;
END $$;

-- Create crew_assignments table
CREATE TABLE IF NOT EXISTS public.crew_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id uuid REFERENCES public.vessels(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  position text NOT NULL,
  join_date date NOT NULL,
  leave_date date,
  is_current boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS on crew_assignments
ALTER TABLE public.crew_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for crew_assignments
CREATE POLICY "Users can view crew assignments in their company"
ON public.crew_assignments FOR SELECT
USING (
  vessel_id IN (
    SELECT v.id FROM public.vessels v 
    WHERE public.user_belongs_to_company(auth.uid(), v.company_id)
  )
);

CREATE POLICY "Users can manage crew assignments in their company"
ON public.crew_assignments FOR ALL
USING (
  vessel_id IN (
    SELECT v.id FROM public.vessels v 
    WHERE public.user_belongs_to_company(auth.uid(), v.company_id)
  )
);

-- Add trigger for updated_at on crew_assignments
CREATE TRIGGER update_crew_assignments_updated_at
BEFORE UPDATE ON public.crew_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
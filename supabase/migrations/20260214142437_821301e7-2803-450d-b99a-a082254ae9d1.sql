-- Fix RLS policies to allow any authenticated company member to manage itinerary entries
-- (Role-based restrictions will be enforced at the UI level)

DROP POLICY IF EXISTS "itinerary_entries_insert" ON public.itinerary_entries;
CREATE POLICY "itinerary_entries_insert" ON public.itinerary_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_company(auth.uid(), company_id));

DROP POLICY IF EXISTS "itinerary_entries_select" ON public.itinerary_entries;
CREATE POLICY "itinerary_entries_select" ON public.itinerary_entries
  FOR SELECT TO authenticated
  USING (user_belongs_to_company(auth.uid(), company_id));

DROP POLICY IF EXISTS "itinerary_entries_update" ON public.itinerary_entries;
CREATE POLICY "itinerary_entries_update" ON public.itinerary_entries
  FOR UPDATE TO authenticated
  USING (user_belongs_to_company(auth.uid(), company_id));

DROP POLICY IF EXISTS "itinerary_entries_delete" ON public.itinerary_entries;
CREATE POLICY "itinerary_entries_delete" ON public.itinerary_entries
  FOR DELETE TO authenticated
  USING (user_belongs_to_company(auth.uid(), company_id));

-- Also fix itinerary_entry_vessels policies
DROP POLICY IF EXISTS "itinerary_entry_vessels_insert" ON public.itinerary_entry_vessels;
CREATE POLICY "itinerary_entry_vessels_insert" ON public.itinerary_entry_vessels
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.itinerary_entries e
    WHERE e.id = entry_id AND user_belongs_to_company(auth.uid(), e.company_id)
  ));

DROP POLICY IF EXISTS "itinerary_entry_vessels_select" ON public.itinerary_entry_vessels;
CREATE POLICY "itinerary_entry_vessels_select" ON public.itinerary_entry_vessels
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.itinerary_entries e
    WHERE e.id = entry_id AND user_belongs_to_company(auth.uid(), e.company_id)
  ));

DROP POLICY IF EXISTS "itinerary_entry_vessels_delete" ON public.itinerary_entry_vessels;
CREATE POLICY "itinerary_entry_vessels_delete" ON public.itinerary_entry_vessels
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.itinerary_entries e
    WHERE e.id = entry_id AND user_belongs_to_company(auth.uid(), e.company_id)
  ));
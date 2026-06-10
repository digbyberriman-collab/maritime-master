
DROP POLICY IF EXISTS "Authenticated users can view drill types" ON public.drill_types;
CREATE POLICY "Authenticated users can view drill types"
  ON public.drill_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can manage training courses" ON public.training_courses;
DROP POLICY IF EXISTS "Authenticated users can view training courses" ON public.training_courses;
DROP POLICY IF EXISTS "Admins can insert training courses" ON public.training_courses;
DROP POLICY IF EXISTS "Admins can update training courses" ON public.training_courses;
DROP POLICY IF EXISTS "Admins can delete training courses" ON public.training_courses;

CREATE POLICY "Authenticated users can view training courses"
  ON public.training_courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert training courses"
  ON public.training_courses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'dpa'));
CREATE POLICY "Admins can update training courses"
  ON public.training_courses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'dpa'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'dpa'));
CREATE POLICY "Admins can delete training courses"
  ON public.training_courses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'dpa'));

CREATE OR REPLACE FUNCTION public.update_roles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Authenticated users can upload travel documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their company travel documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update travel documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete travel documents" ON storage.objects;
DROP POLICY IF EXISTS "Travel docs: company members can view" ON storage.objects;
DROP POLICY IF EXISTS "Travel docs: company members can upload" ON storage.objects;
DROP POLICY IF EXISTS "Travel docs: company members can update" ON storage.objects;
DROP POLICY IF EXISTS "Travel docs: company members can delete" ON storage.objects;

CREATE POLICY "Travel docs: company members can view"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'crew-travel-documents'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );
CREATE POLICY "Travel docs: company members can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'crew-travel-documents'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );
CREATE POLICY "Travel docs: company members can update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'crew-travel-documents'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  )
  WITH CHECK (
    bucket_id = 'crew-travel-documents'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );
CREATE POLICY "Travel docs: company members can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'crew-travel-documents'
    AND (storage.foldername(name))[1] = public.current_user_company_id()::text
  );

-- Public avatars bucket for crew profile photos.
-- Path convention: <company_id>/<profile_id>/<timestamp>.<ext>
-- Public read (avatars are shown throughout the app), company-scoped write.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_company_write" ON storage.objects;
CREATE POLICY "avatars_company_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    AND (
      public.hr_can_edit(auth.uid())
      OR (storage.foldername(name))[2] = public.my_profile_id()::text
    )
  );

DROP POLICY IF EXISTS "avatars_company_update" ON storage.objects;
CREATE POLICY "avatars_company_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    AND (public.hr_can_edit(auth.uid()) OR (storage.foldername(name))[2] = public.my_profile_id()::text)
  );

DROP POLICY IF EXISTS "avatars_company_delete" ON storage.objects;
CREATE POLICY "avatars_company_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    AND (public.hr_can_edit(auth.uid()) OR (storage.foldername(name))[2] = public.my_profile_id()::text)
  );

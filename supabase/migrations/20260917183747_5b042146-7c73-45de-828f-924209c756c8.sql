-- Helper: safe company-folder check for the logbook attachments bucket.
CREATE OR REPLACE FUNCTION public.logbook_attachment_path_allowed(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  company uuid;
BEGIN
  IF _name IS NULL THEN
    RETURN false;
  END IF;
  parts := string_to_array(_name, '/');
  -- Expected shape: <company_id>/<entry_id>/<file name>
  IF array_length(parts, 1) <> 3 THEN
    RETURN false;
  END IF;
  IF parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  IF parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  IF coalesce(parts[3], '') = '' THEN
    RETURN false;
  END IF;
  company := parts[1]::uuid;
  RETURN public.user_belongs_to_company(auth.uid(), company);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.logbook_attachment_path_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logbook_attachment_path_allowed(text) TO authenticated, service_role;

DROP POLICY IF EXISTS logbook_files_select_company ON storage.objects;
DROP POLICY IF EXISTS logbook_files_insert_company ON storage.objects;
DROP POLICY IF EXISTS logbook_files_update_company ON storage.objects;
DROP POLICY IF EXISTS logbook_files_delete_company ON storage.objects;

CREATE POLICY logbook_files_select_company ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'logbook-attachments' AND public.logbook_attachment_path_allowed(name));

CREATE POLICY logbook_files_insert_company ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'logbook-attachments' AND public.logbook_attachment_path_allowed(name));

CREATE POLICY logbook_files_update_company ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'logbook-attachments' AND public.logbook_attachment_path_allowed(name))
WITH CHECK (bucket_id = 'logbook-attachments' AND public.logbook_attachment_path_allowed(name));

CREATE POLICY logbook_files_delete_company ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'logbook-attachments' AND public.logbook_attachment_path_allowed(name));
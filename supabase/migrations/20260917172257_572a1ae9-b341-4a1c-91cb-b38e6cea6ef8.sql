-- ── Attachment metadata ───────────────────────────────────────────
CREATE TABLE public.logbook_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id uuid NOT NULL REFERENCES public.logbook_entries(id) ON DELETE CASCADE,
  logbook_id uuid NOT NULL REFERENCES public.logbooks(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  vessel_id uuid NOT NULL REFERENCES public.vessels(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint,
  description text,
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.logbook_attachments TO authenticated;
GRANT ALL ON public.logbook_attachments TO service_role;

ALTER TABLE public.logbook_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logbook_attachments_select_company" ON public.logbook_attachments
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "logbook_attachments_insert_company" ON public.logbook_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "logbook_attachments_update_owner_or_privileged" ON public.logbook_attachments
  FOR UPDATE TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      uploaded_by = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','chief_engineer','chief_officer','purser']::app_role[])
    )
  )
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "logbook_attachments_delete_owner_or_privileged" ON public.logbook_attachments
  FOR DELETE TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (
      uploaded_by = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['superadmin','dpa','fleet_master','captain','chief_engineer','chief_officer','purser']::app_role[])
    )
  );

CREATE INDEX idx_logbook_attachments_entry ON public.logbook_attachments(entry_id);
CREATE INDEX idx_logbook_attachments_company ON public.logbook_attachments(company_id);

CREATE TRIGGER update_logbook_attachments_updated_at
  BEFORE UPDATE ON public.logbook_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Storage policies: files live under <company_id>/<entry_id>/<file> ──
CREATE POLICY "logbook_files_select_company" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'logbook-attachments'
    AND public.user_belongs_to_company(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "logbook_files_insert_company" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logbook-attachments'
    AND public.user_belongs_to_company(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "logbook_files_update_company" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logbook-attachments'
    AND public.user_belongs_to_company(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "logbook_files_delete_company" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logbook-attachments'
    AND public.user_belongs_to_company(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
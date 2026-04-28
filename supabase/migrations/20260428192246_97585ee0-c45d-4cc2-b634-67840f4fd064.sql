ALTER TABLE public.form_templates
ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_form_templates_archived_at
ON public.form_templates (archived_at)
WHERE archived_at IS NOT NULL;
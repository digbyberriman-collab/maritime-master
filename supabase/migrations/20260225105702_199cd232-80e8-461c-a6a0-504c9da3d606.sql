
CREATE TABLE public.user_dashboard_layouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  widget_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  column_span INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_dashboard_widget UNIQUE (user_id, widget_id)
);

CREATE INDEX idx_user_dashboard_layouts_user ON public.user_dashboard_layouts (user_id, sort_order);

ALTER TABLE public.user_dashboard_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dashboard layout"
  ON public.user_dashboard_layouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dashboard layout"
  ON public.user_dashboard_layouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dashboard layout"
  ON public.user_dashboard_layouts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own dashboard layout"
  ON public.user_dashboard_layouts FOR DELETE
  USING (auth.uid() = user_id);

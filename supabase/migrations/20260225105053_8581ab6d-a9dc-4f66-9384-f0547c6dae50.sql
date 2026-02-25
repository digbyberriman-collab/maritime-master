
CREATE TABLE public.user_pinned_shortcuts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shortcut_target TEXT NOT NULL,
  shortcut_label TEXT NOT NULL,
  shortcut_icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one pin per target per user
ALTER TABLE public.user_pinned_shortcuts
  ADD CONSTRAINT uq_user_pinned_shortcuts_target UNIQUE (user_id, shortcut_target);

-- Index for fast lookup
CREATE INDEX idx_user_pinned_shortcuts_user ON public.user_pinned_shortcuts (user_id, sort_order);

-- RLS
ALTER TABLE public.user_pinned_shortcuts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pinned shortcuts"
  ON public.user_pinned_shortcuts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pinned shortcuts"
  ON public.user_pinned_shortcuts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pinned shortcuts"
  ON public.user_pinned_shortcuts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pinned shortcuts"
  ON public.user_pinned_shortcuts FOR DELETE
  USING (auth.uid() = user_id);

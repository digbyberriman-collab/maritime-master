-- Activity log for feedback submissions - tracks all status changes, notes, and responses
CREATE TABLE IF NOT EXISTS public.feedback_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feedback_id UUID NOT NULL REFERENCES public.feedback_submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'status_changed', 'note_added', 'response_sent', 'screenshot_added')),
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for fast lookups by feedback item
CREATE INDEX IF NOT EXISTS idx_feedback_activity_log_feedback_id ON public.feedback_activity_log(feedback_id);

-- Enable RLS
ALTER TABLE public.feedback_activity_log ENABLE ROW LEVEL SECURITY;

-- Users can view activity on their own feedback
CREATE POLICY "Users can view own feedback activity"
  ON public.feedback_activity_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.feedback_submissions
      WHERE feedback_submissions.id = feedback_activity_log.feedback_id
      AND feedback_submissions.user_id = auth.uid()
    )
  );

-- Admins can view all activity
CREATE POLICY "Admins can view all feedback activity"
  ON public.feedback_activity_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('dpa', 'shore_management')
    )
  );

-- Admins can insert activity entries
CREATE POLICY "Admins can create feedback activity"
  ON public.feedback_activity_log
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('dpa', 'shore_management')
    )
  );

-- Any authenticated user can insert activity (for creation logs)
CREATE POLICY "Users can log own feedback creation"
  ON public.feedback_activity_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at on feedback_submissions when modified
CREATE OR REPLACE FUNCTION public.update_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_feedback_updated_at
  BEFORE UPDATE ON public.feedback_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feedback_updated_at();

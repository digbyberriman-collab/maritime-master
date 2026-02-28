-- Create feedback_submissions table for the beta feedback panel
CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('bug', 'suggestion', 'question')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'fixed')),
  app_version TEXT NOT NULL DEFAULT '1.0.0',
  browser TEXT NOT NULL DEFAULT '',
  page_url TEXT NOT NULL DEFAULT '',
  user_role TEXT NOT NULL DEFAULT '',
  admin_note TEXT,
  admin_response TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_user_id ON public.feedback_submissions(user_id);

-- Index for admin filtering by status
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_status ON public.feedback_submissions(status);

-- Enable RLS
ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

-- Users can read their own submissions
CREATE POLICY "Users can view own feedback"
  ON public.feedback_submissions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own submissions
CREATE POLICY "Users can create feedback"
  ON public.feedback_submissions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admin roles (dpa, shore_management) can read all submissions
CREATE POLICY "Admins can view all feedback"
  ON public.feedback_submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('dpa', 'shore_management')
    )
  );

-- Admin roles can update any submission (status, notes, responses)
CREATE POLICY "Admins can update feedback"
  ON public.feedback_submissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('dpa', 'shore_management')
    )
  );

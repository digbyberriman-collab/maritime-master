-- Admin Action Log table for audit trail
CREATE TABLE public.admin_action_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('RESET_ACCOUNT', 'TOGGLE_ACCESS', 'REALLOCATE_VESSEL', 'SET_PIN')),
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_crew_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  before_json JSONB,
  after_json JSONB,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;

-- Only DPA/superadmin can view admin action logs
CREATE POLICY "DPA can view admin action logs"
  ON public.admin_action_log
  FOR SELECT
  USING (
    public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::app_role[])
  );

-- Only DPA/superadmin can insert admin action logs
CREATE POLICY "DPA can insert admin action logs"
  ON public.admin_action_log
  FOR INSERT
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['superadmin', 'dpa']::app_role[])
  );

-- Admin PINs table for secure action confirmation
CREATE TABLE public.admin_pins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  last_confirmed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_pins ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own PIN
CREATE POLICY "Users can view own PIN record"
  ON public.admin_pins
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own PIN"
  ON public.admin_pins
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own PIN"
  ON public.admin_pins
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Add account_status to profiles if not exists, and last_login_at
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active' CHECK (account_status IN ('active', 'disabled', 'invited', 'not_invited')),
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_admin_action_log_actor ON public.admin_action_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_target ON public.admin_action_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_created ON public.admin_action_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles(account_status);

-- Trigger to update updated_at on admin_pins
CREATE TRIGGER update_admin_pins_updated_at
  BEFORE UPDATE ON public.admin_pins
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
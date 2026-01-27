-- Create user_preferences table for notification and appearance settings
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Notification settings
  notification_channels JSONB DEFAULT '{"in_app": true, "email": true}'::jsonb,
  alert_severities JSONB DEFAULT '{"red": true, "orange": true, "yellow": true, "green": false}'::jsonb,
  module_subscriptions JSONB DEFAULT '{"incidents": true, "certificates": true, "audits": true, "drills": true, "training": true, "hours_of_rest": true, "crew_invites": true, "maintenance": true, "documents": true}'::jsonb,
  daily_digest_time TEXT DEFAULT '08:00',
  weekly_digest_day TEXT DEFAULT 'monday',
  weekly_digest_time TEXT DEFAULT '09:00',
  default_snooze_minutes INTEGER DEFAULT 30,
  
  -- Appearance settings
  theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  sidebar_collapsed BOOLEAN DEFAULT false,
  default_vessel_id UUID REFERENCES public.vessels(id) ON DELETE SET NULL,
  dashboard_widgets TEXT[] DEFAULT ARRAY['alerts', 'certificates', 'drills'],
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only view/edit their own preferences
CREATE POLICY "Users can view their own preferences"
ON public.user_preferences
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON public.user_preferences
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.user_preferences
FOR UPDATE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_user_preferences_updated_at
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Create alert severity enum
CREATE TYPE public.alert_severity AS ENUM ('RED', 'ORANGE', 'YELLOW', 'GREEN');

-- Create alert status enum
CREATE TYPE public.alert_status AS ENUM ('OPEN', 'ACKNOWLEDGED', 'SNOOZED', 'RESOLVED', 'ESCALATED', 'AUTO_DISMISSED');

-- Create alerts table
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Classification
  alert_type VARCHAR(50) NOT NULL,
  severity_color alert_severity NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Scope
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE CASCADE,
  
  -- Related entity
  related_entity_type VARCHAR(50),
  related_entity_id UUID,
  
  -- Assignment
  owner_user_id UUID REFERENCES public.profiles(user_id),
  owner_role VARCHAR(50),
  assigned_to_user_id UUID REFERENCES public.profiles(user_id),
  
  -- Timing
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  due_at TIMESTAMP WITH TIME ZONE,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by UUID REFERENCES public.profiles(user_id),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES public.profiles(user_id),
  
  -- Status
  status alert_status DEFAULT 'OPEN',
  
  -- Snooze tracking
  snooze_count INTEGER DEFAULT 0,
  snoozed_until TIMESTAMP WITH TIME ZONE,
  last_snooze_reason TEXT,
  
  -- Escalation
  escalation_level INTEGER DEFAULT 0,
  escalated_at TIMESTAMP WITH TIME ZONE,
  escalated_to_user_ids UUID[],
  
  -- Metadata
  source_module VARCHAR(50),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_alerts_severity ON public.alerts(severity_color, status);
CREATE INDEX idx_alerts_vessel ON public.alerts(vessel_id, status);
CREATE INDEX idx_alerts_owner ON public.alerts(owner_user_id, status);
CREATE INDEX idx_alerts_due ON public.alerts(due_at) WHERE status = 'OPEN';
CREATE INDEX idx_alerts_company ON public.alerts(company_id, status);

-- Enable RLS
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view alerts in their company"
  ON public.alerts FOR SELECT
  USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can insert alerts in their company"
  ON public.alerts FOR INSERT
  WITH CHECK (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can update alerts in their company"
  ON public.alerts FOR UPDATE
  USING (user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Users can delete alerts in their company"
  ON public.alerts FOR DELETE
  USING (user_belongs_to_company(auth.uid(), company_id));

-- Trigger for updated_at
CREATE TRIGGER update_alerts_updated_at
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
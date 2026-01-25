import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface InvestigationTeamMember {
  userId: string;
  name: string;
  role: string;
}

export interface TimelineEvent {
  id: string;
  time: string;
  description: string;
  evidence?: string;
}

export interface Investigation {
  id: string;
  incident_id: string;
  lead_investigator: string;
  investigation_team: InvestigationTeamMember[];
  investigation_method: string | null;
  timeline: TimelineEvent[];
  findings: string | null;
  root_cause: string | null;
  contributing_factors: string[];
  recommendations: string[];
  completed_date: string | null;
  approved_by: string | null;
  approved_date: string | null;
  created_at: string;
  lead_investigator_profile?: { first_name: string; last_name: string };
  approver_profile?: { first_name: string; last_name: string };
}

export interface StartInvestigationData {
  incidentId: string;
  leadInvestigator: string;
  investigationTeam: InvestigationTeamMember[];
  investigationMethod: string;
  targetCompletionDate: string;
}

export interface UpdateInvestigationData {
  id: string;
  findings?: string;
  root_cause?: string;
  contributing_factors?: string[];
  recommendations?: string[];
  timeline?: TimelineEvent[];
}

export function useInvestigation(incidentId?: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["investigation", incidentId],
    queryFn: async () => {
      if (!incidentId) return null;

      const { data, error } = await supabase
        .from("incident_investigation")
        .select(`
          *,
          lead_investigator_profile:profiles!incident_investigation_lead_investigator_fkey(first_name, last_name),
          approver_profile:profiles!incident_investigation_approved_by_fkey(first_name, last_name)
        `)
        .eq("incident_id", incidentId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        // Parse JSON fields properly
        const investigationTeam = Array.isArray(data.investigation_team) 
          ? (data.investigation_team as unknown as InvestigationTeamMember[])
          : [];
        const timeline = Array.isArray(data.timeline) 
          ? (data.timeline as unknown as TimelineEvent[])
          : [];

        return {
          id: data.id,
          incident_id: data.incident_id,
          lead_investigator: data.lead_investigator,
          investigation_team: investigationTeam,
          investigation_method: data.investigation_method,
          timeline: timeline,
          findings: data.findings,
          root_cause: data.root_cause,
          contributing_factors: data.contributing_factors || [],
          recommendations: data.recommendations || [],
          completed_date: data.completed_date,
          approved_by: data.approved_by,
          approved_date: data.approved_date,
          created_at: data.created_at,
          lead_investigator_profile: data.lead_investigator_profile as { first_name: string; last_name: string } | undefined,
          approver_profile: data.approver_profile as { first_name: string; last_name: string } | undefined,
        } as Investigation;
      }
      
      return null;
    },
    enabled: !!incidentId,
  });
}

export function useStartInvestigation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: StartInvestigationData) => {
      const { data: investigation, error } = await supabase
        .from("incident_investigation")
        .insert({
          incident_id: data.incidentId,
          lead_investigator: data.leadInvestigator,
          investigation_team: JSON.parse(JSON.stringify(data.investigationTeam)),
          investigation_method: data.investigationMethod,
        })
        .select()
        .single();

      if (error) throw error;

      // Update incident investigation status
      const { error: incidentError } = await supabase
        .from("incidents")
        .update({ investigation_status: "In Progress" })
        .eq("id", data.incidentId);

      if (incidentError) throw incidentError;

      return investigation;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["investigation", variables.incidentId] });
      queryClient.invalidateQueries({ queryKey: ["incident", variables.incidentId] });
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["incident-timeline"] });
      toast({
        title: "Investigation Started",
        description: "The investigation has been initiated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateInvestigation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateInvestigationData) => {
      const { data, error } = await supabase
        .from("incident_investigation")
        .update(updateData as Record<string, unknown>)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["investigation", data.incident_id] });
      queryClient.invalidateQueries({ queryKey: ["incident-timeline"] });
      toast({
        title: "Investigation Updated",
        description: "Your changes have been saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useCompleteInvestigation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (investigationId: string) => {
      const { data: investigation, error: fetchError } = await supabase
        .from("incident_investigation")
        .select("incident_id")
        .eq("id", investigationId)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from("incident_investigation")
        .update({ completed_date: new Date().toISOString() })
        .eq("id", investigationId);

      if (error) throw error;

      // Update incident investigation status
      const { error: incidentError } = await supabase
        .from("incidents")
        .update({ investigation_status: "Completed" })
        .eq("id", investigation.incident_id);

      if (incidentError) throw incidentError;

      return investigation.incident_id;
    },
    onSuccess: (incidentId) => {
      queryClient.invalidateQueries({ queryKey: ["investigation", incidentId] });
      queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["incident-timeline"] });
      toast({
        title: "Investigation Completed",
        description: "The investigation has been marked as completed and submitted for approval.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useApproveInvestigation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (investigationId: string) => {
      const { data: investigation, error: fetchError } = await supabase
        .from("incident_investigation")
        .select("incident_id")
        .eq("id", investigationId)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from("incident_investigation")
        .update({
          approved_by: user?.id,
          approved_date: new Date().toISOString(),
        })
        .eq("id", investigationId);

      if (error) throw error;

      // Update incident investigation status
      const { error: incidentError } = await supabase
        .from("incidents")
        .update({ investigation_status: "Completed" })
        .eq("id", investigation.incident_id);

      if (incidentError) throw incidentError;

      return investigation.incident_id;
    },
    onSuccess: (incidentId) => {
      queryClient.invalidateQueries({ queryKey: ["investigation", incidentId] });
      queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["incident-timeline"] });
      toast({
        title: "Investigation Approved",
        description: "The investigation has been approved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

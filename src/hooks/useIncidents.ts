import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface PersonInvolved {
  name: string;
  role: string;
  injured: boolean;
  injuryDetails?: string;
}

export interface Witness {
  name: string;
  statement: string;
}

export interface Incident {
  id: string;
  vessel_id: string;
  company_id: string;
  reported_by: string;
  incident_number: string;
  incident_date: string;
  reported_date: string;
  incident_type: "Near Miss" | "Injury" | "Pollution" | "Property Damage" | "Security" | "Other";
  location: string;
  description: string;
  immediate_action: string | null;
  persons_involved: PersonInvolved[];
  witnesses: Witness[];
  severity_actual: number;
  severity_potential: number;
  investigation_required: boolean;
  investigation_status: "Not Started" | "In Progress" | "Completed";
  root_cause: string | null;
  contributing_factors: string[];
  dpa_notified: boolean;
  dpa_notified_date: string | null;
  status: "Open" | "Under Investigation" | "Closed";
  attachments: string[];
  created_at: string;
  updated_at: string;
  vessels?: { name: string };
  reporter?: { first_name: string; last_name: string };
}

export interface CorrectiveAction {
  id: string;
  incident_id: string | null;
  finding_id: string | null;
  company_id: string;
  action_number: string;
  description: string;
  action_type: "Immediate" | "Corrective" | "Preventive";
  assigned_to: string;
  assigned_by: string;
  due_date: string;
  status: "Open" | "In Progress" | "Verification" | "Closed";
  completion_date: string | null;
  completion_notes: string | null;
  evidence_urls: string[];
  verified_by: string | null;
  verified_date: string | null;
  verification_notes: string | null;
  created_at: string;
  updated_at: string;
  assignee?: { first_name: string; last_name: string };
}

export interface IncidentFormData {
  vessel_id: string;
  incident_date: string;
  incident_type: string;
  location: string;
  description: string;
  immediate_action?: string;
  persons_involved: PersonInvolved[];
  witnesses: Witness[];
  severity_actual: number;
  severity_potential: number;
  dpa_notified: boolean;
  attachments: string[];
}

async function generateIncidentNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
  const { count } = await supabase
    .from("incidents")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte("created_at", `${year}-01-01`);

  const nextNumber = (count || 0) + 1;
  return `INC-${year}-${String(nextNumber).padStart(3, "0")}-${timestamp}`;
}

async function generateActionNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
  const { count } = await supabase
    .from("corrective_actions")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte("created_at", `${year}-01-01`);

  const nextNumber = (count || 0) + 1;
  return `CAPA-${year}-${String(nextNumber).padStart(3, "0")}-${timestamp}`;
}

export function useIncidents(filters?: {
  vesselId?: string;
  status?: string;
  incidentType?: string;
  dateFrom?: string;
  dateTo?: string;
  severity?: number;
}) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["incidents", profile?.company_id, filters],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      let query = supabase
        .from("incidents")
        .select(`
          *,
          vessels(name),
          reporter:profiles!incidents_reported_by_fkey(first_name, last_name)
        `)
        .eq("company_id", profile.company_id)
        .order("incident_date", { ascending: false });

      if (filters?.vesselId) {
        query = query.eq("vessel_id", filters.vesselId);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.incidentType) {
        query = query.eq("incident_type", filters.incidentType);
      }
      if (filters?.dateFrom) {
        query = query.gte("incident_date", filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte("incident_date", filters.dateTo);
      }
      if (filters?.severity) {
        query = query.gte("severity_actual", filters.severity);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as unknown as Incident[];
    },
    enabled: !!profile?.company_id,
  });
}

export function useIncidentStats() {
  const { profile } = useAuth();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  return useQuery({
    queryKey: ["incident-stats", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) {
        return {
          totalThisMonth: 0,
          openInvestigations: 0,
          overdueCAPAs: 0,
          daysSinceLastIncident: 0,
        };
      }

      // Total incidents this month
      const { count: totalThisMonth } = await supabase
        .from("incidents")
        .select("*", { count: "exact", head: true })
        .eq("company_id", profile.company_id)
        .gte("incident_date", startOfMonth);

      // Open investigations
      const { count: openInvestigations } = await supabase
        .from("incidents")
        .select("*", { count: "exact", head: true })
        .eq("company_id", profile.company_id)
        .in("investigation_status", ["Not Started", "In Progress"]);

      // Overdue CAPAs
      const { count: overdueCAPAs } = await supabase
        .from("corrective_actions")
        .select("*", { count: "exact", head: true })
        .eq("company_id", profile.company_id)
        .neq("status", "Closed")
        .lt("due_date", now.toISOString().split("T")[0]);

      // Days since last incident
      const { data: lastIncident } = await supabase
        .from("incidents")
        .select("incident_date")
        .eq("company_id", profile.company_id)
        .order("incident_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      let daysSinceLastIncident = 0;
      if (lastIncident) {
        const lastDate = new Date(lastIncident.incident_date);
        daysSinceLastIncident = Math.floor(
          (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      return {
        totalThisMonth: totalThisMonth || 0,
        openInvestigations: openInvestigations || 0,
        overdueCAPAs: overdueCAPAs || 0,
        daysSinceLastIncident,
      };
    },
    enabled: !!profile?.company_id,
  });
}

export function useCreateIncident() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: IncidentFormData) => {
      if (!profile?.company_id || !user?.id) {
        throw new Error("Not authenticated");
      }

      const incidentNumber = await generateIncidentNumber(profile.company_id);

      const { data: incident, error } = await supabase
        .from("incidents")
        .insert([{
          vessel_id: data.vessel_id,
          company_id: profile.company_id,
          reported_by: user.id,
          incident_number: incidentNumber,
          incident_date: data.incident_date,
          incident_type: data.incident_type,
          location: data.location,
          description: data.description,
          immediate_action: data.immediate_action,
          persons_involved: data.persons_involved,
          witnesses: data.witnesses,
          severity_actual: data.severity_actual,
          severity_potential: data.severity_potential,
          investigation_required: data.severity_actual >= 3 || data.severity_potential >= 4,
          dpa_notified: data.dpa_notified,
          dpa_notified_date: data.dpa_notified ? new Date().toISOString() : null,
          attachments: data.attachments,
        }] as any)
        .select()
        .single();

      if (error) throw error;
      return incident;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["incident-stats"] });
      toast({
        title: "Incident Reported",
        description: `Incident ${data.incident_number} has been created successfully.`,
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

export function useUpdateIncident() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: Partial<Incident> & { id: string }) => {
      // Remove joined relation fields that don't exist on the table
      const { vessels, reporter, ...dbUpdates } = updateData as Record<string, unknown>;

      const { data: incident, error } = await supabase
        .from("incidents")
        .update(dbUpdates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return incident;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["incident-stats"] });
      toast({
        title: "Incident Updated",
        description: "The incident has been updated successfully.",
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

export function useCorrectiveActions(incidentId?: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["corrective-actions", profile?.company_id, incidentId],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      let query = supabase
        .from("corrective_actions")
        .select(`
          *,
          assignee:profiles!corrective_actions_assigned_to_fkey(first_name, last_name)
        `)
        .eq("company_id", profile.company_id)
        .order("due_date", { ascending: true });

      if (incidentId) {
        query = query.eq("incident_id", incidentId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as CorrectiveAction[];
    },
    enabled: !!profile?.company_id,
  });
}

export function useCreateCorrectiveAction() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      incident_id?: string;
      description: string;
      action_type: string;
      assigned_to: string;
      due_date: string;
    }) => {
      if (!profile?.company_id || !user?.id) {
        throw new Error("Not authenticated");
      }

      const actionNumber = await generateActionNumber(profile.company_id);

      const { data: action, error } = await supabase
        .from("corrective_actions")
        .insert({
          ...data,
          company_id: profile.company_id,
          action_number: actionNumber,
          assigned_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return action;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["corrective-actions"] });
      queryClient.invalidateQueries({ queryKey: ["incident-stats"] });
      toast({
        title: "CAPA Created",
        description: `Corrective action ${data.action_number} has been created.`,
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

export function useUploadIncidentAttachment() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (file: File) => {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `incidents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("incident-attachments")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("incident-attachments")
        .getPublicUrl(filePath);

      return publicUrl;
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

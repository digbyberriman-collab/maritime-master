import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

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
  assigner?: { first_name: string; last_name: string };
  verifier?: { first_name: string; last_name: string };
}

export interface CreateCAPAData {
  incident_id?: string;
  description: string;
  action_type: string;
  assigned_to: string;
  due_date: string;
  priority?: string;
  evidence_required?: string[];
}

export interface UpdateCAPAData {
  id: string;
  status?: string;
  completion_notes?: string;
  evidence_urls?: string[];
  verification_notes?: string;
}

async function generateActionNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("corrective_actions")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte("created_at", `${year}-01-01`);

  const nextNumber = (count || 0) + 1;
  return `CAPA-${year}-${String(nextNumber).padStart(3, "0")}`;
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
          assignee:profiles!corrective_actions_assigned_to_fkey(first_name, last_name),
          assigner:profiles!corrective_actions_assigned_by_fkey(first_name, last_name),
          verifier:profiles!corrective_actions_verified_by_fkey(first_name, last_name)
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

export function useCreateCorrectedAction() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateCAPAData) => {
      if (!profile?.company_id || !user?.id) {
        throw new Error("Not authenticated");
      }

      const actionNumber = await generateActionNumber(profile.company_id);

      const { data: action, error } = await supabase
        .from("corrective_actions")
        .insert({
          incident_id: data.incident_id,
          company_id: profile.company_id,
          action_number: actionNumber,
          description: data.description,
          action_type: data.action_type,
          assigned_to: data.assigned_to,
          assigned_by: user.id,
          due_date: data.due_date,
        })
        .select()
        .single();

      if (error) throw error;
      return action;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["corrective-actions"] });
      queryClient.invalidateQueries({ queryKey: ["incident-stats"] });
      queryClient.invalidateQueries({ queryKey: ["incident-timeline"] });
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

export function useUpdateCorrectedAction() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateCAPAData) => {
      const { data, error } = await supabase
        .from("corrective_actions")
        .update(updateData as Record<string, unknown>)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["corrective-actions"] });
      queryClient.invalidateQueries({ queryKey: ["incident-stats"] });
      queryClient.invalidateQueries({ queryKey: ["incident-timeline"] });
      toast({
        title: "CAPA Updated",
        description: "The corrective action has been updated.",
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

export function useMarkCAPAInProgress() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { data, error } = await supabase
        .from("corrective_actions")
        .update({ 
          status: "In Progress",
          completion_notes: notes || null,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["corrective-actions"] });
      queryClient.invalidateQueries({ queryKey: ["incident-timeline"] });
      toast({
        title: "Status Updated",
        description: "CAPA marked as In Progress.",
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

export function useRequestCAPAVerification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, notes, evidenceUrls }: { id: string; notes: string; evidenceUrls: string[] }) => {
      const { data, error } = await supabase
        .from("corrective_actions")
        .update({ 
          status: "Verification",
          completion_notes: notes,
          completion_date: new Date().toISOString().split("T")[0],
          evidence_urls: evidenceUrls,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["corrective-actions"] });
      queryClient.invalidateQueries({ queryKey: ["incident-timeline"] });
      toast({
        title: "Verification Requested",
        description: "CAPA submitted for verification.",
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

export function useVerifyCAPAction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, approved, notes }: { id: string; approved: boolean; notes?: string }) => {
      const updateData: Record<string, unknown> = approved
        ? {
            status: "Closed",
            verified_by: user?.id,
            verified_date: new Date().toISOString().split("T")[0],
            verification_notes: notes,
          }
        : {
            status: "In Progress",
            verification_notes: notes,
          };

      const { data, error } = await supabase
        .from("corrective_actions")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { data, approved };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["corrective-actions"] });
      queryClient.invalidateQueries({ queryKey: ["incident-stats"] });
      queryClient.invalidateQueries({ queryKey: ["incident-timeline"] });
      toast({
        title: result.approved ? "CAPA Verified" : "CAPA Rejected",
        description: result.approved 
          ? "The corrective action has been verified and closed."
          : "The corrective action has been rejected and returned to In Progress.",
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

export function useUploadCAPAEvidence() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (file: File) => {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `capa-evidence/${fileName}`;

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

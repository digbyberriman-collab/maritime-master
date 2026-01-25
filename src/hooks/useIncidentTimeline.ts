import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TimelineEntry {
  id: string;
  timestamp: string;
  type: "incident" | "investigation" | "capa" | "notification" | "status";
  action: string;
  description: string;
  userId?: string;
  userName?: string;
}

export function useIncidentTimeline(incidentId?: string) {
  return useQuery({
    queryKey: ["incident-timeline", incidentId],
    queryFn: async () => {
      if (!incidentId) return [];

      const timeline: TimelineEntry[] = [];

      // Get incident details
      const { data: incident, error: incidentError } = await supabase
        .from("incidents")
        .select(`
          *,
          reporter:profiles!incidents_reported_by_fkey(first_name, last_name)
        `)
        .eq("id", incidentId)
        .single();

      if (incidentError) throw incidentError;

      // Add incident reported event
      timeline.push({
        id: `incident-reported-${incident.id}`,
        timestamp: incident.reported_date,
        type: "incident",
        action: "Incident Reported",
        description: `${incident.incident_number} reported by ${incident.reporter?.first_name} ${incident.reporter?.last_name}`,
        userName: `${incident.reporter?.first_name} ${incident.reporter?.last_name}`,
      });

      // Add DPA notification if applicable
      if (incident.dpa_notified && incident.dpa_notified_date) {
        timeline.push({
          id: `dpa-notified-${incident.id}`,
          timestamp: incident.dpa_notified_date,
          type: "notification",
          action: "DPA Notified",
          description: "Designated Person Ashore was notified of this incident",
        });
      }

      // Get investigation details
      const { data: investigation, error: investigationError } = await supabase
        .from("incident_investigation")
        .select(`
          *,
          lead_investigator_profile:profiles!incident_investigation_lead_investigator_fkey(first_name, last_name),
          approver_profile:profiles!incident_investigation_approved_by_fkey(first_name, last_name)
        `)
        .eq("incident_id", incidentId)
        .maybeSingle();

      if (!investigationError && investigation) {
        // Investigation started
        timeline.push({
          id: `investigation-started-${investigation.id}`,
          timestamp: investigation.created_at,
          type: "investigation",
          action: "Investigation Started",
          description: `Investigation initiated by ${investigation.lead_investigator_profile?.first_name} ${investigation.lead_investigator_profile?.last_name}`,
          userName: `${investigation.lead_investigator_profile?.first_name} ${investigation.lead_investigator_profile?.last_name}`,
        });

        // Investigation completed
        if (investigation.completed_date) {
          timeline.push({
            id: `investigation-completed-${investigation.id}`,
            timestamp: investigation.completed_date,
            type: "investigation",
            action: "Investigation Completed",
            description: "Investigation findings submitted for approval",
          });
        }

        // Investigation approved
        if (investigation.approved_date && investigation.approver_profile) {
          timeline.push({
            id: `investigation-approved-${investigation.id}`,
            timestamp: investigation.approved_date,
            type: "investigation",
            action: "Investigation Approved",
            description: `Investigation approved by ${investigation.approver_profile.first_name} ${investigation.approver_profile.last_name}`,
            userName: `${investigation.approver_profile.first_name} ${investigation.approver_profile.last_name}`,
          });
        }
      }

      // Get corrective actions
      const { data: actions, error: actionsError } = await supabase
        .from("corrective_actions")
        .select(`
          *,
          assignee:profiles!corrective_actions_assigned_to_fkey(first_name, last_name),
          verifier:profiles!corrective_actions_verified_by_fkey(first_name, last_name)
        `)
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: true });

      if (!actionsError && actions) {
        for (const action of actions) {
          // CAPA created
          timeline.push({
            id: `capa-created-${action.id}`,
            timestamp: action.created_at,
            type: "capa",
            action: "CAPA Created",
            description: `${action.action_number} created and assigned to ${action.assignee?.first_name} ${action.assignee?.last_name}`,
            userName: `${action.assignee?.first_name} ${action.assignee?.last_name}`,
          });

          // CAPA completed
          if (action.status === "Closed" && action.verified_date) {
            timeline.push({
              id: `capa-closed-${action.id}`,
              timestamp: action.verified_date,
              type: "capa",
              action: "CAPA Verified & Closed",
              description: `${action.action_number} verified and closed${action.verifier ? ` by ${action.verifier.first_name} ${action.verifier.last_name}` : ""}`,
              userName: action.verifier ? `${action.verifier.first_name} ${action.verifier.last_name}` : undefined,
            });
          }
        }
      }

      // Incident closed
      if (incident.status === "Closed") {
        timeline.push({
          id: `incident-closed-${incident.id}`,
          timestamp: incident.updated_at,
          type: "status",
          action: "Incident Closed",
          description: "All corrective actions completed and verified",
        });
      }

      // Sort by timestamp descending
      return timeline.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    },
    enabled: !!incidentId,
  });
}

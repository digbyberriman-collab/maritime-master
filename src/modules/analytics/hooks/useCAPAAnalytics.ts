import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, parseISO, format } from "date-fns";

export interface CAPAMetrics {
  totalOpen: number;
  overdue: number;
  avgDaysToComplete: number;
  completionRateThisMonth: number;
  completedThisMonth: number;
  totalThisMonth: number;
}

export interface CAPAWithDetails {
  id: string;
  action_number: string;
  description: string;
  action_type: string;
  status: string;
  due_date: string;
  created_at: string;
  assigned_to: string;
  incident_id: string | null;
  incident_number?: string;
  assignee_name?: string;
  days_open: number;
  is_overdue: boolean;
}

export interface AssigneePerformance {
  userId: string;
  name: string;
  activeCAPAs: number;
  overdueCAPAs: number;
  avgDaysToComplete: number;
  completionRate: number;
  completedTotal: number;
}

export interface CAPAAging {
  bucket: string;
  count: number;
}

export function useCAPAMetrics() {
  return useQuery({
    queryKey: ["capa-metrics"],
    queryFn: async (): Promise<CAPAMetrics> => {
      const { data: capas, error } = await supabase
        .from("corrective_actions")
        .select("*");

      if (error) throw error;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const openCapas = capas?.filter((c) => c.status !== "Closed") || [];
      const overdueCapas = openCapas.filter((c) => 
        c.due_date && new Date(c.due_date) < now
      );

      const closedCapas = capas?.filter((c) => c.status === "Closed") || [];
      const completionDays = closedCapas
        .filter((c) => c.completion_date)
        .map((c) => differenceInDays(
          parseISO(c.completion_date!),
          parseISO(c.created_at)
        ));

      const avgDaysToComplete = completionDays.length > 0
        ? Math.round(completionDays.reduce((a, b) => a + b, 0) / completionDays.length)
        : 0;

      const thisMonthCapas = capas?.filter((c) => 
        new Date(c.created_at) >= startOfMonth
      ) || [];
      const completedThisMonth = thisMonthCapas.filter((c) => c.status === "Closed").length;
      const totalThisMonth = thisMonthCapas.length;
      const completionRateThisMonth = totalThisMonth > 0
        ? Math.round((completedThisMonth / totalThisMonth) * 100)
        : 0;

      return {
        totalOpen: openCapas.length,
        overdue: overdueCapas.length,
        avgDaysToComplete,
        completionRateThisMonth,
        completedThisMonth,
        totalThisMonth,
      };
    },
  });
}

export function useCAPAList(filters?: {
  vesselId?: string;
  assignedTo?: string;
  status?: string;
  type?: string;
}) {
  return useQuery({
    queryKey: ["capa-list", filters],
    queryFn: async (): Promise<CAPAWithDetails[]> => {
      let query = supabase
        .from("corrective_actions")
        .select(`
          *,
          incident:incidents(incident_number, vessel_id),
          assignee:profiles!corrective_actions_assigned_to_fkey(first_name, last_name)
        `)
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      if (filters?.type && filters.type !== "all") {
        query = query.eq("action_type", filters.type);
      }

      if (filters?.assignedTo && filters.assignedTo !== "all") {
        query = query.eq("assigned_to", filters.assignedTo);
      }

      const { data, error } = await query;
      if (error) throw error;

      const now = new Date();

      return (data || [])
        .filter((capa) => {
          if (filters?.vesselId && filters.vesselId !== "all") {
            const incident = capa.incident as { vessel_id: string } | null;
            return incident?.vessel_id === filters.vesselId;
          }
          return true;
        })
        .map((capa) => {
          const incident = capa.incident as { incident_number: string } | null;
          const assignee = capa.assignee as { first_name: string; last_name: string } | null;
          const dueDate = capa.due_date ? new Date(capa.due_date) : null;
          const isOverdue = dueDate ? dueDate < now && capa.status !== "Closed" : false;
          const daysOpen = differenceInDays(now, parseISO(capa.created_at));

          return {
            id: capa.id,
            action_number: capa.action_number,
            description: capa.description,
            action_type: capa.action_type,
            status: capa.status || "Open",
            due_date: capa.due_date,
            created_at: capa.created_at,
            assigned_to: capa.assigned_to,
            incident_id: capa.incident_id,
            incident_number: incident?.incident_number,
            assignee_name: assignee ? `${assignee.first_name} ${assignee.last_name}` : "Unassigned",
            days_open: daysOpen,
            is_overdue: isOverdue,
          };
        });
    },
  });
}

export function useCAPAAging() {
  return useQuery({
    queryKey: ["capa-aging"],
    queryFn: async (): Promise<CAPAAging[]> => {
      const { data, error } = await supabase
        .from("corrective_actions")
        .select("created_at, status")
        .neq("status", "Closed");

      if (error) throw error;

      const buckets = {
        "0-7 days": 0,
        "8-30 days": 0,
        "31-60 days": 0,
        "61-90 days": 0,
        "90+ days": 0,
      };

      const now = new Date();

      data?.forEach((capa) => {
        const age = differenceInDays(now, parseISO(capa.created_at));
        if (age <= 7) buckets["0-7 days"]++;
        else if (age <= 30) buckets["8-30 days"]++;
        else if (age <= 60) buckets["31-60 days"]++;
        else if (age <= 90) buckets["61-90 days"]++;
        else buckets["90+ days"]++;
      });

      return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
    },
  });
}

export function useAssigneePerformance() {
  return useQuery({
    queryKey: ["assignee-performance"],
    queryFn: async (): Promise<AssigneePerformance[]> => {
      const { data, error } = await supabase
        .from("corrective_actions")
        .select(`
          *,
          assignee:profiles!corrective_actions_assigned_to_fkey(user_id, first_name, last_name)
        `);

      if (error) throw error;

      const assigneeMap = new Map<string, {
        name: string;
        active: number;
        overdue: number;
        completionDays: number[];
        completed: number;
        total: number;
      }>();

      const now = new Date();

      data?.forEach((capa) => {
        const assignee = capa.assignee as { user_id: string; first_name: string; last_name: string } | null;
        if (!assignee) return;

        const userId = assignee.user_id;
        const name = `${assignee.first_name} ${assignee.last_name}`;

        const existing = assigneeMap.get(userId) || {
          name,
          active: 0,
          overdue: 0,
          completionDays: [],
          completed: 0,
          total: 0,
        };

        existing.total++;

        if (capa.status !== "Closed") {
          existing.active++;
          if (capa.due_date && new Date(capa.due_date) < now) {
            existing.overdue++;
          }
        } else {
          existing.completed++;
          if (capa.completion_date) {
            const days = differenceInDays(
              parseISO(capa.completion_date),
              parseISO(capa.created_at)
            );
            existing.completionDays.push(days);
          }
        }

        assigneeMap.set(userId, existing);
      });

      return Array.from(assigneeMap.entries()).map(([userId, data]) => ({
        userId,
        name: data.name,
        activeCAPAs: data.active,
        overdueCAPAs: data.overdue,
        avgDaysToComplete: data.completionDays.length > 0
          ? Math.round(data.completionDays.reduce((a, b) => a + b, 0) / data.completionDays.length)
          : 0,
        completionRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
        completedTotal: data.completed,
      }));
    },
  });
}

export function useOverdueCAPAs() {
  return useQuery({
    queryKey: ["overdue-capas"],
    queryFn: async () => {
      const now = new Date();
      const { data, error } = await supabase
        .from("corrective_actions")
        .select("*")
        .neq("status", "Closed")
        .lt("due_date", now.toISOString());

      if (error) throw error;
      return data || [];
    },
  });
}

export function useRecentIncidents(limit: number = 5) {
  return useQuery({
    queryKey: ["recent-incidents", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select(`
          *,
          vessel:vessels(name)
        `)
        .order("incident_date", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
  });
}

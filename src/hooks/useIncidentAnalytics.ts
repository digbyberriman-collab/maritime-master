import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, subMonths, startOfYear, format, differenceInDays, parseISO } from "date-fns";

export type DateRangePreset = "last30" | "lastQuarter" | "lastYear" | "ytd" | "all";

interface DateRange {
  start: Date;
  end: Date;
}

export function getDateRangeFromPreset(preset: DateRangePreset): DateRange {
  const now = new Date();
  switch (preset) {
    case "last30":
      return { start: subDays(now, 30), end: now };
    case "lastQuarter":
      return { start: subMonths(now, 3), end: now };
    case "lastYear":
      return { start: subMonths(now, 12), end: now };
    case "ytd":
      return { start: startOfYear(now), end: now };
    case "all":
      return { start: new Date("2000-01-01"), end: now };
    default:
      return { start: subDays(now, 30), end: now };
  }
}

export interface IncidentAnalytics {
  totalIncidents: number;
  previousPeriodTotal: number;
  lostTimeInjuries: number;
  nearMisses: number;
  injuries: number;
  nearMissRatio: string;
  avgDaysToClose: number;
  previousAvgDaysToClose: number;
  byType: { type: string; count: number }[];
  byLocation: { location: string; count: number }[];
  bySeverity: { actual: number; potential: number; count: number }[];
  byMonth: { month: string; total: number; injuries: number; nearMisses: number; pollution: number }[];
  rootCauses: { cause: string; count: number }[];
}

export function useIncidentAnalytics(
  dateRange: DateRange,
  vesselId?: string
) {
  return useQuery({
    queryKey: ["incident-analytics", dateRange.start, dateRange.end, vesselId],
    queryFn: async (): Promise<IncidentAnalytics> => {
      // Get current period incidents
      let query = supabase
        .from("incidents")
        .select("*")
        .gte("incident_date", dateRange.start.toISOString())
        .lte("incident_date", dateRange.end.toISOString());

      if (vesselId) {
        query = query.eq("vessel_id", vesselId);
      }

      const { data: incidents, error } = await query;
      if (error) throw error;

      // Get previous period for comparison
      const periodLength = differenceInDays(dateRange.end, dateRange.start);
      const previousStart = subDays(dateRange.start, periodLength);
      const previousEnd = dateRange.start;

      let previousQuery = supabase
        .from("incidents")
        .select("*")
        .gte("incident_date", previousStart.toISOString())
        .lt("incident_date", previousEnd.toISOString());

      if (vesselId) {
        previousQuery = previousQuery.eq("vessel_id", vesselId);
      }

      const { data: previousIncidents } = await previousQuery;

      // Calculate metrics
      const totalIncidents = incidents?.length || 0;
      const previousPeriodTotal = previousIncidents?.length || 0;

      const nearMisses = incidents?.filter((i) => i.incident_type === "Near Miss").length || 0;
      const injuries = incidents?.filter((i) => i.incident_type === "Injury").length || 0;
      const lostTimeInjuries = incidents?.filter(
        (i) => i.incident_type === "Injury" && i.severity_actual >= 4
      ).length || 0;

      const nearMissRatio = injuries > 0 
        ? `${(nearMisses / injuries).toFixed(1)}:1` 
        : nearMisses > 0 ? `${nearMisses}:0` : "0:0";

      // Calculate average days to close
      const closedIncidents = incidents?.filter((i) => i.status === "Closed") || [];
      const avgDaysToClose = closedIncidents.length > 0
        ? closedIncidents.reduce((acc, i) => {
            const days = differenceInDays(
              parseISO(i.updated_at),
              parseISO(i.incident_date)
            );
            return acc + days;
          }, 0) / closedIncidents.length
        : 0;

      const previousClosed = previousIncidents?.filter((i) => i.status === "Closed") || [];
      const previousAvgDaysToClose = previousClosed.length > 0
        ? previousClosed.reduce((acc, i) => {
            const days = differenceInDays(
              parseISO(i.updated_at),
              parseISO(i.incident_date)
            );
            return acc + days;
          }, 0) / previousClosed.length
        : 0;

      // Group by type
      const typeMap = new Map<string, number>();
      incidents?.forEach((i) => {
        typeMap.set(i.incident_type, (typeMap.get(i.incident_type) || 0) + 1);
      });
      const byType = Array.from(typeMap.entries()).map(([type, count]) => ({ type, count }));

      // Group by location
      const locationMap = new Map<string, number>();
      incidents?.forEach((i) => {
        locationMap.set(i.location, (locationMap.get(i.location) || 0) + 1);
      });
      const byLocation = Array.from(locationMap.entries())
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count);

      // Severity matrix
      const severityMap = new Map<string, number>();
      incidents?.forEach((i) => {
        const key = `${i.severity_actual}-${i.severity_potential}`;
        severityMap.set(key, (severityMap.get(key) || 0) + 1);
      });
      const bySeverity = Array.from(severityMap.entries()).map(([key, count]) => {
        const [actual, potential] = key.split("-").map(Number);
        return { actual, potential, count };
      });

      // Group by month
      const monthMap = new Map<string, { total: number; injuries: number; nearMisses: number; pollution: number }>();
      incidents?.forEach((i) => {
        const month = format(parseISO(i.incident_date), "MMM yyyy");
        const existing = monthMap.get(month) || { total: 0, injuries: 0, nearMisses: 0, pollution: 0 };
        existing.total++;
        if (i.incident_type === "Injury") existing.injuries++;
        if (i.incident_type === "Near Miss") existing.nearMisses++;
        if (i.incident_type === "Pollution") existing.pollution++;
        monthMap.set(month, existing);
      });
      const byMonth = Array.from(monthMap.entries())
        .map(([month, data]) => ({ month, ...data }))
        .sort((a, b) => {
          const dateA = new Date(a.month);
          const dateB = new Date(b.month);
          return dateA.getTime() - dateB.getTime();
        });

      // Root causes
      const rootCauseCategories = {
        "Human Error": ["human", "error", "mistake", "negligence", "training", "fatigue", "distraction"],
        "Equipment Failure": ["equipment", "failure", "malfunction", "breakdown", "mechanical"],
        "Procedural Gap": ["procedure", "policy", "process", "protocol", "sop"],
        "Environmental": ["weather", "sea state", "environment", "visibility", "conditions"],
        "Management System": ["management", "supervision", "communication", "planning"],
      };

      const rootCauseMap = new Map<string, number>();
      incidents?.forEach((i) => {
        const rootCause = (i.root_cause || "").toLowerCase();
        for (const [category, keywords] of Object.entries(rootCauseCategories)) {
          if (keywords.some((k) => rootCause.includes(k))) {
            rootCauseMap.set(category, (rootCauseMap.get(category) || 0) + 1);
            return;
          }
        }
        if (rootCause) {
          rootCauseMap.set("Other", (rootCauseMap.get("Other") || 0) + 1);
        }
      });
      const rootCauses = Array.from(rootCauseMap.entries())
        .map(([cause, count]) => ({ cause, count }))
        .sort((a, b) => b.count - a.count);

      return {
        totalIncidents,
        previousPeriodTotal,
        lostTimeInjuries,
        nearMisses,
        injuries,
        nearMissRatio,
        avgDaysToClose: Math.round(avgDaysToClose),
        previousAvgDaysToClose: Math.round(previousAvgDaysToClose),
        byType,
        byLocation,
        bySeverity,
        byMonth,
        rootCauses,
      };
    },
  });
}

export interface TrendInsight {
  type: "warning" | "positive" | "alert" | "insight";
  icon: string;
  message: string;
}

export function useIncidentInsights(analytics: IncidentAnalytics | undefined) {
  if (!analytics) return [];

  const insights: TrendInsight[] = [];

  // Trend comparison
  if (analytics.previousPeriodTotal > 0) {
    const change = ((analytics.totalIncidents - analytics.previousPeriodTotal) / analytics.previousPeriodTotal) * 100;
    if (change > 20) {
      insights.push({
        type: "warning",
        icon: "⚠️",
        message: `Incidents up ${Math.round(change)}% compared to previous period`,
      });
    } else if (change < -20) {
      insights.push({
        type: "positive",
        icon: "✓",
        message: `Incidents down ${Math.abs(Math.round(change))}% compared to previous period`,
      });
    }
  }

  // Near miss ratio
  const nearMissCount = analytics.nearMisses;
  const injuryCount = analytics.injuries;
  if (injuryCount > 0 && nearMissCount / injuryCount < 10) {
    insights.push({
      type: "insight",
      icon: "📊",
      message: `Near miss ratio is ${analytics.nearMissRatio} - target is 10:1. Consider improving near miss reporting.`,
    });
  }

  // Location analysis
  if (analytics.byLocation.length > 0) {
    const topLocation = analytics.byLocation[0];
    if (topLocation.count > 2) {
      insights.push({
        type: "insight",
        icon: "📊",
        message: `${Math.round((topLocation.count / analytics.totalIncidents) * 100)}% of incidents occur in ${topLocation.location}`,
      });
    }
  }

  // Days to close
  if (analytics.avgDaysToClose > 60) {
    insights.push({
      type: "alert",
      icon: "⏰",
      message: `Average time to close incidents is ${analytics.avgDaysToClose} days - consider process improvements`,
    });
  }

  return insights;
}

export interface VesselComparison {
  vesselId: string;
  vesselName: string;
  totalIncidents: number;
  injuryRate: number;
  nearMisses: number;
  avgDaysToClose: number;
}

export function useVesselComparison(dateRange: DateRange) {
  return useQuery({
    queryKey: ["vessel-comparison", dateRange.start, dateRange.end],
    queryFn: async (): Promise<VesselComparison[]> => {
      const { data: incidents, error } = await supabase
        .from("incidents")
        .select(`
          *,
          vessel:vessels(id, name)
        `)
        .gte("incident_date", dateRange.start.toISOString())
        .lte("incident_date", dateRange.end.toISOString());

      if (error) throw error;

      const vesselMap = new Map<string, {
        vesselName: string;
        total: number;
        injuries: number;
        nearMisses: number;
        closedDays: number[];
      }>();

      incidents?.forEach((i) => {
        const vesselId = i.vessel_id;
        const vesselName = (i.vessel as { name: string })?.name || "Unknown";
        
        const existing = vesselMap.get(vesselId) || {
          vesselName,
          total: 0,
          injuries: 0,
          nearMisses: 0,
          closedDays: [],
        };

        existing.total++;
        if (i.incident_type === "Injury") existing.injuries++;
        if (i.incident_type === "Near Miss") existing.nearMisses++;
        
        if (i.status === "Closed") {
          const days = differenceInDays(parseISO(i.updated_at), parseISO(i.incident_date));
          existing.closedDays.push(days);
        }

        vesselMap.set(vesselId, existing);
      });

      return Array.from(vesselMap.entries()).map(([vesselId, data]) => ({
        vesselId,
        vesselName: data.vesselName,
        totalIncidents: data.total,
        injuryRate: data.total > 0 ? Math.round((data.injuries / data.total) * 100) : 0,
        nearMisses: data.nearMisses,
        avgDaysToClose: data.closedDays.length > 0
          ? Math.round(data.closedDays.reduce((a, b) => a + b, 0) / data.closedDays.length)
          : 0,
      }));
    },
  });
}

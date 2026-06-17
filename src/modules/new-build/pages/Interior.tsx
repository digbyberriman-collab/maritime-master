import { useMemo } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sofa, Layers, CalendarRange, CheckSquare, Users, FileText, MapPin, AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

interface ModuleCardProps {
  to: string;
  icon: React.ElementType;
  title: string;
  description: string;
  count?: number;
  countLabel?: string;
  accent?: boolean;
}

function ModuleCard({ to, icon: Icon, title, description, count, countLabel, accent }: ModuleCardProps) {
  return (
    <Link to={to} className="block group">
      <Card className="h-full transition-all hover:shadow-md hover:border-primary/40 group-hover:bg-accent/30">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${accent ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
              <Icon className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
          </div>
          <CardTitle className="text-base mt-2">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{description}</p>
          {count !== undefined && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-2xl font-bold">{count}</span>
              {countLabel && <span className="text-xs text-muted-foreground">{countLabel}</span>}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Interior() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;

  const { data: interiorAreas = [] } = useQuery({
    queryKey: ["interior-areas", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase.from("areas").select("*").eq("project_id", projectId).eq("is_interior", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: materials = [] } = useQuery({
    queryKey: ["materials", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("materials").select("id").eq("project_id", projectId!);
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: scheduleTasks = [] } = useQuery({
    queryKey: ["schedule-tasks-interior", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedule_tasks").select("id,task_name").eq("project_id", projectId!);
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const interiorTaskCount = useMemo(() => {
    return scheduleTasks.filter((t: any) => /interior|cabin|salon|saloon|stateroom|owner|guest|crew\s*mess|galley|dining/i.test(t.task_name || "")).length;
  }, [scheduleTasks]);

  const interiorAreaIds = useMemo(() => interiorAreas.map((a) => a.id), [interiorAreas]);

  const { data: decisions = [] } = useQuery({
    queryKey: ["decisions-interior", projectId, interiorAreaIds.join(",")],
    queryFn: async () => {
      if (!projectId || interiorAreaIds.length === 0) return [];
      const { data, error } = await supabase.from("decisions").select("id,item_type,raid_status").eq("project_id", projectId).in("area_id", interiorAreaIds);
      if (error) throw error;
      return data;
    },
    enabled: !!projectId && interiorAreaIds.length > 0,
  });

  const openRaidCount = useMemo(
    () => decisions.filter((d: any) => d.item_type !== "decision" && d.raid_status !== "closed" && d.raid_status !== "resolved").length,
    [decisions],
  );

  const { data: interiorDrawings = [] } = useQuery({
    queryKey: ["interior-drawings", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("interior_drawings").select("id").eq("project_id", projectId!);
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  if (!projectId) {
    return <p className="text-muted-foreground">Select a project to view the Interior module.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sofa className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Interior — {currentProject?.name}</h1>
          <p className="text-muted-foreground text-sm">
            Manage materials, drawings, schedule, approvals and contractor demarcation for interior spaces.
          </p>
        </div>
      </div>

      {interiorAreas.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm">
            No areas are tagged as <strong>Interior</strong> yet. Go to{" "}
            <Link to="/areas" className="text-primary underline">Areas</Link> and tick "Interior area" on the relevant ones.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Interior Areas ({interiorAreas.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {interiorAreas.map((a) => (
              <Badge key={a.id} variant="secondary" className="gap-1">
                <MapPin className="h-3 w-3" />
                {a.name}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ModuleCard
          to="/interior/materials"
          icon={Layers}
          title="Materials"
          description="Material library, side-by-side comparison, and the Based Upon development programme."
          count={materials.length}
          countLabel="in library"
        />
        <ModuleCard
          to="/interior/drawings"
          icon={FileText}
          title="Drawings"
          description="Studio Liaigre drawing list with delivery dates and revision approval tracking."
          count={interiorDrawings.length}
          countLabel="drawings"
        />
        <ModuleCard
          to="/interior/schedule"
          icon={CalendarRange}
          title="Schedule"
          description="Interior-related tasks from the project timeline."
          count={interiorTaskCount}
          countLabel="tasks"
        />
        <ModuleCard
          to="/interior/approvals"
          icon={CheckSquare}
          title="Approvals & Decisions"
          description="File approvals, decision timeline, and open RAID items for interior areas."
          count={openRaidCount}
          countLabel="open risks/issues"
          accent={openRaidCount > 0}
        />
        <ModuleCard
          to="/interior/demarcation"
          icon={Users}
          title="Contractor Demarcation"
          description="Scope responsibility assignments per room — who produces drawings, defines materials, and approves."
        />
      </div>
    </div>
  );
}

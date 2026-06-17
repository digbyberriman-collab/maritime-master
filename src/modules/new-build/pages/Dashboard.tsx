import { useMemo } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { supabase } from "@/modules/new-build/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowRightLeft, CheckCircle2, XCircle, AlertTriangle, Clock,
  DollarSign, FileText, GitBranch, ShieldCheck, TrendingUp,
  MapPin, ClipboardCheck, Eye, Flag, Target,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

export default function Index() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;

  // ─── Data queries ───
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["dashboard_co", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_change_orders").select("*").eq("project_id", projectId!).order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ["dashboard_decisions", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_decisions").select("*").eq("project_id", projectId!).order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: files = [] } = useQuery({
    queryKey: ["dashboard_files", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_files").select("*").eq("project_id", projectId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: approvals = [] } = useQuery({
    queryKey: ["dashboard_approvals", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_approvals").select("*, files(name)").order("created_at", { ascending: false });
      if (error) throw error;
      // Filter to current project files
      return (data || []).filter((a: any) => files.some((f) => f.id === a.file_id));
    },
    enabled: files.length > 0,
  });

  const { data: requirements = [] } = useQuery({
    queryKey: ["dashboard_requirements", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_requirements").select("*").eq("project_id", projectId!);
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: reqDeliverables = [] } = useQuery({
    queryKey: ["dashboard_req_deliverables", projectId],
    queryFn: async () => {
      const reqIds = requirements.map((r) => r.id);
      if (!reqIds.length) return [];
      const { data, error } = await supabase.from("nb_requirement_deliverables").select("*").in("requirement_id", reqIds);
      if (error) throw error;
      return data;
    },
    enabled: requirements.length > 0,
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["dashboard_areas", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_areas").select("*").eq("project_id", projectId!);
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: phases = [] } = useQuery({
    queryKey: ["dashboard_phases", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_build_phases").select("*").eq("project_id", projectId!).order("display_order");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ["dashboard_milestones", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_milestones").select("*").eq("project_id", projectId!).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  // ─── Computed stats ───
  const coStats = useMemo(() => {
    const totalCost = changeOrders.reduce((s, co) => s + (Number(co.cost_impact) || 0), 0);
    const approvedCost = changeOrders
      .filter((co) => ["approved", "in_progress", "completed"].includes(co.status))
      .reduce((s, co) => s + (Number(co.cost_impact) || 0), 0);
    const totalDays = changeOrders.reduce((s, co) => s + (co.schedule_impact_days || 0), 0);
    const pending = changeOrders.filter((co) => ["submitted", "under_review"].includes(co.status)).length;
    const approved = changeOrders.filter((co) => ["approved", "in_progress", "completed"].includes(co.status)).length;
    const rejected = changeOrders.filter((co) => co.status === "rejected").length;
    return { total: changeOrders.length, totalCost, approvedCost, totalDays, pending, approved, rejected };
  }, [changeOrders]);

  const decisionStats = useMemo(() => {
    const byStatus = { idea: 0, active: 0, final: 0, changed: 0 };
    decisions.forEach((d) => { byStatus[d.status as keyof typeof byStatus]++; });
    return { total: decisions.length, ...byStatus };
  }, [decisions]);

  const approvalStats = useMemo(() => {
    const pendingApprovals = approvals.filter((a) => a.status === "pending");
    const approvedCount = approvals.filter((a) => a.status === "approved").length;
    const changesNeeded = approvals.filter((a) => a.status === "changes_needed").length;
    return { total: approvals.length, pending: pendingApprovals.length, approved: approvedCount, changesNeeded, pendingItems: pendingApprovals };
  }, [approvals]);

  const reqStats = useMemo(() => {
    const total = requirements.length;
    if (!total) return { total: 0, complete: 0, percent: 0 };
    let complete = 0;
    requirements.forEach((req) => {
      const links = reqDeliverables.filter((rd) => rd.requirement_id === req.id);
      if (links.length === 0) return;
      const allMet = links.every((link) => {
        if (link.deliverable_type === "file") {
          const file = files.find((f) => f.id === link.deliverable_id);
          return file?.status === "approved" || approvals.some((a) => a.file_id === link.deliverable_id && a.status === "approved");
        }
        if (link.deliverable_type === "decision") {
          return decisions.find((d) => d.id === link.deliverable_id)?.status === "final";
        }
        return false;
      });
      if (allMet) complete++;
    });
    return { total, complete, percent: Math.round((complete / total) * 100) };
  }, [requirements, reqDeliverables, files, decisions, approvals]);

  if (!projectId) return <div className="p-8 text-muted-foreground">Select a project first.</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {currentProject?.name} Dashboard
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Live overview across all project areas</p>
      </div>

      {/* ─── Top-level KPI cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={ClipboardCheck} label="Requirements" value={`${reqStats.percent}%`} sub={`${reqStats.complete} of ${reqStats.total} complete`} />
        <KpiCard icon={ArrowRightLeft} label="Change Orders" value={String(coStats.total)} sub={`${coStats.pending} pending review`} />
        <KpiCard icon={GitBranch} label="Decisions" value={String(decisionStats.total)} sub={`${decisionStats.final} finalized`} />
        <KpiCard icon={ShieldCheck} label="Approvals" value={String(approvalStats.pending)} sub={`pending of ${approvalStats.total} total`} />
      </div>

      {/* ─── Build Phase Overview ─── */}
      {phases.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Flag className="h-4 w-4 text-primary" /> Build Phases
              </CardTitle>
              <Link to="/phases" className="text-xs text-primary hover:underline">Manage →</Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-stretch gap-2">
              {phases.map((phase) => {
                const phaseMilestones = milestones.filter((m) => m.phase_id === phase.id);
                const completed = phaseMilestones.filter((m) => m.is_completed).length;
                const progress = phaseMilestones.length ? Math.round((completed / phaseMilestones.length) * 100) : 0;
                const statusColors: Record<string, string> = {
                  planned: "bg-muted text-muted-foreground",
                  active: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
                  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                  on_hold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
                };
                return (
                  <div key={phase.id} className="flex-1 rounded-lg border p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: phase.colour || "#2563EB" }} />
                      <span className="text-xs font-semibold truncate">{phase.name}</span>
                    </div>
                    <Progress value={progress} className="h-1.5 mb-1.5" />
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${statusColors[phase.status] || ""}`}>
                        {phase.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {completed}/{phaseMilestones.length}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Main grid ─── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

        {/* Requirements Progress */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" /> Requirements Completion
              </CardTitle>
              <Link to="/requirements" className="text-xs text-primary hover:underline">View all →</Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Overall progress</span>
                <span className="font-semibold">{reqStats.percent}%</span>
              </div>
              <Progress value={reqStats.percent} className="h-3" />
              <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                <span>{reqStats.complete} complete</span>
                <span>{reqStats.total - reqStats.complete} remaining</span>
                <span>{requirements.filter((r) => !reqDeliverables.some((rd) => rd.requirement_id === r.id)).length} unlinked</span>
              </div>
            </div>
            {/* Per-area breakdown */}
            {areas.length > 0 && (
              <div className="mt-4 space-y-3">
                <Separator />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">By Area</p>
                {areas.map((area) => {
                  const areaReqs = requirements.filter((r) => r.area_id === area.id);
                  if (!areaReqs.length) return null;
                  const areaComplete = areaReqs.filter((req) => {
                    const links = reqDeliverables.filter((rd) => rd.requirement_id === req.id);
                    if (!links.length) return false;
                    return links.every((link) => {
                      if (link.deliverable_type === "file") return files.find((f) => f.id === link.deliverable_id)?.status === "approved";
                      if (link.deliverable_type === "decision") return decisions.find((d) => d.id === link.deliverable_id)?.status === "final";
                      return false;
                    });
                  }).length;
                  const pct = Math.round((areaComplete / areaReqs.length) * 100);
                  return (
                    <div key={area.id} className="flex items-center gap-3">
                      <span className="text-xs w-24 truncate text-muted-foreground">{area.name}</span>
                      <Progress value={pct} className="flex-1 h-2" />
                      <span className="text-xs font-medium w-10 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Change Orders Summary */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-primary" /> Change Orders
              </CardTitle>
              <Link to="/change-orders" className="text-xs text-primary hover:underline">View all →</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat icon={<CheckCircle2 className="h-3.5 w-3.5 text-green-600" />} label="Approved" value={coStats.approved} />
              <MiniStat icon={<AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />} label="Pending" value={coStats.pending} />
              <MiniStat icon={<XCircle className="h-3.5 w-3.5 text-destructive" />} label="Rejected" value={coStats.rejected} />
            </div>
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Total cost impact</span>
                <span className="font-semibold">${coStats.totalCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Approved cost</span>
                <span className="font-semibold">${coStats.approvedCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Schedule impact</span>
                <span className="font-semibold">{coStats.totalDays} days</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Decisions Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" /> Decisions
              </CardTitle>
              <Link to="/decisions" className="text-xs text-primary hover:underline">View all →</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <StatusPill label="Ideas" count={decisionStats.idea} className="bg-muted text-muted-foreground" />
              <StatusPill label="Active" count={decisionStats.active} className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" />
              <StatusPill label="Final" count={decisionStats.final} className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" />
              <StatusPill label="Changed" count={decisionStats.changed} className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" />
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">Recent decisions</p>
            <div className="space-y-1.5">
              {decisions.slice(0, 4).map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span className="truncate flex-1 mr-2">{d.title}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{d.status}</Badge>
                </div>
              ))}
              {decisions.length === 0 && <p className="text-xs text-muted-foreground italic">No decisions yet</p>}
            </div>
          </CardContent>
        </Card>

        {/* Pending Approvals */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> Pending Approvals
              </CardTitle>
              <Link to="/approvals" className="text-xs text-primary hover:underline">View all →</Link>
            </div>
          </CardHeader>
          <CardContent>
            {approvalStats.pending === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
                All caught up — no pending approvals
              </div>
            ) : (
              <ScrollArea className="max-h-48">
                <div className="space-y-2">
                  {approvalStats.pendingItems.slice(0, 6).map((a: any) => {
                    const file = files.find((f) => f.id === a.file_id);
                    return (
                      <div key={a.id} className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1">{file?.name || "Unknown file"}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
            <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" /> {approvalStats.approved} approved</span>
              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-yellow-600" /> {approvalStats.changesNeeded} changes needed</span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Files */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Recent Files
              </CardTitle>
              <Link to="/files" className="text-xs text-primary hover:underline">View all →</Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {files.slice(0, 5).map((f) => {
                const area = areas.find((a) => a.id === f.area_id);
                return (
                  <div key={f.id} className="flex items-center gap-2 text-sm">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{f.status}</Badge>
                  </div>
                );
              })}
              {files.length === 0 && <p className="text-xs text-muted-foreground italic">No files uploaded yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function KpiCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 p-2 rounded-md bg-muted/50">
      {icon}
      <span className="text-lg font-bold">{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function StatusPill({ label, count, className }: { label: string; count: number; className: string }) {
  return (
    <div className={`rounded-md px-3 py-2 text-center ${className}`}>
      <p className="text-lg font-bold">{count}</p>
      <p className="text-[10px]">{label}</p>
    </div>
  );
}

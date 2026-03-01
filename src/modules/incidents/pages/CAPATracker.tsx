import React, { useState } from "react";
import { toast } from "sonner";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { 
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Download,
  FileText,
  User,
  ChevronRight
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { 
  useCAPAMetrics, 
  useCAPAList, 
  useCAPAAging,
  useAssigneePerformance 
} from "@/modules/analytics/hooks/useCAPAAnalytics";
import { useVessels } from "@/modules/vessels/hooks/useVessels";
import { useCrew } from "@/modules/crew/hooks/useCrew";
import { CAPAAgingChart } from "@/modules/analytics/components/CAPAAgingChart";
import { getCAPAStatusColor } from "@/modules/incidents/constants";
import { cn } from "@/lib/utils";

const CAPATracker: React.FC = () => {
  const [vesselFilter, setVesselFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");

  const { vessels } = useVessels();
  const { crew } = useCrew();
  const { data: metrics, isLoading: isMetricsLoading } = useCAPAMetrics();
  const { data: capas, isLoading: isCapasLoading } = useCAPAList({
    vesselId: vesselFilter,
    status: statusFilter,
    type: typeFilter,
    assignedTo: assigneeFilter,
  });
  const { data: aging } = useCAPAAging();
  const { data: assigneePerformance } = useAssigneePerformance();

  const getStatusBadgeClass = (status: string) => {
    const baseColor = getCAPAStatusColor(status);
    return cn("text-white", baseColor);
  };

  const getRowClass = (capa: { is_overdue: boolean; due_date: string; status: string }) => {
    if (capa.status === "Closed") return "bg-success/5";
    if (capa.is_overdue) return "bg-destructive/5";
    
    const daysUntilDue = differenceInDays(new Date(capa.due_date), new Date());
    if (daysUntilDue <= 7) return "bg-warning/5";
    
    return "";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">CAPA Tracker</h1>
            <p className="text-muted-foreground">
              Corrective and Preventive Action management
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => toast.info('Export report feature coming soon')}>
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>

        {/* Metrics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Open CAPAs
              </CardTitle>
              <FileText className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">
                {isMetricsLoading ? "..." : metrics?.totalOpen || 0}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                Requiring action
              </p>
            </CardContent>
          </Card>

          <Card className={cn(
            "shadow-card",
            metrics?.overdue && metrics.overdue > 0 ? "border-destructive" : ""
          )}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Overdue CAPAs
              </CardTitle>
              <AlertCircle className={cn(
                "w-5 h-5",
                metrics?.overdue && metrics.overdue > 0 ? "text-destructive" : "text-muted-foreground"
              )} />
            </CardHeader>
            <CardContent>
              <span className={cn(
                "text-2xl font-bold",
                metrics?.overdue && metrics.overdue > 0 ? "text-destructive" : ""
              )}>
                {isMetricsLoading ? "..." : metrics?.overdue || 0}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                Past due date
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg. Days to Complete
              </CardTitle>
              <Clock className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">
                {isMetricsLoading ? "..." : metrics?.avgDaysToComplete || 0}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                Days from creation to close
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Completion Rate
              </CardTitle>
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">
                {isMetricsLoading ? "..." : `${metrics?.completionRateThisMonth || 0}%`}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                This month ({metrics?.completedThisMonth || 0}/{metrics?.totalThisMonth || 0})
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <Select value={vesselFilter} onValueChange={setVesselFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Vessel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vessels</SelectItem>
                  {vessels?.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Verification">Verification</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Immediate">Immediate</SelectItem>
                  <SelectItem value="Corrective">Corrective</SelectItem>
                  <SelectItem value="Preventive">Preventive</SelectItem>
                </SelectContent>
              </Select>

              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Assigned To" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignees</SelectItem>
                  {crew?.map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.first_name} {c.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* CAPA Table */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>CAPA List</CardTitle>
            <CardDescription>
              {capas?.length || 0} corrective actions found
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CAPA #</TableHead>
                    <TableHead>Incident</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Days Open</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isCapasLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : capas?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No CAPAs found matching the filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    capas?.map((capa) => (
                      <TableRow key={capa.id} className={getRowClass(capa)}>
                        <TableCell className="font-medium">{capa.action_number}</TableCell>
                        <TableCell>
                          {capa.incident_number || "-"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {capa.description}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{capa.action_type}</Badge>
                        </TableCell>
                        <TableCell>{capa.assignee_name}</TableCell>
                        <TableCell>
                          {capa.due_date ? format(new Date(capa.due_date), "dd MMM yyyy") : "-"}
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            capa.is_overdue ? "text-destructive font-medium" : ""
                          )}>
                            {capa.days_open} days
                            {capa.is_overdue && " (overdue)"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusBadgeClass(capa.status)}>
                            {capa.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => toast.info(`Viewing CAPA: ${capa.capa_number}`)}>
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Charts Row */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>CAPA Aging</CardTitle>
              <CardDescription>Distribution by age</CardDescription>
            </CardHeader>
            <CardContent>
              <CAPAAgingChart data={aging || []} />
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Assignee Performance</CardTitle>
              <CardDescription>CAPA management by person</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {assigneePerformance?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No assignee data available
                  </p>
                ) : (
                  assigneePerformance?.slice(0, 5).map((assignee) => (
                    <div key={assignee.userId} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{assignee.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span>{assignee.activeCAPAs} active</span>
                          {assignee.overdueCAPAs > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {assignee.overdueCAPAs} overdue
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={assignee.completionRate} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground w-12">
                          {assignee.completionRate}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Avg. {assignee.avgDaysToComplete} days to complete
                      </p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CAPATracker;

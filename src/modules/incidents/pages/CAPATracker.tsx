import React, { useState } from "react";
import { toast } from "sonner";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/shared/components/common/PageHeader";
import { StatCard, StatGrid } from "@/shared/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle,
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
        <PageHeader
          title="CAPA Tracker"
          description="Corrective and Preventive Action management"
          actions={
            <Button variant="outline" className="gap-2" onClick={() => toast.info('Export report feature coming soon')}>
              <Download className="w-4 h-4" />
              Export Report
            </Button>
          }
        />

        <StatGrid>
          <StatCard
            label="Open CAPAs"
            icon={<FileText className="w-5 h-5 text-muted-foreground" />}
            value={isMetricsLoading ? "..." : metrics?.totalOpen || 0}
            hint="Requiring action"
          />
          <StatCard
            label="Overdue CAPAs"
            icon={<AlertCircle className={cn(
              "w-5 h-5",
              metrics?.overdue && metrics.overdue > 0 ? "text-destructive" : "text-muted-foreground"
            )} />}
            value={isMetricsLoading ? "..." : metrics?.overdue || 0}
            tone={metrics?.overdue && metrics.overdue > 0 ? 'danger' : 'default'}
            hint="Past due date"
          />
          <StatCard
            label="Avg. Days to Complete"
            icon={<Clock className="w-5 h-5 text-muted-foreground" />}
            value={isMetricsLoading ? "..." : metrics?.avgDaysToComplete || 0}
            hint="Days from creation to close"
          />
          <StatCard
            label="Completion Rate"
            icon={<TrendingUp className="w-5 h-5 text-muted-foreground" />}
            value={isMetricsLoading ? "..." : `${metrics?.completionRateThisMonth || 0}%`}
            hint={`This month (${metrics?.completedThisMonth || 0}/${metrics?.totalThisMonth || 0})`}
          />
        </StatGrid>

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
            <CardTitle className="text-base">CAPA List</CardTitle>
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
                          <Button variant="ghost" size="sm" onClick={() => toast.info(`Viewing CAPA: ${capa.action_number}`)}>
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
              <CardTitle className="text-base">CAPA Aging</CardTitle>
              <CardDescription>Distribution by age</CardDescription>
            </CardHeader>
            <CardContent>
              <CAPAAgingChart data={aging || []} />
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Assignee Performance</CardTitle>
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

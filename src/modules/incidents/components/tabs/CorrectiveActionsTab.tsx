import { useState } from "react";
import { format, differenceInDays, isPast } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useCorrectiveActions } from "@/modules/incidents/hooks/useCorrectiveActions";
import { getCAPAStatusColor } from "@/modules/incidents/constants";
import { AddCAPAModal } from "../modals/AddCAPAModal";
import { CAPADetailModal } from "../modals/CAPADetailModal";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  Eye,
  Plus,
} from "lucide-react";

interface CorrectiveActionsTabProps {
  incidentId: string;
  incident: {
    severity_actual: number;
    severity_potential: number;
  };
}

export function CorrectiveActionsTab({ incidentId, incident }: CorrectiveActionsTabProps) {
  const { data: actions, isLoading } = useCorrectiveActions(incidentId);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const getActionTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      Immediate: "bg-critical",
      Corrective: "bg-info",
      Preventive: "bg-purple",
    };
    return (
      <Badge className={cn("text-white", colors[type] || "bg-muted-foreground")}>
        {type}
      </Badge>
    );
  };

  const getDueDateInfo = (dueDate: string) => {
    const due = new Date(dueDate);
    const today = new Date();
    const daysRemaining = differenceInDays(due, today);
    const isOverdue = isPast(due) && daysRemaining < 0;

    return {
      daysRemaining,
      isOverdue,
      label: isOverdue
        ? `${Math.abs(daysRemaining)} days overdue`
        : daysRemaining === 0
        ? "Due today"
        : `${daysRemaining} days remaining`,
    };
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Loading corrective actions...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle className="h-4 w-4" />
            Corrective & Preventive Actions
          </CardTitle>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Corrective Action
          </Button>
        </CardHeader>
        <CardContent>
          {!actions || actions.length === 0 ? (
            <div className="py-8 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No Corrective Actions</h3>
              <p className="text-muted-foreground mb-4">
                Create corrective actions to address the root cause and prevent recurrence.
              </p>
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add First CAPA
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CAPA #</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map((action) => {
                  const dueDateInfo = getDueDateInfo(action.due_date);
                  return (
                    <TableRow key={action.id}>
                      <TableCell>
                        <button
                          className="font-medium text-primary hover:underline"
                          onClick={() => setSelectedAction(action.id)}
                        >
                          {action.action_number}
                        </button>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {action.description}
                      </TableCell>
                      <TableCell>{getActionTypeBadge(action.action_type)}</TableCell>
                      <TableCell>
                        {action.assignee?.first_name} {action.assignee?.last_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {format(new Date(action.due_date), "MMM d, yyyy")}
                          </span>
                          <span
                            className={cn(
                              "text-xs",
                              dueDateInfo.isOverdue
                                ? "text-red-600"
                                : dueDateInfo.daysRemaining <= 7
                                ? "text-yellow-600"
                                : "text-muted-foreground"
                            )}
                          >
                            {action.status !== "Closed" && (
                              <>
                                {dueDateInfo.isOverdue ? (
                                  <Clock className="inline h-3 w-3 mr-1" />
                                ) : (
                                  <Calendar className="inline h-3 w-3 mr-1" />
                                )}
                                {dueDateInfo.label}
                              </>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "text-white",
                            getCAPAStatusColor(action.status || "Open")
                          )}
                        >
                          {action.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedAction(action.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {actions && actions.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-2xl font-bold">{actions.length}</div>
              <div className="text-sm text-muted-foreground">Total CAPAs</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {actions.filter((a) => a.status === "In Progress").length}
              </div>
              <div className="text-sm text-muted-foreground">In Progress</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-2xl font-bold text-red-600">
                {actions.filter((a) => {
                  const dueDateInfo = getDueDateInfo(a.due_date);
                  return dueDateInfo.isOverdue && a.status !== "Closed";
                }).length}
              </div>
              <div className="text-sm text-muted-foreground">Overdue</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {actions.filter((a) => a.status === "Closed").length}
              </div>
              <div className="text-sm text-muted-foreground">Closed</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modals */}
      <AddCAPAModal
        incidentId={incidentId}
        incidentSeverity={Math.max(incident.severity_actual, incident.severity_potential)}
        open={showAddModal}
        onOpenChange={setShowAddModal}
      />

      {selectedAction && (
        <CAPADetailModal
          capaId={selectedAction}
          open={!!selectedAction}
          onOpenChange={(open) => !open && setSelectedAction(null)}
        />
      )}
    </div>
  );
}

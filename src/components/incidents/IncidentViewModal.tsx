import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCorrectiveActions } from "@/hooks/useIncidents";
import {
  getIncidentTypeColor,
  getStatusColor,
  getCAPAStatusColor,
  SEVERITY_LEVELS,
} from "@/lib/incidentConstants";
import {
  AlertCircle,
  Calendar,
  Clock,
  Download,
  FileText,
  MapPin,
  Star,
  User,
  Users,
  X,
} from "lucide-react";

interface IncidentViewModalProps {
  incidentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IncidentViewModal({
  incidentId,
  open,
  onOpenChange,
}: IncidentViewModalProps) {
  const { data: incident, isLoading } = useQuery({
    queryKey: ["incident", incidentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select(`
          *,
          vessels(name),
          reporter:profiles!incidents_reported_by_fkey(first_name, last_name)
        `)
        .eq("id", incidentId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!incidentId,
  });

  const { data: correctiveActions } = useCorrectiveActions(incidentId);

  const renderSeverityStars = (severity: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              "h-4 w-4",
              star <= severity
                ? severity <= 2
                  ? "fill-green-500 text-green-500"
                  : severity === 3
                  ? "fill-yellow-500 text-yellow-500"
                  : severity === 4
                  ? "fill-orange-500 text-orange-500"
                  : "fill-red-500 text-red-500"
                : "text-muted-foreground/30"
            )}
          />
        ))}
      </div>
    );
  };

  if (isLoading || !incident) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading incident...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const personsInvolved = Array.isArray(incident.persons_involved)
    ? incident.persons_involved
    : [];
  const witnesses = Array.isArray(incident.witnesses) ? incident.witnesses : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-red-500" />
              <div>
                <DialogTitle className="text-xl">
                  {incident.incident_number}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    className={cn(
                      "text-white",
                      getIncidentTypeColor(incident.incident_type)
                    )}
                  >
                    {incident.incident_type}
                  </Badge>
                  <Badge
                    className={cn("text-white", getStatusColor(incident.status))}
                  >
                    {incident.status}
                  </Badge>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="flex-shrink-0">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="people">People Involved</TabsTrigger>
            <TabsTrigger value="investigation">Investigation</TabsTrigger>
            <TabsTrigger value="actions">
              CAPAs ({correctiveActions?.length || 0})
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pt-4">
            <TabsContent value="details" className="m-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Incident Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {format(
                          new Date(incident.incident_date),
                          "MMMM d, yyyy 'at' HH:mm"
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {incident.location} - {incident.vessels?.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        Reported by {incident.reporter?.first_name}{" "}
                        {incident.reporter?.last_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        Reported on{" "}
                        {format(new Date(incident.reported_date), "MMM d, yyyy")}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Severity Assessment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        Actual Severity
                      </p>
                      <div className="flex items-center gap-2">
                        {renderSeverityStars(incident.severity_actual)}
                        <span className="text-sm font-medium">
                          {
                            SEVERITY_LEVELS.find(
                              (l) => l.value === incident.severity_actual
                            )?.label
                          }
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        Potential Severity
                      </p>
                      <div className="flex items-center gap-2">
                        {renderSeverityStars(incident.severity_potential)}
                        <span className="text-sm font-medium">
                          {
                            SEVERITY_LEVELS.find(
                              (l) => l.value === incident.severity_potential
                            )?.label
                          }
                        </span>
                      </div>
                    </div>
                    {incident.dpa_notified && (
                      <Badge variant="outline" className="text-orange-600">
                        DPA Notified{" "}
                        {incident.dpa_notified_date &&
                          format(
                            new Date(incident.dpa_notified_date),
                            "MMM d, yyyy"
                          )}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Description
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">
                    {incident.description}
                  </p>
                </CardContent>
              </Card>

              {incident.immediate_action && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Immediate Actions Taken
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">
                      {incident.immediate_action}
                    </p>
                  </CardContent>
                </Card>
              )}

              {incident.attachments && Array.isArray(incident.attachments) && incident.attachments.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Attachments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {(incident.attachments as string[]).map((url, index) => (
                        <a
                          key={index}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 border rounded hover:bg-muted"
                        >
                          <FileText className="h-4 w-4" />
                          <span className="text-sm truncate">
                            Attachment {index + 1}
                          </span>
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="people" className="m-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Persons Involved ({personsInvolved.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {personsInvolved.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No persons recorded as involved in this incident.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {personsInvolved.map((person: any, index: number) => (
                        <div
                          key={index}
                          className="p-3 border rounded-lg space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{person.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {person.role}
                              </p>
                            </div>
                            {person.injured && (
                              <Badge variant="destructive">Injured</Badge>
                            )}
                          </div>
                          {person.injured && person.injuryDetails && (
                            <p className="text-sm text-red-600">
                              {person.injuryDetails}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Witnesses ({witnesses.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {witnesses.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No witnesses recorded for this incident.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {witnesses.map((witness: any, index: number) => (
                        <div key={index} className="p-3 border rounded-lg">
                          <p className="font-medium mb-2">{witness.name}</p>
                          <p className="text-sm text-muted-foreground italic">
                            "{witness.statement}"
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="investigation" className="m-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Investigation Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="text-base py-1 px-3">
                      {incident.investigation_status}
                    </Badge>
                    {incident.investigation_required && (
                      <span className="text-sm text-muted-foreground">
                        Investigation required for this incident
                      </span>
                    )}
                  </div>

                  {incident.root_cause && (
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-1">Root Cause</p>
                      <p className="text-sm">{incident.root_cause}</p>
                    </div>
                  )}

                  {incident.contributing_factors &&
                    incident.contributing_factors.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-medium mb-2">
                          Contributing Factors
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {incident.contributing_factors.map(
                            (factor: string, index: number) => (
                              <Badge key={index} variant="secondary">
                                {factor}
                              </Badge>
                            )
                          )}
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="actions" className="m-0 space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Corrective & Preventive Actions</CardTitle>
                  <Button size="sm">
                    Add CAPA
                  </Button>
                </CardHeader>
                <CardContent>
                  {!correctiveActions || correctiveActions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No corrective actions created for this incident yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {correctiveActions.map((action) => (
                        <div
                          key={action.id}
                          className="p-3 border rounded-lg space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {action.action_number}
                              </span>
                              <Badge variant="outline">{action.action_type}</Badge>
                            </div>
                            <Badge
                              className={cn(
                                "text-white",
                                getCAPAStatusColor(action.status)
                              )}
                            >
                              {action.status}
                            </Badge>
                          </div>
                          <p className="text-sm">{action.description}</p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>
                              Assigned to: {action.assignee?.first_name}{" "}
                              {action.assignee?.last_name}
                            </span>
                            <span>Due: {format(new Date(action.due_date), "MMM d, yyyy")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

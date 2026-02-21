import { useState } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { useCorrectiveActions } from "@/modules/incidents/hooks/useCorrectiveActions";
import { useToast } from "@/shared/hooks/use-toast";
import {
  getIncidentTypeColor,
  getStatusColor,
} from "@/modules/incidents/constants";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Download,
  Edit,
  FileText,
  Lock,
} from "lucide-react";
import { OverviewTab } from "./tabs/OverviewTab";
import { InvestigationTab } from "./tabs/InvestigationTab";
import { CorrectiveActionsTab } from "./tabs/CorrectiveActionsTab";
import { TimelineTab } from "./tabs/TimelineTab";

interface IncidentDetailViewProps {
  incidentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IncidentDetailView({
  incidentId,
  open,
  onOpenChange,
}: IncidentDetailViewProps) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: incident, isLoading } = useQuery({
    queryKey: ["incident", incidentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select(`
          *,
          vessels(name),
          reporter:profiles!incidents_reported_by_fkey(first_name, last_name, role)
        `)
        .eq("id", incidentId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!incidentId,
  });

  const { data: correctiveActions } = useCorrectiveActions(incidentId);

  const canEdit = incident && 
    incident.status === "Open" && 
    (incident.reported_by === user?.id || profile?.role === "dpa");

  const canCloseIncident = 
    profile?.role === "dpa" &&
    correctiveActions?.every((a) => a.status === "Closed") &&
    incident?.status !== "Closed";

  const handleCloseIncident = async () => {
    if (!incident) return;

    try {
      const { error } = await supabase
        .from("incidents")
        .update({ status: "Closed" })
        .eq("id", incident.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["incident-timeline"] });
      
      toast({
        title: "Incident Closed",
        description: `${incident.incident_number} has been closed.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to close incident",
        variant: "destructive",
      });
    }
  };

  const handleExportPDF = () => {
    toast({
      title: "Export Started",
      description: "PDF export functionality coming soon.",
    });
  };

  if (isLoading || !incident) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading incident...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const capaCount = correctiveActions?.length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header Section */}
        <DialogHeader className="flex-shrink-0 pb-4 border-b">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div>
                <DialogTitle className="text-2xl font-bold">
                  {incident.incident_number}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-2">
                  <Badge
                    className={cn(
                      "text-white",
                      getIncidentTypeColor(incident.incident_type)
                    )}
                  >
                    {incident.incident_type}
                  </Badge>
                  <Badge
                    className={cn("text-white", getStatusColor(incident.status || "Open"))}
                  >
                    {incident.status}
                  </Badge>
                  {incident.investigation_required && (
                    <Badge variant="outline">
                      Investigation: {incident.investigation_status}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canEdit && (
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleExportPDF}>
                <FileText className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
              {canCloseIncident && (
                <Button 
                  size="sm" 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleCloseIncident}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Close Incident
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <Tabs 
          value={activeTab} 
          onValueChange={setActiveTab} 
          className="flex-1 overflow-hidden flex flex-col"
        >
          <TabsList className="flex-shrink-0 w-full justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="investigation">Investigation</TabsTrigger>
            <TabsTrigger value="actions" className="flex items-center gap-2">
              Corrective Actions
              {capaCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {capaCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pt-4">
            <TabsContent value="overview" className="m-0">
              <OverviewTab incident={incident} />
            </TabsContent>

            <TabsContent value="investigation" className="m-0">
              <InvestigationTab incident={incident} />
            </TabsContent>

            <TabsContent value="actions" className="m-0">
              <CorrectiveActionsTab incidentId={incidentId} incident={incident} />
            </TabsContent>

            <TabsContent value="timeline" className="m-0">
              <TimelineTab incidentId={incidentId} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useCrew } from "@/hooks/useCrew";
import {
  useInvestigation,
  useUpdateInvestigation,
  useCompleteInvestigation,
  useApproveInvestigation,
} from "@/hooks/useInvestigation";
import { StartInvestigationModal } from "../modals/StartInvestigationModal";
import {
  AlertCircle,
  Check,
  CheckCircle,
  Clock,
  FileSearch,
  Plus,
  Save,
  User,
  Users,
  X,
} from "lucide-react";

interface InvestigationTabProps {
  incident: {
    id: string;
    investigation_required: boolean | null;
    investigation_status: string | null;
    severity_actual: number;
    severity_potential: number;
  };
}

const INVESTIGATION_STATUSES = [
  { value: "Not Started", label: "Not Started", color: "bg-muted text-muted-foreground" },
  { value: "In Progress", label: "In Progress", color: "bg-blue-500 text-white" },
  { value: "Completed", label: "Completed", color: "bg-yellow-500 text-white" },
  { value: "Approved", label: "Approved", color: "bg-green-500 text-white" },
];

export function InvestigationTab({ incident }: InvestigationTabProps) {
  const { profile } = useAuth();
  const { data: investigation, isLoading } = useInvestigation(incident.id);
  const updateInvestigation = useUpdateInvestigation();
  const completeInvestigation = useCompleteInvestigation();
  const approveInvestigation = useApproveInvestigation();

  const [showStartModal, setShowStartModal] = useState(false);
  const [findings, setFindings] = useState(investigation?.findings || "");
  const [rootCause, setRootCause] = useState(investigation?.root_cause || "");
  const [contributingFactors, setContributingFactors] = useState<string[]>(
    investigation?.contributing_factors || []
  );
  const [recommendations, setRecommendations] = useState<string[]>(
    investigation?.recommendations || []
  );
  const [newFactor, setNewFactor] = useState("");
  const [newRecommendation, setNewRecommendation] = useState("");
  const [whys, setWhys] = useState<string[]>(["", "", "", "", ""]);
  const [hasChanges, setHasChanges] = useState(false);

  const isDPA = profile?.role === "dpa";
  const isMaster = profile?.role === "master";
  const canApprove = isDPA || isMaster;
  const isCompleted = investigation?.completed_date !== null;
  const isApproved = investigation?.approved_date !== null;

  const handleSaveChanges = () => {
    if (!investigation) return;

    updateInvestigation.mutate({
      id: investigation.id,
      findings,
      root_cause: rootCause,
      contributing_factors: contributingFactors,
      recommendations,
    });
    setHasChanges(false);
  };

  const handleComplete = () => {
    if (!investigation) return;
    completeInvestigation.mutate(investigation.id);
  };

  const handleApprove = () => {
    if (!investigation) return;
    approveInvestigation.mutate(investigation.id);
  };

  const addContributingFactor = () => {
    if (newFactor.trim()) {
      setContributingFactors([...contributingFactors, newFactor.trim()]);
      setNewFactor("");
      setHasChanges(true);
    }
  };

  const removeContributingFactor = (index: number) => {
    setContributingFactors(contributingFactors.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const addRecommendation = () => {
    if (newRecommendation.trim()) {
      setRecommendations([...recommendations, newRecommendation.trim()]);
      setNewRecommendation("");
      setHasChanges(true);
    }
  };

  const removeRecommendation = (index: number) => {
    setRecommendations(recommendations.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  // Update local state when investigation data loads
  useState(() => {
    if (investigation) {
      setFindings(investigation.findings || "");
      setRootCause(investigation.root_cause || "");
      setContributingFactors(investigation.contributing_factors || []);
      setRecommendations(investigation.recommendations || []);
    }
  });

  if (!incident.investigation_required) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">Investigation Not Required</h3>
          <p className="text-muted-foreground">
            Based on the severity assessment, a formal investigation is not required for this incident.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Loading investigation details...</p>
        </CardContent>
      </Card>
    );
  }

  // Investigation not started
  if (!investigation) {
    return (
      <>
        <Card>
          <CardContent className="py-8 text-center">
            <FileSearch className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Investigation Required</h3>
            <p className="text-muted-foreground mb-4">
              This incident requires a formal investigation due to its severity level.
            </p>
            <Button onClick={() => setShowStartModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Start Investigation
            </Button>
          </CardContent>
        </Card>

        <StartInvestigationModal
          incidentId={incident.id}
          open={showStartModal}
          onOpenChange={setShowStartModal}
        />
      </>
    );
  }

  const currentStatus = INVESTIGATION_STATUSES.find(
    (s) => s.value === incident.investigation_status
  );

  return (
    <div className="space-y-4">
      {/* Progress Indicator */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            {INVESTIGATION_STATUSES.map((status, index) => {
              const isActive = status.value === incident.investigation_status;
              const isPast = INVESTIGATION_STATUSES.findIndex(
                (s) => s.value === incident.investigation_status
              ) > index;

              return (
                <div key={status.value} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                        isActive || isPast
                          ? status.color
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {isPast ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span className={cn(
                      "text-xs mt-1",
                      isActive ? "font-medium" : "text-muted-foreground"
                    )}>
                      {status.label}
                    </span>
                  </div>
                  {index < INVESTIGATION_STATUSES.length - 1 && (
                    <div
                      className={cn(
                        "w-16 h-0.5 mx-2",
                        isPast ? "bg-primary" : "bg-muted"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Investigation Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Investigation Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-muted-foreground">Lead Investigator</Label>
            <p className="font-medium">
              {investigation.lead_investigator_profile?.first_name}{" "}
              {investigation.lead_investigator_profile?.last_name}
            </p>
          </div>
          <div>
            <Label className="text-muted-foreground">Method</Label>
            <p className="font-medium">{investigation.investigation_method || "Not specified"}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Team Members</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {investigation.investigation_team.length > 0 ? (
                investigation.investigation_team.map((member, index) => (
                  <Badge key={index} variant="secondary">
                    {member.name}
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground text-sm">No team members assigned</span>
              )}
            </div>
          </div>
          <div>
            <Label className="text-muted-foreground">Started</Label>
            <p className="font-medium">
              {format(new Date(investigation.created_at), "MMM d, yyyy")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Investigation Method Tools */}
      {investigation.investigation_method === "5 Whys" && !isCompleted && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">5 Whys Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {whys.map((why, index) => (
              <div key={index}>
                <Label>Why #{index + 1}</Label>
                <Textarea
                  placeholder={`Enter why #${index + 1}...`}
                  value={why}
                  onChange={(e) => {
                    const newWhys = [...whys];
                    newWhys[index] = e.target.value;
                    setWhys(newWhys);
                    setHasChanges(true);
                  }}
                  disabled={isCompleted}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Findings Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Findings & Root Cause</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Findings</Label>
            <Textarea
              placeholder="Document your investigation findings..."
              value={findings}
              onChange={(e) => {
                setFindings(e.target.value);
                setHasChanges(true);
              }}
              disabled={isCompleted}
              className="min-h-[100px]"
            />
          </div>

          <div>
            <Label>Root Cause</Label>
            <Textarea
              placeholder="Identify the root cause of the incident..."
              value={rootCause}
              onChange={(e) => {
                setRootCause(e.target.value);
                setHasChanges(true);
              }}
              disabled={isCompleted}
            />
          </div>

          <div>
            <Label>Contributing Factors</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {contributingFactors.map((factor, index) => (
                <Badge key={index} variant="secondary" className="flex items-center gap-1">
                  {factor}
                  {!isCompleted && (
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => removeContributingFactor(index)}
                    />
                  )}
                </Badge>
              ))}
            </div>
            {!isCompleted && (
              <div className="flex gap-2">
                <Input
                  placeholder="Add contributing factor..."
                  value={newFactor}
                  onChange={(e) => setNewFactor(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addContributingFactor()}
                />
                <Button variant="outline" size="sm" onClick={addContributingFactor}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div>
            <Label>Recommendations</Label>
            <ul className="space-y-1 mb-2">
              {recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-primary">•</span>
                  <span className="flex-1">{rec}</span>
                  {!isCompleted && (
                    <X
                      className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-destructive"
                      onClick={() => removeRecommendation(index)}
                    />
                  )}
                </li>
              ))}
            </ul>
            {!isCompleted && (
              <div className="flex gap-2">
                <Input
                  placeholder="Add recommendation..."
                  value={newRecommendation}
                  onChange={(e) => setNewRecommendation(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRecommendation()}
                />
                <Button variant="outline" size="sm" onClick={addRecommendation}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {!isApproved && (
        <div className="flex justify-end gap-2">
          {!isCompleted && hasChanges && (
            <Button
              variant="outline"
              onClick={handleSaveChanges}
              disabled={updateInvestigation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          )}
          {!isCompleted && findings && rootCause && (
            <Button
              onClick={handleComplete}
              disabled={completeInvestigation.isPending}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Complete Investigation
            </Button>
          )}
          {isCompleted && !isApproved && canApprove && (
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={handleApprove}
              disabled={approveInvestigation.isPending}
            >
              <Check className="h-4 w-4 mr-2" />
              Approve Investigation
            </Button>
          )}
        </div>
      )}

      {/* Approval Info */}
      {isApproved && investigation.approver_profile && (
        <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">
                Investigation Approved
              </p>
              <p className="text-sm text-green-600 dark:text-green-400">
                Approved by {investigation.approver_profile.first_name}{" "}
                {investigation.approver_profile.last_name} on{" "}
                {format(new Date(investigation.approved_date!), "MMM d, yyyy")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

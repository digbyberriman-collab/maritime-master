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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useMarkCAPAInProgress,
  useRequestCAPAVerification,
  useVerifyCAPAction,
  useUploadCAPAEvidence,
  CorrectiveAction,
} from "@/modules/incidents/hooks/useCorrectiveActions";
import { getCAPAStatusColor } from "@/modules/incidents/constants";
import {
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Upload,
  User,
  X,
} from "lucide-react";

interface CAPADetailModalProps {
  capaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CAPADetailModal({ capaId, open, onOpenChange }: CAPADetailModalProps) {
  const { profile, user } = useAuth();
  const markInProgress = useMarkCAPAInProgress();
  const requestVerification = useRequestCAPAVerification();
  const verifyCapa = useVerifyCAPAction();
  const uploadEvidence = useUploadCAPAEvidence();

  const [notes, setNotes] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data: capa, isLoading } = useQuery({
    queryKey: ["capa", capaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("corrective_actions")
        .select(`
          *,
          assignee:profiles!corrective_actions_assigned_to_fkey(first_name, last_name),
          assigner:profiles!corrective_actions_assigned_by_fkey(first_name, last_name),
          verifier:profiles!corrective_actions_verified_by_fkey(first_name, last_name)
        `)
        .eq("id", capaId)
        .single();

      if (error) throw error;
      return data as CorrectiveAction;
    },
    enabled: !!capaId,
  });

  const isDPA = profile?.role === "dpa";
  const isMaster = profile?.role === "master";
  const isAssignee = capa?.assigned_to === user?.id;
  const canVerify = isDPA || isMaster;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const url = await uploadEvidence.mutateAsync(file);
        setEvidenceUrls((prev) => [...prev, url]);
      } catch (error) {
        console.error("Upload failed:", error);
      }
    }
    setUploading(false);
  };

  const handleMarkInProgress = () => {
    markInProgress.mutate({ id: capaId, notes });
  };

  const handleRequestVerification = () => {
    const allEvidence = [...(capa?.evidence_urls || []), ...evidenceUrls];
    requestVerification.mutate({
      id: capaId,
      notes,
      evidenceUrls: allEvidence,
    });
  };

  const handleVerify = (approved: boolean) => {
    verifyCapa.mutate({ id: capaId, approved, notes });
  };

  if (isLoading || !capa) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="py-8 text-center">
            <p className="text-muted-foreground">Loading CAPA details...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">{capa.action_number}</DialogTitle>
            <Badge className={cn("text-white", getCAPAStatusColor(capa.status || "Open"))}>
              {capa.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Details */}
          <Card>
            <CardContent className="pt-4 grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Type</Label>
                <p className="font-medium">{capa.action_type}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Due Date</Label>
                <p className="font-medium flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(capa.due_date), "MMM d, yyyy")}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Assigned To</Label>
                <p className="font-medium flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {capa.assignee?.first_name} {capa.assignee?.last_name}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Assigned By</Label>
                <p className="font-medium">
                  {capa.assigner?.first_name} {capa.assigner?.last_name}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Description */}
          <div>
            <Label>Description</Label>
            <p className="text-sm mt-1">{capa.description}</p>
          </div>

          {/* Evidence */}
          {(capa.evidence_urls?.length > 0 || evidenceUrls.length > 0) && (
            <div>
              <Label>Evidence</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {[...(capa.evidence_urls || []), ...evidenceUrls].map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4" />
                    Evidence {i + 1}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Upload Evidence (for assignee) */}
          {isAssignee && capa.status !== "Closed" && (
            <div>
              <Label>Upload Evidence</Label>
              <div className="mt-2">
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  id="evidence-upload"
                  disabled={uploading}
                />
                <label htmlFor="evidence-upload">
                  <Button variant="outline" asChild disabled={uploading}>
                    <span>
                      <Upload className="h-4 w-4 mr-2" />
                      {uploading ? "Uploading..." : "Upload Files"}
                    </span>
                  </Button>
                </label>
              </div>
            </div>
          )}

          {/* Notes */}
          {capa.status !== "Closed" && (
            <div>
              <Label>Notes</Label>
              <Textarea
                placeholder="Add notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
              />
            </div>
          )}

          {/* Completion Info */}
          {capa.completion_notes && (
            <div>
              <Label>Completion Notes</Label>
              <p className="text-sm mt-1">{capa.completion_notes}</p>
            </div>
          )}

          {/* Verification Info */}
          {capa.verified_by && capa.verifier && (
            <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
              <CardContent className="py-3 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm">
                  Verified by {capa.verifier.first_name} {capa.verifier.last_name} on{" "}
                  {format(new Date(capa.verified_date!), "MMM d, yyyy")}
                </span>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            {isAssignee && capa.status === "Open" && (
              <Button onClick={handleMarkInProgress} disabled={markInProgress.isPending}>
                <Clock className="h-4 w-4 mr-2" />
                Mark In Progress
              </Button>
            )}
            {isAssignee && capa.status === "In Progress" && (
              <Button
                onClick={handleRequestVerification}
                disabled={requestVerification.isPending || evidenceUrls.length === 0}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Request Verification
              </Button>
            )}
            {canVerify && capa.status === "Verification" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleVerify(false)}
                  disabled={verifyCapa.isPending}
                >
                  <X className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => handleVerify(true)}
                  disabled={verifyCapa.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve & Close
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

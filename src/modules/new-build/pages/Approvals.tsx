import { useState } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Plus, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type ApprovalStatus = "pending" | "approved" | "changes_needed";

const statusConfig: Record<ApprovalStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: Clock },
  approved: { label: "Approved", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  changes_needed: { label: "Changes Needed", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: AlertCircle },
};

export default function Approvals() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [reviewingApproval, setReviewingApproval] = useState<any>(null);
  const [reviewStatus, setReviewStatus] = useState<ApprovalStatus>("approved");
  const [reviewComment, setReviewComment] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const projectId = currentProject?.id;
  const placeholderUserId = "00000000-0000-0000-0000-000000000000";

  // Fetch approvals with file info
  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ["approvals", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("approvals")
        .select("*, files!approvals_file_id_fkey(name, version, project_id, status)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Filter by project on client side since approval doesn't have project_id
      return data.filter((a: any) => a.files?.project_id === projectId);
    },
    enabled: !!projectId,
  });

  // Fetch files eligible for submission (draft or review status)
  const { data: eligibleFiles = [] } = useQuery({
    queryKey: ["files-for-approval", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("files")
        .select("id, name, version, status")
        .eq("project_id", projectId)
        .in("status", ["draft", "review"])
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const submitMutation = useMutation({
    mutationFn: async (fileId: string) => {
      // Set file status to review
      await supabase.from("files").update({ status: "review" }).eq("id", fileId);
      // Create approval record
      const { error } = await supabase.from("approvals").insert({
        file_id: fileId,
        submitted_by: placeholderUserId,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals", projectId] });
      queryClient.invalidateQueries({ queryKey: ["files", projectId] });
      queryClient.invalidateQueries({ queryKey: ["files-for-approval", projectId] });
      toast({ title: "File submitted for approval" });
      setSubmitDialogOpen(false);
      setSelectedFileId("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ approvalId, status, comment }: { approvalId: string; status: ApprovalStatus; comment: string }) => {
      const { error } = await supabase
        .from("approvals")
        .update({
          status,
          comment: comment || null,
          approver_id: placeholderUserId,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", approvalId);
      if (error) throw error;

      // If approved, update file status
      if (status === "approved" && reviewingApproval?.file_id) {
        await supabase.from("files").update({ status: "approved" }).eq("id", reviewingApproval.file_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals", projectId] });
      queryClient.invalidateQueries({ queryKey: ["files", projectId] });
      queryClient.invalidateQueries({ queryKey: ["files-for-approval", projectId] });
      toast({ title: "Review submitted" });
      setReviewDialogOpen(false);
      setReviewingApproval(null);
      setReviewComment("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openReview = (approval: any) => {
    setReviewingApproval(approval);
    setReviewStatus("approved");
    setReviewComment(approval.comment || "");
    setReviewDialogOpen(true);
  };

  const filtered = statusFilter === "all"
    ? approvals
    : approvals.filter((a) => a.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Approvals — {currentProject?.name}</h1>
          <p className="text-muted-foreground mt-1">Submit files for review and track approval status</p>
        </div>
        <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Submit for Approval</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit File for Approval</DialogTitle>
              <DialogDescription>Select a file to submit for team review.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Select File</Label>
                <Select value={selectedFileId || "none"} onValueChange={(v) => setSelectedFileId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Choose a file…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose a file…</SelectItem>
                    {eligibleFiles.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name} (v{f.version})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>Cancel</Button>
                <Button disabled={!selectedFileId || submitMutation.isPending} onClick={() => submitMutation.mutate(selectedFileId)}>
                  {submitMutation.isPending ? "Submitting…" : "Submit"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} onClick={() => setStatusFilter("all")}>
          All ({approvals.length})
        </Button>
        {(Object.keys(statusConfig) as ApprovalStatus[]).map((s) => {
          const count = approvals.filter((a) => a.status === s).length;
          return (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}>
              {statusConfig[s].label} ({count})
            </Button>
          );
        })}
      </div>

      {/* Approval list */}
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No approvals yet. Submit a file for review to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const config = statusConfig[a.status as ApprovalStatus];
            const Icon = config.icon;
            return (
              <Card key={a.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Icon className="h-4 w-4 shrink-0" />
                        <CardTitle className="text-base">{(a as any).files?.name || "Unknown file"}</CardTitle>
                        <Badge variant="outline" className="text-xs">v{(a as any).files?.version || 1}</Badge>
                        <Badge className={config.color}>{config.label}</Badge>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(a.created_at), "MMM d, yyyy")}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {a.comment && (
                    <p className="text-sm text-muted-foreground mb-2">
                      <span className="font-medium">Comment:</span> {a.comment}
                    </p>
                  )}
                  {a.resolved_at && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Resolved {format(new Date(a.resolved_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  )}
                  {a.status === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => openReview(a)}>
                      Review
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={(open) => { if (!open) { setReviewDialogOpen(false); setReviewingApproval(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review: {reviewingApproval?.files?.name}</DialogTitle>
            <DialogDescription>Approve or request changes for this file.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Decision</Label>
              <Select value={reviewStatus} onValueChange={(v) => setReviewStatus(v as ApprovalStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approve</SelectItem>
                  <SelectItem value="changes_needed">Changes Needed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Comment</Label>
              <Textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Optional feedback…" rows={3} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
              <Button
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ approvalId: reviewingApproval.id, status: reviewStatus, comment: reviewComment })}
              >
                {reviewMutation.isPending ? "Submitting…" : "Submit Review"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useMemo, useCallback } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import {
  Plus, Trash2, FileText, GitBranch, Link2, Unlink,
  DollarSign, Clock, ArrowRightLeft, MessageSquare,
  ChevronRight, TrendingUp, AlertTriangle, CheckCircle2,
  XCircle, Eye,
} from "lucide-react";
import { format } from "date-fns";

type COStatus = "draft" | "submitted" | "under_review" | "approved" | "in_progress" | "completed" | "rejected";

const MILESTONE_STATUSES: COStatus[] = ["submitted", "approved", "rejected", "completed"];

const STATUS_OPTIONS: { value: COStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

const statusColors: Record<COStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  in_progress: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  rejected: "bg-destructive/20 text-destructive",
};

interface COForm {
  title: string;
  description: string;
  requested_by_name: string;
  date_requested: string;
  area_id: string;
  status: COStatus;
  cost_impact: string;
  schedule_impact_days: string;
}

const emptyForm: COForm = {
  title: "", description: "", requested_by_name: "", date_requested: new Date().toISOString().slice(0, 10),
  area_id: "", status: "draft", cost_impact: "0", schedule_impact_days: "0",
};

export default function ChangeOrders() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const projectId = currentProject?.id;

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<COForm>(emptyForm);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [statusFilter, setStatusFilter] = useState<COStatus | "all">("all");
  const [showLink, setShowLink] = useState<string | null>(null);

  // ─── Queries ───
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change_orders", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nb_change_orders")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["change_order_activity", detailId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nb_change_order_activity")
        .select("*")
        .eq("change_order_id", detailId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!detailId,
  });

  const { data: coDeliverables = [] } = useQuery({
    queryKey: ["change_order_deliverables", projectId],
    queryFn: async () => {
      const coIds = changeOrders.map((co) => co.id);
      if (!coIds.length) return [];
      const { data, error } = await supabase.from("nb_change_order_deliverables").select("*").in("change_order_id", coIds);
      if (error) throw error;
      return data;
    },
    enabled: changeOrders.length > 0,
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["areas", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_areas").select("*").eq("project_id", projectId!);
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: files = [] } = useQuery({
    queryKey: ["files", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_files").select("*").eq("project_id", projectId!);
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ["decisions", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_decisions").select("*").eq("project_id", projectId!);
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const getProfileName = (uid: string) => profiles.find((p) => p.id === uid)?.full_name || "Unknown";

  // ─── Mutations ───
  const saveMutation = useMutation({
    mutationFn: async (isEdit: boolean) => {
      const payload = {
        title: form.title,
        description: form.description || null,
        requested_by_name: form.requested_by_name || null,
        date_requested: form.date_requested || null,
        area_id: form.area_id || null,
        status: form.status,
        cost_impact: parseFloat(form.cost_impact) || 0,
        schedule_impact_days: parseInt(form.schedule_impact_days) || 0,
        project_id: projectId!,
        created_by: user!.id,
      };
      if (isEdit) {
        // Get old status for activity log
        const old = changeOrders.find((co) => co.id === editId);
        const { error } = await supabase.from("nb_change_orders").update(payload).eq("id", editId!);
        if (error) throw error;
        // Auto-log status change
        if (old && old.status !== form.status) {
          await supabase.from("nb_change_order_activity").insert({
            change_order_id: editId!,
            activity_type: "status_change",
            from_status: old.status,
            to_status: form.status,
            created_by: user!.id,
          });
          // Send in-app notifications on key milestones
          if (MILESTONE_STATUSES.includes(form.status)) {
            const statusLabel = form.status.replace("_", " ");
            const notifyUserIds = new Set<string>();
            // Notify the creator
            if (old.created_by !== user!.id) notifyUserIds.add(old.created_by);
            // Also notify the current user if they aren't the one making the change (edge case)
            const notifications = Array.from(notifyUserIds).map((uid) => ({
              user_id: uid,
              title: `Change Order ${statusLabel}`,
              message: `"${form.title}" has been moved to ${statusLabel}.`,
              type: "change_order",
              reference_id: editId!,
            }));
            if (notifications.length) {
              await supabase.from("notifications").insert(notifications);
            }
          }
        }
      } else {
        const { data, error } = await supabase.from("nb_change_orders").insert(payload).select().single();
        if (error) throw error;
        // Log creation
        await supabase.from("nb_change_order_activity").insert({
          change_order_id: data.id,
          activity_type: "status_change",
          to_status: form.status,
          comment: "Change order created",
          created_by: user!.id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change_orders"] });
      qc.invalidateQueries({ queryKey: ["change_order_activity"] });
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
      toast({ title: editId ? "Change order updated" : "Change order created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nb_change_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change_orders"] });
      setDetailId(null);
      toast({ title: "Change order deleted" });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("nb_change_order_activity").insert({
        change_order_id: detailId!,
        activity_type: "comment",
        comment: comment,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change_order_activity"] });
      setComment("");
      toast({ title: "Comment added" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (p: { change_order_id: string; deliverable_type: string; deliverable_id: string }) => {
      const { error } = await supabase.from("nb_change_order_deliverables").insert({ ...p, linked_by: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change_order_deliverables"] });
      toast({ title: "Deliverable linked" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nb_change_order_deliverables").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["change_order_deliverables"] });
      toast({ title: "Deliverable unlinked" });
    },
  });

  // ─── Stats ───
  const stats = useMemo(() => {
    const totalCost = changeOrders.reduce((s, co) => s + (Number(co.cost_impact) || 0), 0);
    const totalDays = changeOrders.reduce((s, co) => s + (co.schedule_impact_days || 0), 0);
    const approved = changeOrders.filter((co) => ["approved", "in_progress", "completed"].includes(co.status)).length;
    const pending = changeOrders.filter((co) => ["submitted", "under_review"].includes(co.status)).length;
    const rejected = changeOrders.filter((co) => co.status === "rejected").length;
    const approvedCost = changeOrders
      .filter((co) => ["approved", "in_progress", "completed"].includes(co.status))
      .reduce((s, co) => s + (Number(co.cost_impact) || 0), 0);
    return { total: changeOrders.length, totalCost, totalDays, approved, pending, rejected, approvedCost };
  }, [changeOrders]);

  const filtered = statusFilter === "all" ? changeOrders : changeOrders.filter((co) => co.status === statusFilter);

  const openEdit = (co: typeof changeOrders[0]) => {
    setForm({
      title: co.title,
      description: co.description || "",
      requested_by_name: co.requested_by_name || "",
      date_requested: co.date_requested || "",
      area_id: co.area_id || "",
      status: co.status as COStatus,
      cost_impact: String(co.cost_impact || 0),
      schedule_impact_days: String(co.schedule_impact_days || 0),
    });
    setEditId(co.id);
    setShowForm(true);
  };

  const detailCO = changeOrders.find((co) => co.id === detailId);

  if (!projectId) return <div className="p-8 text-muted-foreground">Select a project first.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Change Orders
          </h1>
          <p className="text-muted-foreground text-sm">Track, review, and manage all change orders with full history.</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New Change Order
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <ArrowRightLeft className="h-4 w-4" /> Total COs
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" /> Total Cost Impact
            </div>
            <p className="text-2xl font-bold">${stats.totalCost.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">${stats.approvedCost.toLocaleString()} approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-4 w-4" /> Schedule Impact
            </div>
            <p className="text-2xl font-bold">{stats.totalDays} days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" /> Status Breakdown
            </div>
            <div className="flex gap-3 text-sm mt-1">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" />{stats.approved}</span>
              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-yellow-600" />{stats.pending}</span>
              <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-destructive" />{stats.rejected}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} onClick={() => setStatusFilter("all")}>
          All ({changeOrders.length})
        </Button>
        {STATUS_OPTIONS.map((s) => {
          const count = changeOrders.filter((co) => co.status === s.value).length;
          if (!count) return null;
          return (
            <Button key={s.value} size="sm" variant={statusFilter === s.value ? "default" : "outline"} onClick={() => setStatusFilter(s.value)}>
              {s.label} ({count})
            </Button>
          );
        })}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead className="text-right">Cost Impact</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((co) => {
                const area = areas.find((a) => a.id === co.area_id);
                const linkCount = coDeliverables.filter((d) => d.change_order_id === co.id).length;
                return (
                  <TableRow key={co.id} className="cursor-pointer hover:bg-accent/30" onClick={() => setDetailId(co.id)}>
                    <TableCell>
                      <div className="font-medium">{co.title}</div>
                      {linkCount > 0 && <span className="text-xs text-muted-foreground">{linkCount} linked</span>}
                    </TableCell>
                    <TableCell><Badge className={statusColors[co.status as COStatus]}>{co.status.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-sm">{area?.name || "—"}</TableCell>
                    <TableCell className="text-sm">{co.requested_by_name || "—"}</TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {Number(co.cost_impact) ? `$${Number(co.cost_impact).toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">{co.schedule_impact_days || "—"}</TableCell>
                    <TableCell className="text-sm">{co.date_requested ? format(new Date(co.date_requested), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetailId(co.id)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(co)}><ArrowRightLeft className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(co.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No change orders {statusFilter !== "all" ? `with status "${statusFilter}"` : "yet"}. Create one to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ─── Add/Edit Dialog ─── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Change Order" : "New Change Order"}</DialogTitle>
            <DialogDescription>Provide details for this change order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Extend aft deck 1.5m" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Details and rationale…" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Requested By</Label>
                <Input value={form.requested_by_name} onChange={(e) => setForm({ ...form, requested_by_name: e.target.value })} placeholder="Name" />
              </div>
              <div>
                <Label>Date Requested</Label>
                <Input type="date" value={form.date_requested} onChange={(e) => setForm({ ...form, date_requested: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Area</Label>
                <Select value={form.area_id || "none"} onValueChange={(v) => setForm({ ...form, area_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as COStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cost Impact ($)</Label>
                <Input type="number" value={form.cost_impact} onChange={(e) => setForm({ ...form, cost_impact: e.target.value })} />
              </div>
              <div>
                <Label>Schedule Impact (days)</Label>
                <Input type="number" value={form.schedule_impact_days} onChange={(e) => setForm({ ...form, schedule_impact_days: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button disabled={!form.title.trim()} onClick={() => saveMutation.mutate(!!editId)}>{editId ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail / History Dialog ─── */}
      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          {detailCO && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detailCO.title}
                  <Badge className={statusColors[detailCO.status as COStatus]}>{detailCO.status.replace("_", " ")}</Badge>
                </DialogTitle>
                <DialogDescription>{detailCO.description || "No description"}</DialogDescription>
              </DialogHeader>

              {/* Summary row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-muted-foreground">Requested by:</span><br />{detailCO.requested_by_name || "—"}</div>
                <div><span className="text-muted-foreground">Date:</span><br />{detailCO.date_requested ? format(new Date(detailCO.date_requested), "MMM d, yyyy") : "—"}</div>
                <div><span className="text-muted-foreground">Cost:</span><br />{Number(detailCO.cost_impact) ? `$${Number(detailCO.cost_impact).toLocaleString()}` : "—"}</div>
                <div><span className="text-muted-foreground">Schedule:</span><br />{detailCO.schedule_impact_days ? `${detailCO.schedule_impact_days} days` : "—"}</div>
              </div>

              <Separator />

              {/* Linked Deliverables */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">Linked Deliverables</Label>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowLink(detailCO.id)}>
                    <Link2 className="h-3 w-3 mr-1" /> Link
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {coDeliverables.filter((d) => d.change_order_id === detailCO.id).map((link) => {
                    const isFile = link.deliverable_type === "file";
                    const item = isFile ? files.find((f) => f.id === link.deliverable_id) : decisions.find((d) => d.id === link.deliverable_id);
                    const name = item ? ("name" in item ? item.name : item.title) : "Unknown";
                    return (
                      <Badge key={link.id} variant="outline" className="text-xs gap-1">
                        {isFile ? <FileText className="h-3 w-3" /> : <GitBranch className="h-3 w-3" />}
                        {name}
                        <button onClick={() => unlinkMutation.mutate(link.id)} className="ml-1 hover:text-destructive"><Unlink className="h-3 w-3" /></button>
                      </Badge>
                    );
                  })}
                  {coDeliverables.filter((d) => d.change_order_id === detailCO.id).length === 0 && (
                    <span className="text-xs text-muted-foreground">No deliverables linked yet.</span>
                  )}
                </div>
              </div>

              <Separator />

              {/* Activity Log */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Activity & History</Label>
                <ScrollArea className="h-48 rounded border p-3">
                  {activity.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
                  {activity.map((a) => (
                    <div key={a.id} className="flex gap-3 mb-3 last:mb-0">
                      <div className="mt-0.5">
                        {a.activity_type === "status_change" ? (
                          <ArrowRightLeft className="h-4 w-4 text-primary" />
                        ) : (
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm">
                          {a.activity_type === "status_change" ? (
                            <span>
                              <strong>{getProfileName(a.created_by)}</strong>{" "}
                              {a.from_status
                                ? <>changed status from <Badge variant="outline" className="text-xs">{a.from_status}</Badge> to <Badge variant="outline" className="text-xs">{a.to_status}</Badge></>
                                : <>set status to <Badge variant="outline" className="text-xs">{a.to_status}</Badge></>
                              }
                            </span>
                          ) : (
                            <span><strong>{getProfileName(a.created_by)}</strong>: {a.comment}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{format(new Date(a.created_at), "MMM d, yyyy h:mm a")}</p>
                        {a.activity_type === "status_change" && a.comment && (
                          <p className="text-xs text-muted-foreground mt-0.5">{a.comment}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </div>

              {/* Add comment */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add a comment…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && comment.trim() && commentMutation.mutate()}
                />
                <Button disabled={!comment.trim()} onClick={() => commentMutation.mutate()}>
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Link Deliverable Dialog ─── */}
      <Dialog open={!!showLink} onOpenChange={() => setShowLink(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link Deliverable</DialogTitle>
            <DialogDescription>Attach files or decisions to this change order for traceability.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-80 overflow-y-auto">
            {files.length > 0 && (
              <div>
                <Label className="flex items-center gap-1 mb-2"><FileText className="h-4 w-4" /> Files</Label>
                {files.map((f) => {
                  const linked = coDeliverables.some(
                    (d) => d.change_order_id === showLink && d.deliverable_type === "file" && d.deliverable_id === f.id
                  );
                  return (
                    <div key={f.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent/30">
                      <span className="text-sm">{f.name} <Badge variant="outline" className="text-xs ml-1">{f.status}</Badge></span>
                      {linked ? (
                        <Badge variant="secondary" className="text-xs">Linked</Badge>
                      ) : (
                        <Button size="sm" variant="outline" className="h-6 text-xs"
                          onClick={() => linkMutation.mutate({ change_order_id: showLink!, deliverable_type: "file", deliverable_id: f.id })}>Link</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {decisions.length > 0 && (
              <div>
                <Label className="flex items-center gap-1 mb-2"><GitBranch className="h-4 w-4" /> Decisions</Label>
                {decisions.map((d) => {
                  const linked = coDeliverables.some(
                    (dl) => dl.change_order_id === showLink && dl.deliverable_type === "decision" && dl.deliverable_id === d.id
                  );
                  return (
                    <div key={d.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent/30">
                      <span className="text-sm">{d.title} <Badge variant="outline" className="text-xs ml-1">{d.status}</Badge></span>
                      {linked ? (
                        <Badge variant="secondary" className="text-xs">Linked</Badge>
                      ) : (
                        <Button size="sm" variant="outline" className="h-6 text-xs"
                          onClick={() => linkMutation.mutate({ change_order_id: showLink!, deliverable_type: "decision", deliverable_id: d.id })}>Link</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

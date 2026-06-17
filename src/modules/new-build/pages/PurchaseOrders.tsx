import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { differenceInCalendarDays, format } from "date-fns";
import { AlertTriangle, Plus, Trash2, Pencil, CalendarClock, RotateCcw } from "lucide-react";

type POStatus = "draft" | "reviewed" | "issued" | "delivered" | "closed" | "cancelled";

const STATUSES: POStatus[] = ["draft", "reviewed", "issued", "delivered", "closed", "cancelled"];

const statusVariant: Record<POStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  reviewed: "secondary",
  issued: "default",
  delivered: "default",
  closed: "secondary",
  cancelled: "destructive",
};

interface POForm {
  id?: string;
  po_number: string;
  supplier_id: string;
  area_id: string;
  equipment_id: string;
  schedule_task_id: string;
  description: string;
  amount: string;
  currency: string;
  status: POStatus;
  order_date: string;
  promised_delivery_date: string;
  actual_delivery_date: string;
  notes: string;
}

const emptyForm: POForm = {
  po_number: "",
  supplier_id: "none",
  area_id: "none",
  equipment_id: "none",
  schedule_task_id: "none",
  description: "",
  amount: "",
  currency: "EUR",
  status: "draft",
  order_date: "",
  promised_delivery_date: "",
  actual_delivery_date: "",
  notes: "",
};

export default function PurchaseOrders() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const projectId = currentProject?.id;
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<POForm>(emptyForm);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: pos = [] } = useQuery({
    queryKey: ["purchase_orders", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nb_purchase_orders")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["po_suppliers", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("nb_suppliers").select("id,name,company").eq("project_id", projectId!);
      return data || [];
    },
    enabled: !!projectId,
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["po_areas", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("nb_areas").select("id,name").eq("project_id", projectId!);
      return data || [];
    },
    enabled: !!projectId,
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["po_equipment", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("nb_equipment").select("id,name").eq("project_id", projectId!);
      return data || [];
    },
    enabled: !!projectId,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["po_tasks", projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nb_schedule_tasks")
        .select("id,task_name,end_date,baseline_end_date")
        .eq("project_id", projectId!)
        .order("start_date");
      return data || [];
    },
    enabled: !!projectId,
  });

  // Stats
  const stats = useMemo(() => {
    const total = pos.length;
    const completed = pos.filter((p: any) => ["delivered", "closed"].includes(p.status)).length;
    const cancelled = pos.filter((p: any) => p.status === "cancelled").length;
    const active = total - cancelled;
    const totalAmount = pos.filter((p: any) => p.status !== "cancelled").reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const completedAmount = pos.filter((p: any) => ["delivered", "closed"].includes(p.status)).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const countPct = active === 0 ? 0 : Math.round((completed / active) * 100);
    const amountPct = totalAmount === 0 ? 0 : Math.round((completedAmount / totalAmount) * 100);

    // Schedule-weighted: % of linked-task duration delivered
    const linkedTaskIds = new Set(pos.filter((p: any) => p.schedule_task_id).map((p: any) => p.schedule_task_id));
    const linkedTasks = tasks.filter((t: any) => linkedTaskIds.has(t.id));
    let totalDur = 0, doneDur = 0;
    pos.forEach((p: any) => {
      if (!p.schedule_task_id) return;
      const t = linkedTasks.find((x: any) => x.id === p.schedule_task_id);
      if (!t || !t.end_date) return;
      // crude duration proxy = days from today; use 1 if missing
      const dur = 1;
      totalDur += dur;
      if (["delivered", "closed"].includes(p.status)) doneDur += dur;
    });
    const schedulePct = totalDur === 0 ? 0 : Math.round((doneDur / totalDur) * 100);

    // At-risk / late
    const today = new Date();
    const atRisk = pos.filter((p: any) => {
      if (["delivered", "closed", "cancelled"].includes(p.status)) return false;
      if (!p.promised_delivery_date) return false;
      return new Date(p.promised_delivery_date) < today;
    }).length;

    return { total, active, completed, totalAmount, completedAmount, countPct, amountPct, schedulePct, atRisk };
  }, [pos, tasks]);

  const filtered = pos.filter((p: any) => filterStatus === "all" || p.status === filterStatus);

  const openCreate = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (po: any) => {
    setForm({
      id: po.id,
      po_number: po.po_number || "",
      supplier_id: po.supplier_id || "none",
      area_id: po.area_id || "none",
      equipment_id: po.equipment_id || "none",
      schedule_task_id: po.schedule_task_id || "none",
      description: po.description || "",
      amount: po.amount?.toString() || "",
      currency: po.currency || "EUR",
      status: po.status,
      order_date: po.order_date || "",
      promised_delivery_date: po.promised_delivery_date || "",
      actual_delivery_date: po.actual_delivery_date || "",
      notes: po.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.po_number.trim()) {
      toast.error("PO number is required");
      return;
    }
    const payload = {
      project_id: projectId!,
      po_number: form.po_number.trim(),
      supplier_id: form.supplier_id === "none" ? null : form.supplier_id,
      area_id: form.area_id === "none" ? null : form.area_id,
      equipment_id: form.equipment_id === "none" ? null : form.equipment_id,
      schedule_task_id: form.schedule_task_id === "none" ? null : form.schedule_task_id,
      description: form.description || null,
      amount: form.amount ? Number(form.amount) : 0,
      currency: form.currency,
      status: form.status,
      order_date: form.order_date || null,
      promised_delivery_date: form.promised_delivery_date || null,
      actual_delivery_date: form.actual_delivery_date || null,
      notes: form.notes || null,
    };

    let oldStatus: string | null = null;
    if (form.id) {
      const existing = pos.find((p: any) => p.id === form.id);
      oldStatus = existing?.status || null;
      const { error } = await supabase.from("nb_purchase_orders").update(payload).eq("id", form.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("nb_purchase_orders").insert({ ...payload, created_by: user!.id });
      if (error) { toast.error(error.message); return; }
    }

    // Log activity if status changed (or created)
    const poId = form.id;
    if (poId && oldStatus && oldStatus !== form.status) {
      await supabase.from("nb_purchase_order_activity").insert({
        purchase_order_id: poId,
        activity_type: "status_change",
        from_status: oldStatus,
        to_status: form.status,
        created_by: user!.id,
      });
    }

    toast.success(form.id ? "PO updated" : "PO created");
    setDialogOpen(false);
    qc.invalidateQueries({ queryKey: ["purchase_orders", projectId] });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this purchase order?")) return;
    const { error } = await supabase.from("nb_purchase_orders").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["purchase_orders", projectId] });
  };

  const applyDelay = async (po: any) => {
    if (!po.schedule_task_id) { toast.error("No linked schedule task"); return; }
    if (!po.promised_delivery_date || !po.actual_delivery_date) {
      toast.error("Need both promised and actual delivery dates"); return;
    }
    const delayDays = differenceInCalendarDays(new Date(po.actual_delivery_date), new Date(po.promised_delivery_date));
    if (delayDays <= 0) { toast.info("No delay to apply"); return; }
    const task = tasks.find((t: any) => t.id === po.schedule_task_id);
    if (!task?.end_date) { toast.error("Linked task has no end date"); return; }

    const newEnd = new Date(task.end_date);
    newEnd.setDate(newEnd.getDate() + delayDays);

    const updates: any = { end_date: newEnd.toISOString().slice(0, 10) };
    // Preserve baseline if not yet set
    if (!task.baseline_end_date) updates.baseline_end_date = task.end_date;

    const { error: tErr } = await supabase.from("nb_schedule_tasks").update(updates).eq("id", po.schedule_task_id);
    if (tErr) { toast.error(tErr.message); return; }

    const { error: pErr } = await supabase.from("nb_purchase_orders").update({
      delay_applied_to_schedule: true,
      delay_applied_days: delayDays,
      delay_applied_at: new Date().toISOString(),
    }).eq("id", po.id);
    if (pErr) { toast.error(pErr.message); return; }

    await supabase.from("nb_purchase_order_activity").insert({
      purchase_order_id: po.id,
      activity_type: "delay_applied",
      comment: `Pushed linked task by ${delayDays} day(s)`,
      created_by: user!.id,
    });

    toast.success(`Pushed schedule by ${delayDays} day(s)`);
    qc.invalidateQueries({ queryKey: ["purchase_orders", projectId] });
    qc.invalidateQueries({ queryKey: ["po_tasks", projectId] });
  };

  const revertDelay = async (po: any) => {
    if (!po.schedule_task_id) return;
    const task = tasks.find((t: any) => t.id === po.schedule_task_id);
    if (!task?.baseline_end_date) { toast.error("No baseline to revert to"); return; }

    const { error: tErr } = await supabase.from("nb_schedule_tasks").update({
      end_date: task.baseline_end_date,
    }).eq("id", po.schedule_task_id);
    if (tErr) { toast.error(tErr.message); return; }

    await supabase.from("nb_purchase_orders").update({
      delay_applied_to_schedule: false,
      delay_applied_days: null,
      delay_applied_at: null,
    }).eq("id", po.id);

    await supabase.from("nb_purchase_order_activity").insert({
      purchase_order_id: po.id,
      activity_type: "delay_reverted",
      created_by: user!.id,
    });

    toast.success("Reverted task to baseline");
    qc.invalidateQueries({ queryKey: ["purchase_orders", projectId] });
    qc.invalidateQueries({ queryKey: ["po_tasks", projectId] });
  };

  const supplierName = (id: string | null) => suppliers.find((s: any) => s.id === id)?.name || "—";
  const areaName = (id: string | null) => areas.find((a: any) => a.id === id)?.name || "—";
  const taskName = (id: string | null) => tasks.find((t: any) => t.id === id)?.task_name || "—";

  const fmtMoney = (n: number, c = "EUR") => new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Purchase Orders</h1>
          <p className="text-muted-foreground">Track POs and their impact on the build schedule</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> New PO</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">PO Progress (count)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.countPct}%</div>
            <Progress value={stats.countPct} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">{stats.completed}/{stats.active} delivered/closed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">PO Progress (value)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.amountPct}%</div>
            <Progress value={stats.amountPct} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">{fmtMoney(stats.completedAmount)} / {fmtMoney(stats.totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Schedule-linked Progress</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.schedulePct}%</div>
            <Progress value={stats.schedulePct} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">Of POs linked to tasks</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">At Risk / Late</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              {stats.atRisk > 0 && <AlertTriangle className="h-5 w-5 text-destructive" />}
              {stats.atRisk}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Past promised date, not delivered</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Label className="text-sm">Filter status:</Label>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Linked Task</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Promised</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Delay</TableHead>
                <TableHead className="w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No purchase orders yet</TableCell></TableRow>
              )}
              {filtered.map((po: any) => {
                const promised = po.promised_delivery_date ? new Date(po.promised_delivery_date) : null;
                const actual = po.actual_delivery_date ? new Date(po.actual_delivery_date) : null;
                const today = new Date();
                let delayDays = 0;
                if (promised && actual) delayDays = differenceInCalendarDays(actual, promised);
                else if (promised && !actual && !["delivered", "closed", "cancelled"].includes(po.status) && promised < today) {
                  delayDays = differenceInCalendarDays(today, promised);
                }
                const isLate = delayDays > 0;
                const canApply = isLate && po.schedule_task_id && actual && !po.delay_applied_to_schedule;

                return (
                  <TableRow key={po.id}>
                    <TableCell className="font-mono text-sm">{po.po_number}</TableCell>
                    <TableCell className="max-w-xs truncate">{po.description || "—"}</TableCell>
                    <TableCell>{supplierName(po.supplier_id)}</TableCell>
                    <TableCell>{areaName(po.area_id)}</TableCell>
                    <TableCell className="max-w-xs truncate">{taskName(po.schedule_task_id)}</TableCell>
                    <TableCell>{fmtMoney(Number(po.amount || 0), po.currency)}</TableCell>
                    <TableCell><Badge variant={statusVariant[po.status as POStatus]}>{po.status}</Badge></TableCell>
                    <TableCell>{promised ? format(promised, "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell>{actual ? format(actual, "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell>
                      {isLate ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> {delayDays}d
                        </Badge>
                      ) : delayDays < 0 ? (
                        <Badge variant="secondary">{delayDays}d early</Badge>
                      ) : "—"}
                      {po.delay_applied_to_schedule && (
                        <div className="text-xs text-muted-foreground mt-1">Applied: {po.delay_applied_days}d</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(po)}><Pencil className="h-4 w-4" /></Button>
                        {canApply && (
                          <Button size="icon" variant="ghost" title="Apply delay to schedule" onClick={() => applyDelay(po)}>
                            <CalendarClock className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                        {po.delay_applied_to_schedule && (
                          <Button size="icon" variant="ghost" title="Revert schedule delay" onClick={() => revertDelay(po)}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(po.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Edit Purchase Order" : "New Purchase Order"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>PO Number *</Label>
              <Input value={form.po_number} onChange={e => setForm({ ...form, po_number: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as POStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select value={form.supplier_id} onValueChange={v => setForm({ ...form, supplier_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}{s.company ? ` (${s.company})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Area</Label>
              <Select value={form.area_id} onValueChange={v => setForm({ ...form, area_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {areas.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Equipment</Label>
              <Select value={form.equipment_id} onValueChange={v => setForm({ ...form, equipment_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {equipment.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Linked Schedule Task</Label>
              <Select value={form.schedule_task_id} onValueChange={v => setForm({ ...form, schedule_task_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {tasks.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.task_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Order Date</Label>
              <Input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Promised Delivery</Label>
              <Input type="date" value={form.promised_delivery_date} onChange={e => setForm({ ...form, promised_delivery_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Actual Delivery</Label>
              <Input type="date" value={form.actual_delivery_date} onChange={e => setForm({ ...form, actual_delivery_date: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{form.id ? "Save Changes" : "Create PO"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

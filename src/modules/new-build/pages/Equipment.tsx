import { useState, useMemo } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { supabase } from "@/modules/new-build/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Pencil, Trash2, Package, MapPin, CalendarCheck, Truck,
  CheckCircle2, Clock, ShoppingCart, Ship, Wrench, CircleDot,
} from "lucide-react";
import { format } from "date-fns";

type EquipmentStatus = "proposed" | "approved" | "ordered" | "shipped" | "delivered" | "installed";

interface EquipmentForm {
  name: string;
  description: string;
  model_number: string;
  manufacturer: string;
  status: EquipmentStatus;
  delivery_date: string;
  delivery_notes: string;
  location_onboard: string;
  area_id: string;
  notes: string;
}

const emptyForm: EquipmentForm = {
  name: "",
  description: "",
  model_number: "",
  manufacturer: "",
  status: "proposed",
  delivery_date: "",
  delivery_notes: "",
  location_onboard: "",
  area_id: "",
  notes: "",
};

const statusConfig: Record<EquipmentStatus, { label: string; color: string; icon: typeof Package }> = {
  proposed: { label: "Proposed", color: "bg-muted text-muted-foreground", icon: CircleDot },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: CheckCircle2 },
  ordered: { label: "Ordered", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: ShoppingCart },
  shipped: { label: "Shipped", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", icon: Truck },
  delivered: { label: "Delivered", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", icon: Package },
  installed: { label: "Installed", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", icon: Wrench },
};

export default function Equipment() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const projectId = currentProject?.id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [form, setForm] = useState<EquipmentForm>(emptyForm);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ["equipment", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nb_equipment")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["areas", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nb_areas")
        .select("id, name")
        .eq("project_id", projectId!);
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: EquipmentForm) => {
      const payload: any = {
        project_id: projectId!,
        name: values.name,
        description: values.description || null,
        model_number: values.model_number || null,
        manufacturer: values.manufacturer || null,
        status: values.status,
        delivery_date: values.delivery_date || null,
        delivery_notes: values.delivery_notes || null,
        location_onboard: values.location_onboard || null,
        area_id: values.area_id || null,
        notes: values.notes || null,
      };

      // If status changed to approved, set approved fields
      if (values.status !== "proposed") {
        if (editId) {
          const existing = equipment.find((e) => e.id === editId);
          if (existing && existing.status === "proposed") {
            payload.approved_at = new Date().toISOString();
            payload.approved_by = user?.id;
          }
        } else {
          payload.approved_at = new Date().toISOString();
          payload.approved_by = user?.id;
        }
      }

      if (editId) {
        const { error } = await supabase.from("nb_equipment").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        payload.created_by = user?.id;
        const { error } = await supabase.from("nb_equipment").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast({ title: editId ? "Equipment updated" : "Equipment added" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nb_equipment").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast({ title: "Equipment deleted" });
      setDetailOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const openEdit = (item: any) => {
    setEditId(item.id);
    setForm({
      name: item.name,
      description: item.description || "",
      model_number: item.model_number || "",
      manufacturer: item.manufacturer || "",
      status: item.status,
      delivery_date: item.delivery_date || "",
      delivery_notes: item.delivery_notes || "",
      location_onboard: item.location_onboard || "",
      area_id: item.area_id || "",
      notes: item.notes || "",
    });
    setDialogOpen(true);
  };

  const filtered = useMemo(() => {
    if (statusFilter === "all") return equipment;
    return equipment.filter((e: any) => e.status === statusFilter);
  }, [equipment, statusFilter]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of Object.keys(statusConfig)) counts[s] = 0;
    equipment.forEach((e: any) => { counts[e.status] = (counts[e.status] || 0) + 1; });
    return counts;
  }, [equipment]);

  const areaName = (areaId: string | null) => {
    if (!areaId) return "—";
    return areas.find((a) => a.id === areaId)?.name || "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Approved Equipment List
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {currentProject?.name} — Single source of truth for all approved equipment
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Equipment
        </Button>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {(Object.entries(statusConfig) as [EquipmentStatus, typeof statusConfig[EquipmentStatus]][]).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <Card
              key={key}
              className={`cursor-pointer transition-all ${statusFilter === key ? "ring-2 ring-primary" : "hover:shadow-md"}`}
              onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
            >
              <CardContent className="p-3 flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                <div>
                  <div className="text-lg font-bold">{stats[key] || 0}</div>
                  <div className="text-xs text-muted-foreground">{cfg.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Equipment table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Manufacturer / Model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Location Onboard</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Approved</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No equipment found. Add your first item above.</TableCell></TableRow>
                ) : (
                  filtered.map((item: any) => {
                    const cfg = statusConfig[item.status as EquipmentStatus];
                    const Icon = cfg.icon;
                    return (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer"
                        onClick={() => { setSelectedItem(item); setDetailOpen(true); }}
                      >
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {[item.manufacturer, item.model_number].filter(Boolean).join(" — ") || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cfg.color}>
                            <Icon className="h-3 w-3 mr-1" /> {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.location_onboard ? (
                            <span className="flex items-center gap-1 text-sm"><MapPin className="h-3 w-3" />{item.location_onboard}</span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{areaName(item.area_id)}</TableCell>
                        <TableCell className="text-sm">
                          {item.delivery_date ? format(new Date(item.delivery_date), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.approved_at ? format(new Date(item.approved_at), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(item); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(item.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detail slide-out */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {selectedItem?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedItem && (() => {
            const cfg = statusConfig[selectedItem.status as EquipmentStatus];
            const Icon = cfg.icon;
            return (
              <div className="space-y-4">
                <Badge variant="secondary" className={cfg.color}>
                  <Icon className="h-3 w-3 mr-1" /> {cfg.label}
                </Badge>
                {selectedItem.description && <p className="text-sm">{selectedItem.description}</p>}
                <Separator />
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Manufacturer</span><p className="font-medium">{selectedItem.manufacturer || "—"}</p></div>
                  <div><span className="text-muted-foreground">Model #</span><p className="font-medium">{selectedItem.model_number || "—"}</p></div>
                  <div><span className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />Location Onboard</span><p className="font-medium">{selectedItem.location_onboard || "—"}</p></div>
                  <div><span className="text-muted-foreground">Area</span><p className="font-medium">{areaName(selectedItem.area_id)}</p></div>
                  <div><span className="text-muted-foreground flex items-center gap-1"><CalendarCheck className="h-3 w-3" />Approved</span><p className="font-medium">{selectedItem.approved_at ? format(new Date(selectedItem.approved_at), "dd MMM yyyy HH:mm") : "Not yet"}</p></div>
                  <div><span className="text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" />Delivery Date</span><p className="font-medium">{selectedItem.delivery_date ? format(new Date(selectedItem.delivery_date), "dd MMM yyyy") : "TBD"}</p></div>
                </div>
                {selectedItem.delivery_notes && (
                  <>
                    <Separator />
                    <div><span className="text-xs text-muted-foreground">Delivery Notes</span><p className="text-sm">{selectedItem.delivery_notes}</p></div>
                  </>
                )}
                {selectedItem.notes && (
                  <>
                    <Separator />
                    <div><span className="text-xs text-muted-foreground">Notes</span><p className="text-sm">{selectedItem.notes}</p></div>
                  </>
                )}
                <div className="text-xs text-muted-foreground">
                  Last updated: {format(new Date(selectedItem.updated_at), "dd MMM yyyy HH:mm")}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDetailOpen(false); openEdit(selectedItem); }}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Miele Dishwasher G7000" />
              </div>
              <div>
                <Label>Manufacturer</Label>
                <Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="e.g. Miele" />
              </div>
              <div>
                <Label>Model Number</Label>
                <Input value={form.model_number} onChange={(e) => setForm({ ...form, model_number: e.target.value })} placeholder="e.g. G7366SCVi" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as EquipmentStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusConfig).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Area</Label>
                <Select value={form.area_id} onValueChange={(v) => setForm({ ...form, area_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No area</SelectItem>
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Location Onboard</Label>
                <Input value={form.location_onboard} onChange={(e) => setForm({ ...form, location_onboard: e.target.value })} placeholder="e.g. Galley, Frame 42-44, Deck 2" />
              </div>
              <div>
                <Label>Expected Delivery Date</Label>
                <Input type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} />
              </div>
              <div>
                <Label>Delivery Notes</Label>
                <Input value={form.delivery_notes} onChange={(e) => setForm({ ...form, delivery_notes: e.target.value })} placeholder="e.g. Ships from Hamburg" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Specifications, requirements…" rows={2} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes…" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button disabled={!form.name || saveMutation.isPending} onClick={() => saveMutation.mutate(form)}>
              {saveMutation.isPending ? "Saving…" : editId ? "Update" : "Add Equipment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

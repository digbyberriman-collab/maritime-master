import React, { useState, useMemo } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Plus, Pencil, Trash2, Building2, Search, ChevronRight, Users, Package, ShoppingCart } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface SupplierForm {
  name: string;
  company: string;
  role: string;
  area_id: string;
  notes: string;
  why_involved: string;
}

const emptyForm: SupplierForm = { name: "", company: "", role: "", area_id: "", notes: "", why_involved: "" };

export default function Suppliers() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());

  const projectId = currentProject?.id;

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("nb_suppliers")
        .select("*, areas(name)")
        .eq("project_id", projectId)
        .order("company", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["vendor_contacts", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const supplierIds = suppliers.map((s) => s.id);
      if (supplierIds.length === 0) return [];
      const { data, error } = await supabase
        .from("nb_vendor_contacts")
        .select("*")
        .in("supplier_id", supplierIds)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId && suppliers.length > 0,
  });

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["purchase_orders_for_suppliers", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("nb_purchase_orders")
        .select("id, po_number, description, amount, currency, status, supplier_id, order_date, promised_delivery_date")
        .eq("project_id", projectId)
        .order("po_number");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment_for_suppliers", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("nb_equipment")
        .select("id, name, model_number, manufacturer, status, area_id, location_onboard")
        .eq("project_id", projectId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const contactsBySupplier = useMemo(() => {
    const map: Record<string, typeof contacts> = {};
    for (const c of contacts) {
      if (!map[c.supplier_id]) map[c.supplier_id] = [];
      map[c.supplier_id].push(c);
    }
    return map;
  }, [contacts]);

  const posBySupplier = useMemo(() => {
    const map: Record<string, typeof purchaseOrders> = {};
    for (const po of purchaseOrders) {
      if (po.supplier_id) {
        if (!map[po.supplier_id]) map[po.supplier_id] = [];
        map[po.supplier_id].push(po);
      }
    }
    return map;
  }, [purchaseOrders]);

  // Match equipment to suppliers by comparing manufacturer name to supplier name/company
  const equipmentBySupplier = useMemo(() => {
    const map: Record<string, typeof equipment> = {};
    // Also link equipment via POs that have equipment_id
    // For now, match by manufacturer name to supplier name or company (case-insensitive)
    for (const s of suppliers) {
      const matched = equipment.filter((eq) => {
        if (!eq.manufacturer) return false;
        const mfr = eq.manufacturer.toLowerCase();
        return (
          mfr === s.name?.toLowerCase() ||
          mfr === s.company?.toLowerCase()
        );
      });
      if (matched.length > 0) map[s.id] = matched;
    }
    return map;
  }, [equipment, suppliers]);

  const { data: areas = [] } = useQuery({
    queryKey: ["areas", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase.from("nb_areas").select("id, name").eq("project_id", projectId).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const filteredSuppliers = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter((s) => {
      const supplierMatch =
        s.name?.toLowerCase().includes(q) ||
        s.company?.toLowerCase().includes(q) ||
        s.role?.toLowerCase().includes(q) ||
        (s as any).areas?.name?.toLowerCase().includes(q);
      const contactMatch = (contactsBySupplier[s.id] || []).some((c) =>
        c.name?.toLowerCase().includes(q)
      );
      const equipMatch = (equipmentBySupplier[s.id] || []).some((eq) =>
        eq.name?.toLowerCase().includes(q)
      );
      const poMatch = (posBySupplier[s.id] || []).some((po) =>
        po.po_number?.toLowerCase().includes(q) || po.description?.toLowerCase().includes(q)
      );
      return supplierMatch || contactMatch || equipMatch || poMatch;
    });
  }, [suppliers, contacts, search, contactsBySupplier, equipmentBySupplier, posBySupplier]);

  const saveMutation = useMutation({
    mutationFn: async (formData: SupplierForm) => {
      const payload = {
        name: formData.name,
        company: formData.company || null,
        role: formData.role || null,
        area_id: formData.area_id || null,
        notes: formData.notes || null,
        why_involved: formData.why_involved || null,
        project_id: projectId!,
        created_by: user!.id,
      };
      if (editingId) {
        const { created_by: _, project_id: __, ...updatePayload } = payload;
        const { error } = await supabase.from("nb_suppliers").update(updatePayload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("nb_suppliers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers", projectId] });
      toast({ title: editingId ? "Supplier updated" : "Supplier added" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nb_suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers", projectId] });
      toast({ title: "Supplier deleted" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const openEdit = (s: any) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      company: s.company || "",
      role: s.role || "",
      area_id: s.area_id || "",
      notes: s.notes || "",
      why_involved: s.why_involved || "",
    });
    setDialogOpen(true);
  };

  const toggleExpand = (id: string) => {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "delivered": case "approved": case "installed": return "default";
      case "ordered": case "on_order": return "secondary";
      case "draft": case "proposed": return "outline";
      default: return "outline" as const;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers — {currentProject?.name}</h1>
          <p className="text-muted-foreground mt-1">Contacts, equipment, and purchase orders per supplier</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setForm(emptyForm); setEditingId(null); }}>
              <Plus className="h-4 w-4 mr-1" /> Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Contact Name *</Label>
                  <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Input id="role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Naval Architect" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="area">Area</Label>
                  <Select value={form.area_id || "none"} onValueChange={(v) => setForm({ ...form, area_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {areas.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="why">Why Involved</Label>
                <Textarea id="why" value={form.why_involved} onChange={(e) => setForm({ ...form, why_involved: e.target.value })} placeholder="Why is this supplier part of the project?" rows={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional info" rows={2} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving…" : editingId ? "Update" : "Add Supplier"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search suppliers, employees, equipment, or POs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filteredSuppliers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {search ? "No suppliers match your search." : "No suppliers yet. Add your first supplier contact."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Involvement</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map((s) => {
                  const sContacts = contactsBySupplier[s.id] || [];
                  const sEquipment = equipmentBySupplier[s.id] || [];
                  const sPOs = posBySupplier[s.id] || [];
                  const isExpanded = expandedSuppliers.has(s.id);
                  const totalItems = sContacts.length + sEquipment.length + sPOs.length;
                  return (
                    <React.Fragment key={s.id}>
                      <TableRow className="group">
                        <TableCell className="pr-0">
                          {totalItems > 0 && (
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleExpand(s.id)}>
                              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>
                          {s.company && (
                            <div className="flex items-center gap-1">
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                              {s.company}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{s.role && <Badge variant="outline">{s.role}</Badge>}</TableCell>
                        <TableCell>{(s as any).areas?.name}</TableCell>
                        <TableCell>
                          <div className="flex gap-1.5 flex-wrap">
                            {sContacts.length > 0 && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Users className="h-3 w-3" />
                                {sContacts.length}
                              </Badge>
                            )}
                            {sEquipment.length > 0 && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Package className="h-3 w-3" />
                                {sEquipment.length}
                              </Badge>
                            )}
                            {sPOs.length > 0 && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <ShoppingCart className="h-3 w-3" />
                                {sPOs.length}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 items-center">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(s.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {isExpanded && totalItems > 0 && (
                        <TableRow>
                          <TableCell></TableCell>
                          <TableCell colSpan={6} className="py-3">
                            <Tabs defaultValue={sContacts.length > 0 ? "contacts" : sEquipment.length > 0 ? "equipment" : "pos"} className="w-full">
                              <TabsList className="h-8">
                                {sContacts.length > 0 && (
                                  <TabsTrigger value="contacts" className="text-xs h-7">
                                    <Users className="h-3 w-3 mr-1" /> Employees ({sContacts.length})
                                  </TabsTrigger>
                                )}
                                {sEquipment.length > 0 && (
                                  <TabsTrigger value="equipment" className="text-xs h-7">
                                    <Package className="h-3 w-3 mr-1" /> Equipment ({sEquipment.length})
                                  </TabsTrigger>
                                )}
                                {sPOs.length > 0 && (
                                  <TabsTrigger value="pos" className="text-xs h-7">
                                    <ShoppingCart className="h-3 w-3 mr-1" /> Purchase Orders ({sPOs.length})
                                  </TabsTrigger>
                                )}
                              </TabsList>

                              {sContacts.length > 0 && (
                                <TabsContent value="contacts" className="mt-2">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs">Name</TableHead>
                                        <TableHead className="text-xs">Role</TableHead>
                                        <TableHead className="text-xs">Email</TableHead>
                                        <TableHead className="text-xs">Phone</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {sContacts.map((c) => (
                                        <TableRow key={c.id} className="border-muted/50">
                                          <TableCell className="text-sm py-1.5">{c.name}</TableCell>
                                          <TableCell className="text-sm py-1.5 text-muted-foreground">{c.role || "—"}</TableCell>
                                          <TableCell className="text-sm py-1.5 text-muted-foreground">{c.email || "—"}</TableCell>
                                          <TableCell className="text-sm py-1.5 text-muted-foreground">{c.phone || "—"}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </TabsContent>
                              )}

                              {sEquipment.length > 0 && (
                                <TabsContent value="equipment" className="mt-2">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs">Name</TableHead>
                                        <TableHead className="text-xs">Model</TableHead>
                                        <TableHead className="text-xs">Status</TableHead>
                                        <TableHead className="text-xs">Location</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {sEquipment.map((eq) => (
                                        <TableRow key={eq.id} className="border-muted/50">
                                          <TableCell className="text-sm py-1.5 font-medium">{eq.name}</TableCell>
                                          <TableCell className="text-sm py-1.5 text-muted-foreground">{eq.model_number || "—"}</TableCell>
                                          <TableCell className="py-1.5">
                                            <Badge variant={statusColor(eq.status)} className="text-xs">{eq.status}</Badge>
                                          </TableCell>
                                          <TableCell className="text-sm py-1.5 text-muted-foreground">{eq.location_onboard || "—"}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </TabsContent>
                              )}

                              {sPOs.length > 0 && (
                                <TabsContent value="pos" className="mt-2">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs">PO #</TableHead>
                                        <TableHead className="text-xs">Description</TableHead>
                                        <TableHead className="text-xs">Amount</TableHead>
                                        <TableHead className="text-xs">Status</TableHead>
                                        <TableHead className="text-xs">Delivery</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {sPOs.map((po) => (
                                        <TableRow key={po.id} className="border-muted/50">
                                          <TableCell className="text-sm py-1.5 font-medium">{po.po_number}</TableCell>
                                          <TableCell className="text-sm py-1.5 text-muted-foreground max-w-48 truncate">{po.description || "—"}</TableCell>
                                          <TableCell className="text-sm py-1.5">
                                            {po.amount ? `${Number(po.amount).toLocaleString()} ${po.currency}` : "—"}
                                          </TableCell>
                                          <TableCell className="py-1.5">
                                            <Badge variant={statusColor(po.status)} className="text-xs">{po.status}</Badge>
                                          </TableCell>
                                          <TableCell className="text-sm py-1.5 text-muted-foreground">{po.promised_delivery_date || "—"}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </TabsContent>
                              )}
                            </Tabs>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

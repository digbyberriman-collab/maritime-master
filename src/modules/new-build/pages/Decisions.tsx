import { useState } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, AlertTriangle, Shield, Lightbulb, HelpCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  RaidItemCard,
  type RaidItemType,
  type RaidStatus,
  raidStatusLabels,
} from "@/components/raid/RaidItemCard";
import {
  RaidItemForm,
  type RaidFormData,
  emptyRaidForm,
} from "@/components/raid/RaidItemForm";

const typeIcons: Record<string, typeof AlertTriangle> = {
  all: Search,
  decision: Lightbulb,
  assumption: HelpCircle,
  risk: AlertTriangle,
  issue: Shield,
  key_project_risk: AlertTriangle,
};

export default function Decisions() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const projectId = currentProject?.id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RaidFormData>(emptyRaidForm);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["decisions", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("decisions")
        .select("*, areas(name)")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["areas", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("areas")
        .select("id, name")
        .eq("project_id", projectId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: RaidFormData) => {
      const payload = {
        title: formData.title,
        item_type: formData.item_type as any,
        raid_status: formData.raid_status as any,
        decision_text: formData.decision_text || null,
        reasoning: formData.reasoning || null,
        background: formData.background || null,
        date: formData.date || null,
        area_id: formData.area_id || null,
        notes: formData.notes || null,
        assigned_owner: formData.assigned_owner || null,
        source_reference: formData.source_reference || null,
        project_id: projectId!,
        created_by: user!.id,
      };
      if (editingId) {
        const { created_by: _, project_id: __, ...updatePayload } = payload;
        const { error } = await supabase.from("decisions").update(updatePayload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("decisions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decisions", projectId] });
      toast({ title: editingId ? "Item updated" : "Item added" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("decisions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decisions", projectId] });
      toast({ title: "Item deleted" });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("decisions").update({
        pending_validation: false,
        validated_by: user!.id,
        validated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decisions", projectId] });
      toast({ title: "Item validated" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyRaidForm);
  };

  const openEdit = (d: any) => {
    setEditingId(d.id);
    setForm({
      title: d.title,
      item_type: d.item_type || "decision",
      raid_status: d.raid_status || "current",
      decision_text: d.decision_text || "",
      reasoning: d.reasoning || "",
      background: d.background || "",
      date: d.date || "",
      area_id: d.area_id || "",
      notes: d.notes || "",
      assigned_owner: d.assigned_owner || "",
      source_reference: d.source_reference || "",
    });
    setDialogOpen(true);
  };

  // Filter logic
  let filtered = items;
  if (typeFilter !== "all") filtered = filtered.filter((d) => d.item_type === typeFilter);
  if (statusFilter !== "all") filtered = filtered.filter((d) => d.raid_status === statusFilter);
  if (showPendingOnly) filtered = filtered.filter((d) => d.pending_validation);
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((d) =>
      d.title.toLowerCase().includes(q) ||
      d.decision_text?.toLowerCase().includes(q) ||
      d.mdal_number?.toLowerCase().includes(q) ||
      d.tags?.toLowerCase().includes(q)
    );
  }

  const pendingCount = items.filter((d) => d.pending_validation).length;

  // Type counts
  const typeCounts: Record<string, number> = { all: items.length };
  for (const item of items) {
    typeCounts[item.item_type] = (typeCounts[item.item_type] || 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RAID Log — {currentProject?.name}</h1>
          <p className="text-muted-foreground mt-1">
            Decisions, Assumptions, Risks & Issues
          </p>
        </div>
        <Button onClick={() => { setForm(emptyRaidForm); setEditingId(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Item
        </Button>
      </div>

      {/* Type tabs */}
      <Tabs value={typeFilter} onValueChange={setTypeFilter}>
        <TabsList className="flex-wrap h-auto gap-1">
          {["all", "decision", "assumption", "risk", "issue", "key_project_risk"].map((t) => {
            const Icon = typeIcons[t];
            const label = t === "all" ? "All" : t === "key_project_risk" ? "Key Risks" :
              t.charAt(0).toUpperCase() + t.slice(1) + "s";
            return (
              <TabsTrigger key={t} value={t} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {label} ({typeCounts[t] || 0})
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Secondary filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Input
          placeholder="Search items…"
          className="max-w-xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="flex gap-1 flex-wrap">
          <Button
            size="sm"
            variant={statusFilter === "all" ? "default" : "outline"}
            onClick={() => setStatusFilter("all")}
          >
            All Statuses
          </Button>
          {Object.entries(raidStatusLabels).map(([k, v]) => (
            <Button
              key={k}
              size="sm"
              variant={statusFilter === k ? "default" : "outline"}
              onClick={() => setStatusFilter(k)}
            >
              {v}
            </Button>
          ))}
        </div>
        {pendingCount > 0 && (
          <Button
            size="sm"
            variant={showPendingOnly ? "default" : "outline"}
            onClick={() => setShowPendingOnly(!showPendingOnly)}
            className="ml-auto"
          >
            Pending Validation ({pendingCount})
          </Button>
        )}
      </div>

      {/* Items list */}
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {items.length === 0
              ? 'No items yet. Click "Add Item" to get started or import from an MDAL.'
              : "No items match your current filters."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <RaidItemCard
              key={d.id}
              item={d}
              isExpanded={expandedId === d.id}
              onToggle={() => setExpandedId(expandedId === d.id ? null : d.id)}
              onEdit={() => openEdit(d)}
              onDelete={() => deleteMutation.mutate(d.id)}
              onValidate={() => validateMutation.mutate(d.id)}
            />
          ))}
        </div>
      )}

      <RaidItemForm
        open={dialogOpen}
        onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}
        form={form}
        onChange={setForm}
        onSubmit={() => saveMutation.mutate(form)}
        isPending={saveMutation.isPending}
        isEditing={!!editingId}
        areas={areas}
      />
    </div>
  );
}

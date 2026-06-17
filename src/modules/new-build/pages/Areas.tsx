import { useState } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, MapPin, Target, Sofa } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface AreaForm {
  name: string;
  description: string;
  priorities: string;
  current_focus: string;
  is_interior: boolean;
}

const emptyForm: AreaForm = { name: "", description: "", priorities: "", current_focus: "", is_interior: false };

export default function Areas() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AreaForm>(emptyForm);

  const projectId = currentProject?.id;

  const { data: areas = [], isLoading } = useQuery({
    queryKey: ["areas", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("nb_areas")
        .select("*")
        .eq("project_id", projectId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: AreaForm) => {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        priorities: formData.priorities || null,
        current_focus: formData.current_focus || null,
        is_interior: formData.is_interior,
        project_id: projectId!,
      };

      if (editingId) {
        const { project_id: _, ...updatePayload } = payload;
        const { error } = await supabase.from("nb_areas").update(updatePayload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("nb_areas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["areas", projectId] });
      toast({ title: editingId ? "Area updated" : "Area added" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nb_areas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["areas", projectId] });
      toast({ title: "Area deleted" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const openEdit = (a: any) => {
    setEditingId(a.id);
    setForm({
      name: a.name,
      description: a.description || "",
      priorities: a.priorities || "",
      current_focus: a.current_focus || "",
      is_interior: !!a.is_interior,
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Areas — {currentProject?.name}</h1>
          <p className="text-muted-foreground mt-1">Manage build areas, priorities, and current focus</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setForm(emptyForm); setEditingId(null); }}>
              <Plus className="h-4 w-4 mr-1" /> Add Area
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Area" : "Add Area"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Engine Room, Bridge, Interior" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description</Label>
                <Textarea id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this area cover?" rows={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priorities">Priorities</Label>
                <Textarea id="priorities" value={form.priorities} onChange={(e) => setForm({ ...form, priorities: e.target.value })} placeholder="Key priorities for this area" rows={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="focus">Current Focus</Label>
                <Input id="focus" value={form.current_focus} onChange={(e) => setForm({ ...form, current_focus: e.target.value })} placeholder="What's being worked on right now?" />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="is_interior" checked={form.is_interior} onCheckedChange={(v) => setForm({ ...form, is_interior: !!v })} />
                <Label htmlFor="is_interior" className="cursor-pointer font-normal">
                  Interior area (shows up in the Interior module)
                </Label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving…" : editingId ? "Update" : "Add Area"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : areas.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No areas yet. Add areas like "Engine Room", "Bridge", or "Interior" to organise decisions and files.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {areas.map((a) => (
            <Card key={a.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <MapPin className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">{a.name}</CardTitle>
                    {a.is_interior && (
                      <Badge variant="secondary" className="gap-1">
                        <Sofa className="h-3 w-3" /> Interior
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(a.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
                {a.priorities && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Priorities</p>
                    <p className="text-sm">{a.priorities}</p>
                  </div>
                )}
                {a.current_focus && (
                  <div className="flex items-start gap-1.5">
                    <Target className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Current Focus</p>
                      <p className="text-sm">{a.current_focus}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

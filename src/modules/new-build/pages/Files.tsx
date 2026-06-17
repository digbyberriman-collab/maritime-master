import { useState } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { supabase } from "@/modules/new-build/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, ExternalLink, Copy } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";

type FileStatus = "draft" | "review" | "approved";

const statusColors: Record<FileStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-primary/15 text-primary",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const statusLabels: Record<FileStatus, string> = {
  draft: "Draft",
  review: "In Review",
  approved: "Approved",
};

interface FileForm {
  name: string;
  external_url: string;
  area_id: string;
  status: FileStatus;
  notes: string;
}

const emptyForm: FileForm = {
  name: "",
  external_url: "",
  area_id: "",
  status: "draft",
  notes: "",
};

export default function Files() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FileForm>(emptyForm);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const projectId = currentProject?.id;

  // We don't have auth right now, use a placeholder
  const placeholderUserId = "00000000-0000-0000-0000-000000000000";

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["files", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("nb_files")
        .select("*, areas(name)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
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
        .from("nb_areas")
        .select("id, name")
        .eq("project_id", projectId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: FileForm) => {
      if (editingId) {
        const { error } = await supabase
          .from("nb_files")
          .update({
            name: formData.name,
            external_url: formData.external_url || null,
            area_id: formData.area_id || null,
            status: formData.status,
            notes: formData.notes || null,
          })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("nb_files").insert({
          name: formData.name,
          external_url: formData.external_url || null,
          area_id: formData.area_id || null,
          status: formData.status,
          notes: formData.notes || null,
          project_id: projectId!,
          uploaded_by: placeholderUserId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", projectId] });
      toast({ title: editingId ? "File updated" : "File added" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nb_files").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", projectId] });
      toast({ title: "File deleted" });
    },
  });

  const newVersionMutation = useMutation({
    mutationFn: async (parentFile: any) => {
      const { error } = await supabase.from("nb_files").insert({
        name: parentFile.name,
        external_url: parentFile.external_url || null,
        area_id: parentFile.area_id || null,
        status: "draft" as FileStatus,
        notes: null,
        project_id: projectId!,
        uploaded_by: placeholderUserId,
        parent_file_id: parentFile.id,
        version: (parentFile.version || 1) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", projectId] });
      toast({ title: "New version created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const openEdit = (f: any) => {
    setEditingId(f.id);
    setForm({
      name: f.name,
      external_url: f.external_url || "",
      area_id: f.area_id || "",
      status: f.status,
      notes: f.notes || "",
    });
    setDialogOpen(true);
  };

  const filtered = statusFilter === "all"
    ? files
    : files.filter((f) => f.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Files — {currentProject?.name}</h1>
          <p className="text-muted-foreground mt-1">Track documents, ACC links, and file versions</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setForm(emptyForm); setEditingId(null); }}>
              <Plus className="h-4 w-4 mr-1" /> Add File
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit File" : "Add File"}</DialogTitle>
              <DialogDescription>Add a document reference or ACC link to track in this project.</DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label htmlFor="name">File Name *</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. GA Drawing Rev B" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="external_url">ACC / External Link</Label>
                <Input id="external_url" type="url" value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} placeholder="https://acc.autodesk.com/..." />
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
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as FileStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any context about this file" rows={2} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving…" : editingId ? "Update" : "Add File"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} onClick={() => setStatusFilter("all")}>
          All ({files.length})
        </Button>
        {(Object.keys(statusLabels) as FileStatus[]).map((s) => {
          const count = files.filter((f) => f.status === s).length;
          return (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}>
              {statusLabels[s]} ({count})
            </Button>
          );
        })}
      </div>

      {/* File list */}
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No files yet. Click "Add File" to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{f.name}</span>
                      {f.external_url && (
                        <a href={f.external_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    {f.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{f.notes}</p>}
                  </TableCell>
                  <TableCell className="text-sm">{(f as any).areas?.name || "—"}</TableCell>
                  <TableCell className="text-sm">v{f.version}</TableCell>
                  <TableCell>
                    <Badge className={statusColors[f.status as FileStatus]}>
                      {statusLabels[f.status as FileStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(f.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" title="New version" onClick={() => newVersionMutation.mutate(f)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(f)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(f.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

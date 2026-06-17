import { useState, useMemo, useCallback, useEffect } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import {
  Search,
  Plus,
  FileText,
  Download,
  Trash2,
  ExternalLink,
  Upload,
  Scale,
  FolderOpen,
  Loader2,
  Zap,
} from "lucide-react";

const CATEGORIES = [
  "General",
  "SOLAS",
  "MARPOL",
  "MLC",
  "ISM",
  "ISPS",
  "Flag State",
  "IMO",
  "ILO",
  "EU",
  "Class Rules",
  "Load Line",
  "STCW",
  "Ballast Water",
  "Polar Code",
  "Fire Safety",
  "Life-Saving",
  "Navigation",
  "Communication",
  "Environmental",
];

interface Regulation {
  id: string;
  title: string;
  description: string | null;
  category: string;
  source: string | null;
  reference_number: string | null;
  tags: string | null;
  file_name: string | null;
  storage_path: string | null;
  external_url: string | null;
  uploaded_by: string;
  created_at: string;
  content_indexed_at: string | null;
  rank?: number;
  headline?: string;
}

interface FormData {
  title: string;
  description: string;
  category: string;
  source: string;
  reference_number: string;
  tags: string;
  external_url: string;
}

const emptyForm: FormData = {
  title: "",
  description: "",
  category: "General",
  source: "",
  reference_number: "",
  tags: "",
  external_url: "",
};

export default function Regulations() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const projectId = currentProject?.id;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [indexingIds, setIndexingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const useFullText = debouncedSearch.trim().length >= 3;

  const { data: regulations = [], isLoading } = useQuery({
    queryKey: ["regulations", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("regulations" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("category")
        .order("title");
      if (error) throw error;
      return (data || []) as unknown as Regulation[];
    },
    enabled: !!projectId,
  });

  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ["regulations_search", projectId, debouncedSearch, categoryFilter],
    queryFn: async () => {
      if (!projectId || !debouncedSearch.trim()) return [];
      const { data, error } = await supabase.rpc("search_regulations" as any, {
        p_project_id: projectId,
        p_query: debouncedSearch.trim(),
        p_category: categoryFilter === "all" ? null : categoryFilter,
        p_limit: 50,
      });
      if (error) throw error;
      return (data || []) as unknown as Regulation[];
    },
    enabled: !!projectId && useFullText,
  });

  const categories = useMemo(() => {
    const cats = new Set(regulations.map((r) => r.category));
    return Array.from(cats).sort();
  }, [regulations]);

  const clientFiltered = useMemo(() => {
    let result = regulations;
    if (categoryFilter !== "all") {
      result = result.filter((r) => r.category === categoryFilter);
    }
    if (search.trim() && !useFullText) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.tags?.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.source?.toLowerCase().includes(q) ||
          r.reference_number?.toLowerCase().includes(q) ||
          r.file_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [regulations, categoryFilter, search, useFullText]);

  const filtered = useFullText ? searchResults : clientFiltered;

  const grouped = useMemo(() => {
    const map: Record<string, Regulation[]> = {};
    filtered.forEach((r) => {
      if (!map[r.category]) map[r.category] = [];
      map[r.category].push(r);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || !user) throw new Error("Missing context");

      let storagePath: string | null = null;
      let fileName: string | null = null;

      if (file) {
        fileName = file.name;
        const path = `${projectId}/${Date.now()}-${file.name}`;
        const { error: uploadErr } = await supabase.storage
          .from("nb_regulations")
          .upload(path, file);
        if (uploadErr) throw uploadErr;
        storagePath = path;
      }

      const record: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        source: form.source.trim() || null,
        reference_number: form.reference_number.trim() || null,
        tags: form.tags.trim() || null,
        external_url: form.external_url.trim() || null,
        project_id: projectId,
        uploaded_by: user.id,
      };

      if (fileName) record.file_name = fileName;
      if (storagePath) record.storage_path = storagePath;

      if (editingId) {
        const { error } = await supabase
          .from("regulations" as any)
          .update(record)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("regulations" as any)
          .insert(record);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regulations", projectId] });
      toast({ title: editingId ? "Regulation updated" : "Regulation added" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (reg: Regulation) => {
      if (reg.storage_path) {
        await supabase.storage.from("nb_regulations").remove([reg.storage_path]);
      }
      const { error } = await supabase
        .from("regulations" as any)
        .delete()
        .eq("id", reg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regulations", projectId] });
      toast({ title: "Regulation removed" });
    },
  });

  const indexDocument = useCallback(async (regId: string) => {
    setIndexingIds((prev) => new Set(prev).add(regId));
    try {
      const { data, error } = await supabase.functions.invoke("index-regulation", {
        body: { regulation_id: regId },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["regulations", projectId] });
      toast({ title: "Document indexed for full-text search" });
    } catch (err: any) {
      toast({
        title: "Indexing failed",
        description: err.message || "Could not extract text",
        variant: "destructive",
      });
    } finally {
      setIndexingIds((prev) => {
        const next = new Set(prev);
        next.delete(regId);
        return next;
      });
    }
  }, [projectId, queryClient, toast]);

  const getDownloadUrl = (storagePath: string) => {
    const { data } = supabase.storage.from("nb_regulations").getPublicUrl(storagePath);
    return data.publicUrl;
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setForm(emptyForm);
    setFile(null);
    setEditingId(null);
  };

  const openEdit = (r: Regulation) => {
    setForm({
      title: r.title,
      description: r.description || "",
      category: r.category,
      source: r.source || "",
      reference_number: r.reference_number || "",
      tags: r.tags || "",
      external_url: r.external_url || "",
    });
    setEditingId(r.id);
    setDialogOpen(true);
  };

  if (!currentProject) {
    return <p className="p-6 text-muted-foreground">Select a project first.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Regulations — {currentProject.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            Maritime regulation reference library — SOLAS, MARPOL, Flag State, IMO & more
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Regulation
        </Button>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search regulations, content, references…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{regulations.length} total regulations</span>
        <span>·</span>
        <span>{categories.length} categories</span>
        <span>·</span>
        <span>{regulations.filter(r => r.content_indexed_at).length} indexed</span>
        {search && (
          <>
            <span>·</span>
            <span>
              {filtered.length} matching
              {useFullText && " (full-text)"}
            </span>
          </>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : regulations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Scale className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No regulations uploaded yet</h3>
            <p className="text-muted-foreground mb-4">
              Upload maritime regulation documents (SOLAS, MARPOL, etc.) for the team to search and reference.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Upload First Regulation
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No regulations match your search.
          </CardContent>
        </Card>
      ) : (
        grouped.map(([category, items]) => (
          <div key={category} className="space-y-2">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-lg">{category}</h2>
              <Badge variant="secondary" className="ml-1">{items.length}</Badge>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Reference</TableHead>
                    <TableHead className="w-[30%]">Title</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.reference_number ? (
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                            {r.reference_number}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{r.title}</span>
                          {useFullText && r.headline ? (
                            <p
                              className="text-xs text-muted-foreground mt-0.5 line-clamp-2"
                              dangerouslySetInnerHTML={{ __html: r.headline }}
                            />
                          ) : r.description ? (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {r.description}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.source ? (
                          <span className="text-xs">{r.source}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.tags && (
                          <div className="flex flex-wrap gap-1">
                            {r.tags.split(",").map((t, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {t.trim()}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.storage_path ? (
                          <a
                            href={getDownloadUrl(r.storage_path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {r.file_name || "Download"}
                          </a>
                        ) : r.external_url ? (
                          <a
                            href={r.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Link
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">No file</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {r.storage_path && !r.content_indexed_at && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Index for full-text search"
                              onClick={() => indexDocument(r.id)}
                              disabled={indexingIds.has(r.id)}
                            >
                              {indexingIds.has(r.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Zap className="h-4 w-4 text-amber-500" />
                              )}
                            </Button>
                          )}
                          {r.content_indexed_at && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-5 text-green-600 border-green-300">
                              indexed
                            </Badge>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(r)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        ))
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Regulation" : "Add Regulation"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title *</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. SOLAS Chapter II-1 — Construction"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Source</label>
                <Input
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  placeholder="e.g. IMO, Red Ensign Group"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Reference Number</label>
              <Input
                value={form.reference_number}
                onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))}
                placeholder="e.g. MSC.1/Circ.1598, MEPC.304(72)"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of this regulation"
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tags (comma-separated)</label>
              <Input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="e.g. fire safety, structural, LSA"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Upload File</label>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.png"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                PDF, Word, Excel, or image files
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Or External URL</label>
              <Input
                value={form.external_url}
                onChange={(e) => setForm((f) => ({ ...f, external_url: e.target.value }))}
                placeholder="https://…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.title.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : editingId ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

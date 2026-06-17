import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Document, Page } from "react-pdf";
import "@/lib/pdfjs-setup";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
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
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Plus,
  FileText,
  Download,
  Trash2,
  ExternalLink,
  Upload,
  BookOpen,
  FolderOpen,
  Loader2,
  Zap,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { BulkUpload } from "@/components/yard-standards/BulkUpload";
import {
  parseYardStandardNumber,
  getMaterialLabel,
  getDocTypeLabel,
} from "@/lib/yard-standard-naming";

const CATEGORIES = [
  "General",
  "100 Build Standards",
  "Structural",
  "Outfitting",
  "Mechanical",
  "Electrical",
  "HVAC",
  "Piping",
  "Paint & Coatings",
  "Safety",
  "Quality Control",
  "Welding",
  "Insulation",
  "Joinery",
  "Deck Equipment",
  "Navigation",
];

interface YardStandard {
  id: string;
  title: string;
  description: string | null;
  category: string;
  tags: string | null;
  file_name: string | null;
  storage_path: string | null;
  external_url: string | null;
  uploaded_by: string;
  created_at: string;
  document_number: string | null;
  doc_type_code: string | null;
  element_code: string | null;
  material_code: string | null;
  seq_code: string | null;
  sheet_number: string | null;
  revision: string | null;
  content_indexed_at: string | null;
  rank?: number;
  headline?: string;
}

interface FormData {
  title: string;
  description: string;
  category: string;
  tags: string;
  external_url: string;
}

const emptyForm: FormData = {
  title: "",
  description: "",
  category: "General",
  tags: "",
  external_url: "",
};

export default function YardStandards() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const projectId = currentProject?.id;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [indexingIds, setIndexingIds] = useState<Set<string>>(new Set());
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState("");
  const [viewerNumPages, setViewerNumPages] = useState(0);
  const [viewerPage, setViewerPage] = useState(1);
  const [viewerLoading, setViewerLoading] = useState(false);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  // Debounce search for full-text queries
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const useFullText = debouncedSearch.trim().length >= 3;

  // Standard listing query (no full-text)
  const { data: standards = [], isLoading } = useQuery({
    queryKey: ["yard_standards", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("yard_standards" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("category")
        .order("title");
      if (error) throw error;
      return (data || []) as unknown as YardStandard[];
    },
    enabled: !!projectId,
  });

  // Full-text search query
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ["yard_standards_search", projectId, debouncedSearch, categoryFilter],
    queryFn: async () => {
      if (!projectId || !debouncedSearch.trim()) return [];
      const { data, error } = await supabase.rpc("search_yard_standards" as any, {
        p_project_id: projectId,
        p_query: debouncedSearch.trim(),
        p_category: categoryFilter === "all" ? null : categoryFilter,
        p_limit: 50,
      });
      if (error) throw error;
      return (data || []) as unknown as YardStandard[];
    },
    enabled: !!projectId && useFullText,
  });

  const categories = useMemo(() => {
    const cats = new Set(standards.map((s) => s.category));
    return Array.from(cats).sort();
  }, [standards]);

  // Client-side filter for short queries or no query
  const clientFiltered = useMemo(() => {
    let result = standards;
    if (categoryFilter !== "all") {
      result = result.filter((s) => s.category === categoryFilter);
    }
    if (search.trim() && !useFullText) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.tags?.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.file_name?.toLowerCase().includes(q) ||
          s.document_number?.toLowerCase().includes(q) ||
          s.element_code?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [standards, categoryFilter, search, useFullText]);

  const filtered = useFullText ? searchResults : clientFiltered;

  const grouped = useMemo(() => {
    const map: Record<string, YardStandard[]> = {};
    filtered.forEach((s) => {
      if (!map[s.category]) map[s.category] = [];
      map[s.category].push(s);
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
          .from("yard-standards")
          .upload(path, file);
        if (uploadErr) throw uploadErr;
        storagePath = path;
      }

      const record: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        tags: form.tags.trim() || null,
        external_url: form.external_url.trim() || null,
        project_id: projectId,
        uploaded_by: user.id,
      };

      if (fileName) record.file_name = fileName;
      if (storagePath) record.storage_path = storagePath;

      // Auto-parse document number from filename
      if (fileName && !editingId) {
        const parsed = parseYardStandardNumber(fileName);
        if (parsed) {
          record.document_number = parsed.document_number;
          record.doc_type_code = parsed.doc_type_code;
          record.element_code = parsed.element_code;
          record.material_code = parsed.material_code;
          record.seq_code = parsed.seq_code;
          record.sheet_number = parsed.sheet_number;
          record.revision = parsed.revision;
        }
      }

      if (editingId) {
        const { error } = await supabase
          .from("yard_standards" as any)
          .update(record)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("yard_standards" as any)
          .insert(record);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["yard_standards", projectId] });
      toast({ title: editingId ? "Standard updated" : "Standard added" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to save",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (standard: YardStandard) => {
      if (standard.storage_path) {
        await supabase.storage
          .from("yard-standards")
          .remove([standard.storage_path]);
      }
      const { error } = await supabase
        .from("yard_standards" as any)
        .delete()
        .eq("id", standard.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["yard_standards", projectId] });
      toast({ title: "Standard removed" });
    },
  });

  const indexDocument = useCallback(async (standardId: string) => {
    setIndexingIds((prev) => new Set(prev).add(standardId));
    try {
      const { data, error } = await supabase.functions.invoke("index-yard-standard", {
        body: { yard_standard_id: standardId },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["yard_standards", projectId] });
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
        next.delete(standardId);
        return next;
      });
    }
  }, [projectId, queryClient, toast]);

  const getSignedUrl = useCallback(async (storagePath: string) => {
    const { data, error } = await supabase.storage
      .from("yard-standards")
      .createSignedUrl(storagePath, 3600); // 1 hour
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }, []);

  const handleViewPdf = useCallback(async (s: YardStandard) => {
    if (!s.storage_path) return;
    setViewerLoading(true);
    setViewerTitle(s.title);
    setViewerOpen(true);
    setViewerPage(1);
    setViewerNumPages(0);
    const url = await getSignedUrl(s.storage_path);
    setViewerUrl(url);
    setViewerLoading(false);
  }, [getSignedUrl]);

  const handleDownload = useCallback(async (s: YardStandard) => {
    if (!s.storage_path) return;
    const url = await getSignedUrl(s.storage_path);
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = s.file_name || "document.pdf";
      a.target = "_blank";
      a.click();
    } else {
      toast({ title: "Error", description: "Could not generate download link", variant: "destructive" });
    }
  }, [getSignedUrl, toast]);

  const closeDialog = () => {
    setDialogOpen(false);
    setForm(emptyForm);
    setFile(null);
    setEditingId(null);
  };

  const openEdit = (s: YardStandard) => {
    setForm({
      title: s.title,
      description: s.description || "",
      category: s.category,
      tags: s.tags || "",
      external_url: s.external_url || "",
    });
    setEditingId(s.id);
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
            Yard Standards — {currentProject.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            Reference library of yard standard instruction workbooklets
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkMode(true)}>
            <Upload className="h-4 w-4 mr-2" /> Bulk Upload
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Standard
          </Button>
        </div>
      </div>

      {/* Bulk Upload Mode */}
      {bulkMode && (
        <BulkUpload
          projectId={projectId!}
          userId={user?.id || ""}
          onComplete={() => {
            setBulkMode(false);
            queryClient.invalidateQueries({ queryKey: ["yard_standards", projectId] });
          }}
          onCancel={() => setBulkMode(false)}
        />
      )}

      {/* Search & Filter */}
      {!bulkMode && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search titles, tags, or document content…"
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
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!bulkMode && (
        <>
          {/* Stats */}
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{standards.length} total documents</span>
            <span>·</span>
            <span>{categories.length} categories</span>
            <span>·</span>
            <span>{standards.filter(s => s.content_indexed_at).length} indexed</span>
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
      ) : standards.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No standards uploaded yet</h3>
            <p className="text-muted-foreground mb-4">
              Upload yard standard instruction workbooklets for the team to reference.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Upload First Standard
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No documents match your search.
          </CardContent>
        </Card>
      ) : (
        grouped.map(([category, items]) => (
          <div key={category} className="space-y-2">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-lg">{category}</h2>
              <Badge variant="secondary" className="ml-1">
                {items.length}
              </Badge>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Doc Number</TableHead>
                    <TableHead className="w-[30%]">Title</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        {s.document_number ? (
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                            {s.document_number}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{s.title}</span>
                          {useFullText && s.headline ? (
                            <p
                              className="text-xs text-muted-foreground mt-0.5 line-clamp-2"
                              dangerouslySetInnerHTML={{ __html: s.headline }}
                            />
                          ) : s.description ? (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {s.description}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {s.material_code ? (
                          <span className="text-xs">{getMaterialLabel(s.material_code)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.tags && (
                          <div className="flex flex-wrap gap-1">
                            {s.tags.split(",").map((t, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-xs"
                              >
                                {t.trim()}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.storage_path ? (
                          <div className="flex items-center gap-2">
                            {s.file_name?.toLowerCase().endsWith(".pdf") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => handleViewPdf(s)}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                View
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleDownload(s)}
                            >
                              <Download className="h-3.5 w-3.5 mr-1" />
                              Download
                            </Button>
                          </div>
                        ) : s.external_url ? (
                          <a
                            href={s.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Link
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            No file
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {s.storage_path && !s.content_indexed_at && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Index for full-text search"
                              onClick={() => indexDocument(s.id)}
                              disabled={indexingIds.has(s.id)}
                            >
                              {indexingIds.has(s.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Zap className="h-4 w-4 text-amber-500" />
                              )}
                            </Button>
                          )}
                          {s.content_indexed_at && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-5 text-green-600 border-green-300">
                              indexed
                            </Badge>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(s)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(s)}
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
        </>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Standard" : "Add Yard Standard"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title *</label>
              <Input
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="e.g. Welding Procedure WPS-001"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Brief description of this standard"
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                Tags (comma-separated)
              </label>
              <Input
                value={form.tags}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tags: e.target.value }))
                }
                placeholder="e.g. hull, steel, MIG"
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
              <label className="text-sm font-medium">
                Or External URL (ACC link, etc.)
              </label>
              <Input
                value={form.external_url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, external_url: e.target.value }))
                }
                placeholder="https://…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.title.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending
                ? "Saving…"
                : editingId
                ? "Update"
                : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Viewer Dialog */}
      <Dialog open={viewerOpen} onOpenChange={(o) => { if (!o) { setViewerOpen(false); setViewerUrl(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-8">
              <span className="truncate">{viewerTitle}</span>
              {viewerUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-4 shrink-0"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = viewerUrl;
                    a.download = viewerTitle + ".pdf";
                    a.target = "_blank";
                    a.click();
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Download
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div
            ref={viewerContainerRef}
            className="flex-1 overflow-auto bg-muted/30 rounded-md flex flex-col items-center py-4 min-h-0"
          >
            {viewerLoading ? (
              <div className="flex items-center gap-2 py-20 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading document…
              </div>
            ) : viewerUrl ? (
              <Document
                file={viewerUrl}
                onLoadSuccess={({ numPages }) => setViewerNumPages(numPages)}
                loading={
                  <div className="flex items-center gap-2 py-20 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading PDF…
                  </div>
                }
                error={
                  <div className="py-20 text-destructive text-sm text-center">
                    Failed to load PDF. Try downloading the file instead.
                  </div>
                }
              >
                <Page
                  pageNumber={viewerPage}
                  width={Math.min(
                    (viewerContainerRef.current?.clientWidth ?? 800) - 48,
                    800
                  )}
                />
              </Document>
            ) : (
              <div className="py-20 text-destructive text-sm">
                Could not generate a viewable link for this file.
              </div>
            )}
          </div>
          {viewerNumPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                disabled={viewerPage <= 1}
                onClick={() => setViewerPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {viewerPage} of {viewerNumPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={viewerPage >= viewerNumPages}
                onClick={() => setViewerPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

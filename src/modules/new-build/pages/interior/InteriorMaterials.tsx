import { useMemo, useState } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Sofa, Plus, Pencil, Trash2, Image as ImageIcon, ExternalLink, ArrowRight,
  FlaskConical, Hammer, BookOpen, ArrowLeft, LayoutGrid, List, X, ZoomIn,
  ChevronRight, FolderOpen, Folder,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

// --- constants ---
const MATERIAL_CATEGORIES = [
  "Fabric", "Leather", "Wood Veneer", "Stone", "Metal",
  "Paint", "Carpet", "Wallcovering", "Lighting", "Other",
];

const SELECTION_STATUSES = [
  "Main Material — Approved",
  "Finishing Material — Approved",
  "Pending",
  "Pending — Main Material",
  "Pending — Finishing Material",
  "Reference Only",
  "Rejected",
];

const STATUS_GROUPS = [
  { label: "Approved", statuses: ["Main Material — Approved", "Finishing Material — Approved"] },
  { label: "Pending", statuses: ["Pending", "Pending — Main Material", "Pending — Finishing Material"] },
  { label: "Other", statuses: ["Reference Only", "Rejected"] },
];

const isPendingStatus = (s?: string | null) => !s || s === "Pending" || s.startsWith("Pending —");

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  Wood: { bg: "bg-amber-800/20", text: "text-amber-700" },
  "Wood Veneer": { bg: "bg-amber-800/20", text: "text-amber-700" },
  Metal: { bg: "bg-slate-400/20", text: "text-slate-500" },
  Stone: { bg: "bg-stone-400/20", text: "text-stone-500" },
  Glass: { bg: "bg-sky-200/30", text: "text-sky-600" },
  Leather: { bg: "bg-orange-800/15", text: "text-orange-700" },
  "Leather / Fabric": { bg: "bg-orange-800/15", text: "text-orange-700" },
  Fabric: { bg: "bg-violet-200/30", text: "text-violet-600" },
  Textile: { bg: "bg-violet-200/30", text: "text-violet-600" },
  Carpet: { bg: "bg-rose-200/20", text: "text-rose-600" },
  Lacquer: { bg: "bg-indigo-200/20", text: "text-indigo-600" },
  Coating: { bg: "bg-indigo-200/20", text: "text-indigo-600" },
  Paint: { bg: "bg-indigo-200/20", text: "text-indigo-600" },
  Composite: { bg: "bg-teal-200/20", text: "text-teal-600" },
  Resin: { bg: "bg-emerald-200/20", text: "text-emerald-600" },
  "Resin / Decking": { bg: "bg-emerald-200/20", text: "text-emerald-600" },
  Epoxy: { bg: "bg-lime-200/20", text: "text-lime-600" },
  Plaster: { bg: "bg-neutral-200/30", text: "text-neutral-500" },
  Wallcovering: { bg: "bg-pink-200/20", text: "text-pink-600" },
  Lighting: { bg: "bg-yellow-200/30", text: "text-yellow-600" },
};

const categoryPlaceholder = (category?: string | null) => {
  const entry = category ? CATEGORY_COLORS[category] : undefined;
  return {
    bg: entry?.bg || "bg-muted",
    text: entry?.text || "text-muted-foreground/60",
    label: category || "Material",
  };
};

const statusDot = (s?: string) => {
  if (/Approved/i.test(s || "")) return "bg-green-500";
  if (s === "Reference Only") return "bg-blue-500";
  if (s === "Rejected") return "bg-red-500";
  if (isPendingStatus(s)) return "bg-amber-500";
  return "bg-gray-400";
};

const statusTone = (s?: string) => {
  if (isPendingStatus(s)) return "bg-amber-100 text-amber-800 border-amber-200";
  if (/Approved/i.test(s || "")) return "bg-green-100 text-green-800 border-green-200";
  if (s === "Reference Only") return "bg-blue-100 text-blue-800 border-blue-200";
  if (s === "Rejected") return "bg-red-100 text-red-800 border-red-200";
  return "bg-muted text-muted-foreground";
};

const COMPARE_PROPERTIES: { key: string; label: string }[] = [
  { key: "category", label: "Category" },
  { key: "proposed_by", label: "Proposed by" },
  { key: "supplier_name", label: "Supplier" },
  { key: "dimension", label: "Dimension" },
  { key: "weight", label: "Weight" },
  { key: "format", label: "Format" },
  { key: "finish", label: "Finish" },
  { key: "shock_resistance", label: "Shock resistance" },
  { key: "scratch_resistance", label: "Scratch resistance" },
  { key: "stain_resistance", label: "Stain resistance" },
  { key: "fire_resistance", label: "Fire resistance" },
  { key: "water_resistance", label: "Water resistance" },
  { key: "corrosion_resistance", label: "Corrosion resistance" },
  { key: "uv_resistance", label: "UV resistance" },
  { key: "acoustic_properties", label: "Acoustic" },
  { key: "maintenance", label: "Maintenance" },
  { key: "customizability", label: "Customizability" },
  { key: "applications", label: "Applications" },
  { key: "description", label: "Description" },
  { key: "meeting_notes", label: "Meeting notes" },
];

interface MaterialForm {
  name: string;
  category: string;
  brand: string;
  colour: string;
  finish: string;
  fire_rating: string;
  imo_certified: boolean;
  spec_sheet_url: string;
  certificate_url: string;
  supplier_id: string;
  notes: string;
  swatch_storage_path: string;
  parent_material_id: string;
  photos: string[];
}

const emptyMaterial: MaterialForm = {
  name: "", category: "", brand: "", colour: "", finish: "",
  fire_rating: "", imo_certified: false,
  spec_sheet_url: "", certificate_url: "",
  supplier_id: "", notes: "", swatch_storage_path: "",
  parent_material_id: "",
  photos: [],
};

// --- component ---
export default function InteriorMaterials() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const qc = useQueryClient();
  const projectId = currentProject?.id;

  // queries
  const { data: interiorAreas = [] } = useQuery({
    queryKey: ["interior-areas", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase.from("areas").select("*").eq("project_id", projectId).eq("is_interior", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id,name,company").eq("project_id", projectId!);
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: materials = [] } = useQuery({
    queryKey: ["materials", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("materials").select("*").eq("project_id", projectId!).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: usages = [] } = useQuery({
    queryKey: ["material-usages", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("material_usages").select("*");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: statusHistory = [] } = useQuery({
    queryKey: ["material-status-history", projectId],
    queryFn: async () => {
      const materialIds = (materials as any[]).map((m) => m.id);
      if (materialIds.length === 0) return [];
      const { data, error } = await supabase
        .from("material_status_history")
        .select("*")
        .in("material_id", materialIds)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId && materials.length > 0,
  });

  const lastStatusChange = useMemo(() => {
    const map = new Map<string, any>();
    for (const h of statusHistory as any[]) {
      if (!map.has(h.material_id)) map.set(h.material_id, h);
    }
    return map;
  }, [statusHistory]);

  const historyForMaterial = (id: string) =>
    (statusHistory as any[]).filter((h) => h.material_id === id);

  // mutations
  const [materialDialog, setMaterialDialog] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [materialForm, setMaterialForm] = useState<MaterialForm>(emptyMaterial);
  const [swatchUploading, setSwatchUploading] = useState(false);

  const saveMaterial = useMutation({
    mutationFn: async (form: MaterialForm) => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        name: form.name, category: form.category || null, brand: form.brand || null,
        colour: form.colour || null, finish: form.finish || null, fire_rating: form.fire_rating || null,
        imo_certified: form.imo_certified, spec_sheet_url: form.spec_sheet_url || null,
        certificate_url: form.certificate_url || null, supplier_id: form.supplier_id || null,
        notes: form.notes || null, swatch_storage_path: form.swatch_storage_path || null,
        project_id: projectId!,
        parent_material_id: form.parent_material_id || null,
        photos: form.photos || [],
      };
      if (editingMaterialId) {
        const { error } = await supabase.from("materials").update(payload).eq("id", editingMaterialId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("materials").insert({ ...payload, created_by: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials", projectId] });
      toast({ title: editingMaterialId ? "Material updated" : "Material added" });
      closeMaterialDialog();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMaterial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials", projectId] });
      qc.invalidateQueries({ queryKey: ["material-usages", projectId] });
      toast({ title: "Material deleted" });
    },
  });

  const closeMaterialDialog = () => {
    setMaterialDialog(false);
    setEditingMaterialId(null);
    setMaterialForm(emptyMaterial);
  };

  const updateMaterialStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("materials").update({ selection_status: status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["materials", projectId] }); qc.invalidateQueries({ queryKey: ["material-status-history", projectId] }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // assign existing material as child
  const [assignChildDialogParentId, setAssignChildDialogParentId] = useState<string | null>(null);
  const [assignChildSearch, setAssignChildSearch] = useState("");

  const assignExistingChild = useMutation({
    mutationFn: async ({ materialId, parentId }: { materialId: string; parentId: string }) => {
      const { error } = await supabase.from("materials").update({ parent_material_id: parentId }).eq("id", materialId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials", projectId] });
      toast({ title: "Material assigned as variant" });
      setAssignChildDialogParentId(null);
      setAssignChildSearch("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unassignChild = useMutation({
    mutationFn: async (materialId: string) => {
      const { error } = await supabase.from("materials").update({ parent_material_id: null }).eq("id", materialId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials", projectId] });
      toast({ title: "Material removed from folder" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [proposerFilter, setProposerFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [qualityFilters, setQualityFilters] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const QUALITY_FILTER_OPTIONS: { key: string; label: string }[] = [
    { key: "scratch_resistance", label: "Scratch" },
    { key: "corrosion_resistance", label: "Corrosion" },
    { key: "uv_resistance", label: "UV" },
    { key: "water_resistance", label: "Water" },
    { key: "fire_resistance", label: "Fire" },
    { key: "stain_resistance", label: "Stain" },
    { key: "shock_resistance", label: "Shock" },
  ];

  const isHighResistance = (value?: string | null) => {
    if (!value) return false;
    const v = value.toLowerCase();
    return v.startsWith("high") || v.startsWith("yes") || v.includes("medium to high");
  };

  const toggleQualityFilter = (key: string) => {
    setQualityFilters((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  // detail panel + lightbox
  const [detailMaterialId, setDetailMaterialId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const toggleCompare = (id: string) => {
    setSelectedForCompare((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  // Build parent→children map
  const childrenMap = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const m of materials as any[]) {
      if (m.parent_material_id) {
        if (!map.has(m.parent_material_id)) map.set(m.parent_material_id, []);
        map.get(m.parent_material_id)!.push(m);
      }
    }
    return map;
  }, [materials]);

  const passesFilters = (m: any) => {
    if (statusFilter !== "all") {
      const ms = m.selection_status || "Pending";
      if (statusFilter === "Pending") { if (!isPendingStatus(ms)) return false; }
      else if (ms !== statusFilter) return false;
    }
    if (categoryFilter !== "all" && (m.category || "") !== categoryFilter) return false;
    if (proposerFilter !== "all" && (m.proposed_by || "") !== proposerFilter) return false;
    if (search) {
      const hay = [m.name, m.brand, m.supplier_name, m.category, m.proposed_by].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    for (const qf of qualityFilters) {
      if (!isHighResistance(m[qf])) return false;
    }
    return true;
  };

  // Filtered top-level materials (no parent, or parent doesn't exist in this project)
  const filteredMaterials = useMemo(() => {
    const allMats = materials as any[];
    const matIds = new Set(allMats.map((m) => m.id));

    const statusRank = (s?: string | null) => {
      if (s === "Main Material — Approved") return 0;
      if (s === "Finishing Material — Approved") return 1;
      if (!s || s === "Pending" || s.startsWith("Pending —")) return 2;
      if (s === "Reference Only") return 3;
      if (s === "Rejected") return 4;
      return 5;
    };

    return allMats.filter((m) => {
      // If it has a parent that exists, it's a child — don't show at top level
      if (m.parent_material_id && matIds.has(m.parent_material_id)) return false;
      // A parent passes if it or any of its children pass filters
      const children = childrenMap.get(m.id) || [];
      const selfPasses = passesFilters(m);
      const anyChildPasses = children.some(passesFilters);
      return selfPasses || anyChildPasses;
    }).sort((a, b) => {
      // In 'all' view, sort by status priority, then name
      if (statusFilter === "all") {
        const rankDiff = statusRank(a.selection_status) - statusRank(b.selection_status);
        if (rankDiff !== 0) return rankDiff;
      }
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [materials, statusFilter, categoryFilter, proposerFilter, search, qualityFilters, childrenMap]);

  const getFilteredChildren = (parentId: string) => {
    const children = childrenMap.get(parentId) || [];
    // If no filters active, show all children
    if (statusFilter === "all" && categoryFilter === "all" && proposerFilter === "all" && !search && qualityFilters.length === 0) {
      return children;
    }
    return children.filter(passesFilters);
  };

  // Parent materials (those that have children) — for the "Parent Material" picker
  const parentCandidates = useMemo(() => {
    return (materials as any[]).filter((m) => !m.parent_material_id);
  }, [materials]);

  const allCategories = useMemo(() => Array.from(new Set((materials as any[]).map((m) => m.category).filter(Boolean))).sort(), [materials]);
  const allProposers = useMemo(() => Array.from(new Set((materials as any[]).map((m) => m.proposed_by).filter(Boolean))).sort(), [materials]);
  const compareMaterials = useMemo(() => (materials as any[]).filter((m) => selectedForCompare.includes(m.id)), [materials, selectedForCompare]);
  const detailMaterial = useMemo(() => (materials as any[]).find((m) => m.id === detailMaterialId) || null, [materials, detailMaterialId]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let withSwatch = 0;
    let withoutSwatch = 0;
    let totalPending = 0;
    for (const m of materials as any[]) {
      const s = m.selection_status || "Pending";
      counts[s] = (counts[s] || 0) + 1;
      if (isPendingStatus(s)) totalPending++;
      if (m.swatch_storage_path) withSwatch++; else withoutSwatch++;
    }
    return { counts, withSwatch, withoutSwatch, totalPending };
  }, [materials]);

  const bulkUpdateStatus = useMutation({
    mutationFn: async (status: string) => {
      const promises = selectedForCompare.map((id) =>
        supabase.from("materials").update({ selection_status: status }).eq("id", id)
      );
      const results = await Promise.all(promises);
      const err = results.find((r) => r.error);
      if (err?.error) throw err.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials", projectId] });
      qc.invalidateQueries({ queryKey: ["material-status-history", projectId] });
      toast({ title: `Updated ${selectedForCompare.length} materials` });
      setSelectedForCompare([]);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEditMaterial = (m: any) => {
    setEditingMaterialId(m.id);
    setMaterialForm({
      name: m.name, category: m.category || "", brand: m.brand || "", colour: m.colour || "",
      finish: m.finish || "", fire_rating: m.fire_rating || "", imo_certified: !!m.imo_certified,
      spec_sheet_url: m.spec_sheet_url || "", certificate_url: m.certificate_url || "",
      supplier_id: m.supplier_id || "", notes: m.notes || "", swatch_storage_path: m.swatch_storage_path || "",
      parent_material_id: m.parent_material_id || "",
      photos: Array.isArray(m.photos) ? m.photos : [],
    });
    setMaterialDialog(true);
  };

  const openAddChild = (parentId: string) => {
    setEditingMaterialId(null);
    setMaterialForm({ ...emptyMaterial, parent_material_id: parentId });
    setMaterialDialog(true);
  };

  const handleSwatchUpload = async (file: File) => {
    if (!projectId) return;
    setSwatchUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("material-swatches").upload(path, file);
      if (error) throw error;
      setMaterialForm((f) => ({ ...f, swatch_storage_path: path }));
      toast({ title: "Swatch uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setSwatchUploading(false);
    }
  };

  const handleRemoveSwatch = async () => {
    const path = materialForm.swatch_storage_path;
    if (!path) return;
    try {
      await supabase.storage.from("material-swatches").remove([path]);
    } catch {}
    setMaterialForm((f) => ({ ...f, swatch_storage_path: "" }));
  };

  const handleAdditionalPhotosUpload = async (files: FileList) => {
    if (!projectId || !files.length) return;
    setSwatchUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop();
        const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("material-swatches").upload(path, file);
        if (error) throw error;
        uploaded.push(path);
      }
      setMaterialForm((f) => ({ ...f, photos: [...(f.photos || []), ...uploaded] }));
      toast({ title: `${uploaded.length} photo${uploaded.length !== 1 ? "s" : ""} added` });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setSwatchUploading(false);
    }
  };

  const handleRemovePhoto = async (path: string) => {
    try {
      await supabase.storage.from("material-swatches").remove([path]);
    } catch {}
    setMaterialForm((f) => ({ ...f, photos: (f.photos || []).filter((p) => p !== path) }));
  };

  const handlePromoteToSwatch = (path: string) => {
    setMaterialForm((f) => {
      const others = (f.photos || []).filter((p) => p !== path);
      const demoted = f.swatch_storage_path ? [f.swatch_storage_path, ...others] : others;
      return { ...f, swatch_storage_path: path, photos: demoted };
    });
  };

  const swatchUrl = (path?: string | null) => path ? supabase.storage.from("material-swatches").getPublicUrl(path).data.publicUrl : null;

  // usage dialog
  const [usageDialogMaterialId, setUsageDialogMaterialId] = useState<string | null>(null);
  const [usageForm, setUsageForm] = useState({ area_id: "", location_detail: "", quantity: "", unit: "", notes: "" });

  const addUsage = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("material_usages").insert({
        material_id: usageDialogMaterialId!, area_id: usageForm.area_id || null,
        location_detail: usageForm.location_detail || null, quantity: usageForm.quantity ? Number(usageForm.quantity) : null,
        unit: usageForm.unit || null, notes: usageForm.notes || null, created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["material-usages", projectId] });
      toast({ title: "Usage added" });
      setUsageDialogMaterialId(null);
      setUsageForm({ area_id: "", location_detail: "", quantity: "", unit: "", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteUsage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("material_usages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material-usages", projectId] }),
  });

  const areaName = (id?: string | null) => interiorAreas.find((a) => a.id === id)?.name || "—";
  const supplierLabel = (m: any) => {
    if (m.supplier_id) {
      const s = suppliers.find((s: any) => s.id === m.supplier_id);
      return s ? `${s.name}${s.company ? ` (${s.company})` : ""}` : m.supplier_name;
    }
    return m.supplier_name || null;
  };

  if (!projectId) return <p className="text-muted-foreground">Select a project.</p>;

  // --- GRID CARD (reusable) ---
  const renderGridCard = (m: any, isChild = false) => {
    const isChecked = selectedForCompare.includes(m.id);
    const url = swatchUrl(m.swatch_storage_path);
    return (
      <button
        key={m.id}
        type="button"
        className={`group relative rounded-lg overflow-hidden border bg-card text-left transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isChecked ? "ring-2 ring-primary" : ""} ${isChild ? "opacity-95" : ""}`}
        onClick={() => setDetailMaterialId(m.id)}
      >
        <div className={`aspect-[4/3] relative ${url ? "bg-muted" : categoryPlaceholder(m.category).bg}`}>
          {url ? (
            <img src={url} alt={m.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2">
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${categoryPlaceholder(m.category).text}`}>{categoryPlaceholder(m.category).label}</span>
              <span className="text-[9px] text-muted-foreground/50">No image</span>
            </div>
          )}
          <span className={`absolute top-2 right-2 h-3 w-3 rounded-full border-2 border-background shadow ${statusDot(m.selection_status)}`} />
          <div
            className={`absolute top-2 left-2 transition-opacity ${isChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            onClick={(e) => { e.stopPropagation(); toggleCompare(m.id); }}
          >
            <div className="h-6 w-6 rounded bg-background/80 backdrop-blur flex items-center justify-center shadow-sm">
              <Checkbox checked={isChecked} className="pointer-events-none" />
            </div>
          </div>
          {url && (
            <div
              className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); setLightboxUrl(url); }}
            >
              <div className="h-7 w-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center shadow-sm">
                <ZoomIn className="h-3.5 w-3.5" />
              </div>
            </div>
          )}
        </div>
        <div className="px-2.5 py-2 space-y-0.5">
          <p className="text-sm font-medium leading-tight truncate">{m.name}</p>
          <div className="flex items-center gap-1.5">
            {m.category && <span className="text-[10px] text-muted-foreground">{m.category}</span>}
            {m.brand && <span className="text-[10px] text-muted-foreground">· {m.brand}</span>}
          </div>
        </div>
      </button>
    );
  };

  // --- LIST CARD (reusable) ---
  const renderListCard = (m: any, isChild = false) => {
    const matUsages = usages.filter((u: any) => u.material_id === m.id);
    const isChecked = selectedForCompare.includes(m.id);
    const label = supplierLabel(m);
    return (
      <Card key={m.id} className={`overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${isChecked ? "ring-2 ring-primary" : ""} ${isChild ? "ml-6 border-l-2 border-l-primary/20" : ""}`} onClick={() => setDetailMaterialId(m.id)}>
        <div className="flex">
          {m.swatch_storage_path ? (
            <img src={swatchUrl(m.swatch_storage_path)!} alt={m.name} className="h-24 w-24 object-cover shrink-0" />
          ) : (
           <div className={`h-24 w-24 flex flex-col items-center justify-center shrink-0 ${categoryPlaceholder(m.category).bg}`}>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${categoryPlaceholder(m.category).text}`}>{categoryPlaceholder(m.category).label}</span>
              <span className="text-[8px] text-muted-foreground/50">No image</span>
            </div>
          )}
          <div className="flex-1 p-3 space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <div onClick={(e) => { e.stopPropagation(); toggleCompare(m.id); }}>
                <Checkbox checked={isChecked} />
              </div>
              <p className="font-medium truncate text-sm">{m.name}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {m.category && <Badge variant="outline" className="text-[10px]">{m.category}</Badge>}
              {m.proposed_by && <Badge variant="secondary" className="text-[10px]">{m.proposed_by}</Badge>}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`h-2 w-2 rounded-full shrink-0 ${statusDot(m.selection_status)}`} />
              <span className="text-xs text-muted-foreground truncate">
                {m.selection_status === "Pending — Main Material" ? "Pending" : m.selection_status === "Pending — Finishing Material" ? "Pending" : m.selection_status || "Pending"}
              </span>
              {m.selection_status === "Pending — Main Material" && <Badge variant="outline" className="text-[9px] px-1 py-0">Main</Badge>}
              {m.selection_status === "Pending — Finishing Material" && <Badge variant="outline" className="text-[9px] px-1 py-0">Finishing</Badge>}
            </div>
            {lastStatusChange.get(m.id) && (
              <p className="text-[9px] text-muted-foreground/70">Status changed {new Date(lastStatusChange.get(m.id).changed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
            )}
            {label && <p className="text-xs text-muted-foreground truncate">Supplier: {label}</p>}
            <p className="text-[10px] text-muted-foreground">Used in {matUsages.length} location{matUsages.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </Card>
    );
  };

  // --- RENDER ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/interior" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <Sofa className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Materials — {currentProject?.name}</h1>
          <p className="text-muted-foreground text-sm">Material library, comparison, and development programme.</p>
        </div>
      </div>

      <Tabs defaultValue="library">
        <TabsList>
          <TabsTrigger value="library">Library ({materials.length})</TabsTrigger>
          <TabsTrigger value="compare">Compare{selectedForCompare.length > 0 ? ` (${selectedForCompare.length})` : ""}</TabsTrigger>
          <TabsTrigger value="development">Development</TabsTrigger>
        </TabsList>

        {/* ═══════ LIBRARY TAB ═══════ */}
        <TabsContent value="library" className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 border rounded-md p-0.5">
              <Button size="icon" variant={viewMode === "grid" ? "default" : "ghost"} className="h-8 w-8" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
              <Button size="icon" variant={viewMode === "list" ? "default" : "ghost"} className="h-8 w-8" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
            </div>
            <Dialog open={materialDialog} onOpenChange={(o) => { if (!o) closeMaterialDialog(); else setMaterialDialog(true); }}>
              <DialogTrigger asChild>
                <Button onClick={() => { setMaterialForm(emptyMaterial); setEditingMaterialId(null); }}>
                  <Plus className="h-4 w-4 mr-1" /> Add Material
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingMaterialId ? "Edit Material" : "Add Material"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); saveMaterial.mutate(materialForm); }} className="space-y-4 mt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-2">
                      <Label>Name *</Label>
                      <Input required value={materialForm.name} onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })} placeholder="e.g. Loro Piana Cashmere — Ivory" />
                    </div>
                    {/* Parent material picker */}
                    <div className="col-span-2 space-y-2">
                      <Label>Parent Material (optional)</Label>
                      <Select
                        value={materialForm.parent_material_id || "none"}
                        onValueChange={(v) => setMaterialForm({ ...materialForm, parent_material_id: v === "none" ? "" : v })}
                      >
                        <SelectTrigger><SelectValue placeholder="None — top-level material" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None — top-level material</SelectItem>
                          {parentCandidates
                            .filter((p) => p.id !== editingMaterialId)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}{p.category ? ` (${p.category})` : ""}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">Assign this material under a parent to group related variants (e.g. types of glass under "Glass").</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={materialForm.category || "none"} onValueChange={(v) => setMaterialForm({ ...materialForm, category: v === "none" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {MATERIAL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Brand</Label><Input value={materialForm.brand} onChange={(e) => setMaterialForm({ ...materialForm, brand: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Colour</Label><Input value={materialForm.colour} onChange={(e) => setMaterialForm({ ...materialForm, colour: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Finish</Label><Input value={materialForm.finish} onChange={(e) => setMaterialForm({ ...materialForm, finish: e.target.value })} placeholder="Matte, satin, brushed…" /></div>
                    <div className="space-y-2">
                      <Label>Supplier</Label>
                      <Select value={materialForm.supplier_id || "none"} onValueChange={(v) => setMaterialForm({ ...materialForm, supplier_id: v === "none" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {suppliers.filter((s: any) => s.id).map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}{s.company ? ` (${s.company})` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Fire rating</Label><Input value={materialForm.fire_rating} onChange={(e) => setMaterialForm({ ...materialForm, fire_rating: e.target.value })} placeholder="e.g. IMO FTPC Part 8" /></div>
                    <div className="col-span-2 flex items-center gap-2">
                      <Checkbox id="imo" checked={materialForm.imo_certified} onCheckedChange={(v) => setMaterialForm({ ...materialForm, imo_certified: !!v })} />
                      <Label htmlFor="imo" className="font-normal cursor-pointer">IMO certified</Label>
                    </div>
                    <div className="space-y-2"><Label>Spec sheet URL</Label><Input type="url" value={materialForm.spec_sheet_url} onChange={(e) => setMaterialForm({ ...materialForm, spec_sheet_url: e.target.value })} placeholder="https://…" /></div>
                    <div className="space-y-2"><Label>Certificate URL</Label><Input type="url" value={materialForm.certificate_url} onChange={(e) => setMaterialForm({ ...materialForm, certificate_url: e.target.value })} placeholder="https://…" /></div>
                    <div className="col-span-2 space-y-2">
                      <Label>Primary swatch image</Label>
                      <div className="flex items-center gap-3">
                        {materialForm.swatch_storage_path ? (
                          <div className="relative group">
                            <img src={swatchUrl(materialForm.swatch_storage_path)!} alt="Swatch" className="h-16 w-16 object-cover rounded border" />
                            <button
                              type="button"
                              onClick={handleRemoveSwatch}
                              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove swatch"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="h-16 w-16 rounded border bg-muted flex items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>
                        )}
                        <Input type="file" accept="image/*" disabled={swatchUploading} onChange={(e) => e.target.files?.[0] && handleSwatchUpload(e.target.files[0])} />
                      </div>
                    </div>
                    <div className="col-span-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Additional photos ({materialForm.photos.length})</Label>
                        <Label htmlFor="add-photos" className="text-xs text-primary cursor-pointer hover:underline">
                          <Plus className="h-3 w-3 inline mr-0.5" /> Add photos
                        </Label>
                        <Input
                          id="add-photos"
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={swatchUploading}
                          onChange={(e) => e.target.files && handleAdditionalPhotosUpload(e.target.files)}
                        />
                      </div>
                      {materialForm.photos.length > 0 && (
                        <div className="grid grid-cols-6 gap-2">
                          {materialForm.photos.map((p) => {
                            const url = swatchUrl(p);
                            return (
                              <div key={p} className="relative group aspect-square rounded border overflow-hidden bg-muted">
                                {url && <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handlePromoteToSwatch(p)}
                                    className="text-[9px] text-white bg-primary px-1.5 py-0.5 rounded hover:bg-primary/80"
                                    title="Make primary"
                                  >
                                    Set primary
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePhoto(p)}
                                    className="text-[9px] text-white bg-destructive px-1.5 py-0.5 rounded hover:bg-destructive/80"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground">Add multiple photos (close-ups, samples in context, etc.). Hover to remove or promote to primary swatch.</p>
                    </div>
                    <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={2} value={materialForm.notes} onChange={(e) => setMaterialForm({ ...materialForm, notes: e.target.value })} /></div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={closeMaterialDialog}>Cancel</Button>
                    <Button type="submit" disabled={saveMaterial.isPending}>{saveMaterial.isPending ? "Saving…" : "Save"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Filters */}
          {materials.length > 0 && (
            <Card>
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-5">
                  <Input placeholder="Search name, brand, supplier…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {STATUS_GROUPS.map((g) => (
                        <SelectGroup key={g.label}>
                          <SelectLabel>{g.label}</SelectLabel>
                          {g.statuses.map((s) => <SelectItem key={s} value={s}>{s === "Pending" ? "Pending (unspecified)" : s.replace("Pending — ", "Pending — ").replace("Main Material — ", "Main — ").replace("Finishing Material — ", "Finishing — ")}</SelectItem>)}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {allCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={proposerFilter} onValueChange={setProposerFilter}>
                    <SelectTrigger><SelectValue placeholder="All proposers" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All proposers</SelectItem>
                      {allProposers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{filteredMaterials.length} of {materials.length}</span>
                    {selectedForCompare.length > 0 && <Button variant="ghost" size="sm" onClick={() => setSelectedForCompare([])}>Clear ({selectedForCompare.length})</Button>}
                  </div>
                </div>
                {/* Quality / resistance filter chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground">High resistance:</span>
                  {QUALITY_FILTER_OPTIONS.map((opt) => {
                    const active = qualityFilters.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => toggleQualityFilter(opt.key)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                  {qualityFilters.length > 0 && (
                    <button type="button" onClick={() => setQualityFilters([])} className="text-xs text-muted-foreground underline hover:text-foreground ml-1">
                      Clear
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary stats bar */}
          {materials.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${statusFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:bg-accent"}`}
              >
                All {materials.length}
              </button>
              {["Main Material — Approved", "Finishing Material — Approved"].map((s) => {
                const count = statusCounts.counts[s] || 0;
                if (count === 0) return null;
                const active = statusFilter === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(active ? "all" : s)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:bg-accent"}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${active ? "bg-primary-foreground" : "bg-green-500"}`} />
                    {s.replace("Main Material — ", "Main ").replace("Finishing Material — ", "Finishing ")} {count}
                  </button>
                );
              })}
              {statusCounts.totalPending > 0 && (() => {
                const active = statusFilter === "Pending";
                const mainPending = statusCounts.counts["Pending — Main Material"] || 0;
                const finishingPending = statusCounts.counts["Pending — Finishing Material"] || 0;
                const unspecified = statusCounts.counts["Pending"] || 0;
                return (
                  <button
                    type="button"
                    onClick={() => setStatusFilter(active ? "all" : "Pending")}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:bg-accent"}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${active ? "bg-primary-foreground" : "bg-amber-500"}`} />
                    Pending {statusCounts.totalPending}
                    {(mainPending > 0 || finishingPending > 0) && (
                      <span className="text-[10px] opacity-70 ml-0.5">
                        ({mainPending > 0 ? `${mainPending} main` : ""}{mainPending > 0 && finishingPending > 0 ? ", " : ""}{finishingPending > 0 ? `${finishingPending} finishing` : ""}{unspecified > 0 ? `${mainPending > 0 || finishingPending > 0 ? ", " : ""}${unspecified} unset` : ""})
                      </span>
                    )}
                  </button>
                );
              })()}
              {(statusCounts.counts["Reference Only"] || 0) > 0 && (() => {
                const count = statusCounts.counts["Reference Only"] || 0;
                const active = statusFilter === "Reference Only";
                return (
                  <button
                    type="button"
                    onClick={() => setStatusFilter(active ? "all" : "Reference Only")}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:bg-accent"}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${active ? "bg-primary-foreground" : "bg-blue-500"}`} />
                    Reference Only {count}
                  </button>
                );
              })()}
              {(statusCounts.counts["Rejected"] || 0) > 0 && (() => {
                const count = statusCounts.counts["Rejected"] || 0;
                const active = statusFilter === "Rejected";
                return (
                  <button
                    type="button"
                    onClick={() => setStatusFilter(active ? "all" : "Rejected")}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:bg-accent"}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${active ? "bg-primary-foreground" : "bg-red-500"}`} />
                    Rejected {count}
                  </button>
                );
              })()}
              <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-2">
                <ImageIcon className="h-3 w-3" /> {statusCounts.withSwatch} with image · {statusCounts.withoutSwatch} without
              </span>
            </div>
          )}

          {/* Empty states */}
          {materials.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No materials yet. Add fabrics, leathers, veneers, stones — anything that needs tracking.</CardContent></Card>
          ) : filteredMaterials.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No materials match the current filters.</CardContent></Card>
          ) : viewMode === "grid" ? (
            /* ─── GRID VIEW (mood-board with folders) ─── */
            <div className="space-y-4">
              {/* Folder materials */}
              {filteredMaterials.filter((m: any) => (getFilteredChildren(m.id)).length > 0).map((m: any) => {
                const children = getFilteredChildren(m.id);
                const isExpanded = expandedFolders.has(m.id);
                return (
                  <div key={m.id} className="border rounded-lg bg-card overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => toggleFolder(m.id)}
                    >
                      <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      {isExpanded ? <FolderOpen className="h-5 w-5 text-primary shrink-0" /> : <Folder className="h-5 w-5 text-muted-foreground shrink-0" />}
                      {m.swatch_storage_path && (
                        <img src={swatchUrl(m.swatch_storage_path)!} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{m.name}</p>
                        <p className="text-[11px] text-muted-foreground">{children.length} variant{children.length !== 1 ? "s" : ""}{m.category ? ` · ${m.category}` : ""}</p>
                      </div>
                      <span className={`h-3 w-3 rounded-full shrink-0 ${statusDot(m.selection_status)}`} />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs shrink-0"
                        onClick={(e) => { e.stopPropagation(); openAddChild(m.id); }}
                      >
                        <Plus className="h-3 w-3 mr-0.5" /> Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs shrink-0"
                        onClick={(e) => { e.stopPropagation(); setDetailMaterialId(m.id); }}
                      >
                        View
                      </Button>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1">
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                          {children.map((child: any) => renderGridCard(child, true))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Standalone (non-folder) materials in a single grid */}
              {(() => {
                const standalones = filteredMaterials.filter((m: any) => (getFilteredChildren(m.id)).length === 0);
                if (standalones.length === 0) return null;
                return (
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {standalones.map((m: any) => renderGridCard(m))}
                  </div>
                );
              })()}
            </div>
          ) : (
            /* ─── LIST VIEW (compact with folders) ─── */
            <div className="space-y-3">
              {/* Folder materials */}
              {filteredMaterials.filter((m: any) => (getFilteredChildren(m.id)).length > 0).map((m: any) => {
                const children = getFilteredChildren(m.id);
                const isExpanded = expandedFolders.has(m.id);
                return (
                  <div key={m.id} className="border rounded-lg bg-card overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => toggleFolder(m.id)}
                    >
                      <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      {isExpanded ? <FolderOpen className="h-5 w-5 text-primary shrink-0" /> : <Folder className="h-5 w-5 text-muted-foreground shrink-0" />}
                      {m.swatch_storage_path && (
                        <img src={swatchUrl(m.swatch_storage_path)!} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{m.name}</p>
                        <p className="text-[11px] text-muted-foreground">{children.length} variant{children.length !== 1 ? "s" : ""}{m.category ? ` · ${m.category}` : ""}</p>
                      </div>
                      <span className={`h-3 w-3 rounded-full shrink-0 ${statusDot(m.selection_status)}`} />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs shrink-0"
                        onClick={(e) => { e.stopPropagation(); openAddChild(m.id); }}
                      >
                        <Plus className="h-3 w-3 mr-0.5" /> Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs shrink-0"
                        onClick={(e) => { e.stopPropagation(); setDetailMaterialId(m.id); }}
                      >
                        View
                      </Button>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                          {children.map((child: any) => renderListCard(child, true))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Standalone materials */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredMaterials.filter((m: any) => (getFilteredChildren(m.id)).length === 0).map((m: any) => renderListCard(m))}
              </div>
            </div>
          )}

          {/* ─── BULK ACTION BAR ─── */}
          {selectedForCompare.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card border shadow-lg rounded-full px-5 py-2.5">
              <span className="text-sm font-medium">{selectedForCompare.length} selected</span>
              <Select onValueChange={(v) => bulkUpdateStatus.mutate(v)}>
                <SelectTrigger className="w-[200px] h-8 text-xs">
                  <SelectValue placeholder="Set status…" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_GROUPS.map((g) => (
                    <SelectGroup key={g.label}>
                      <SelectLabel>{g.label}</SelectLabel>
                      {g.statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setSelectedForCompare([])}>
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            </div>
          )}

          {/* ─── DETAIL SHEET ─── */}
          <Sheet open={!!detailMaterial} onOpenChange={(o) => !o && setDetailMaterialId(null)}>
            <SheetContent className="sm:max-w-lg overflow-y-auto">
              {detailMaterial && (() => {
                const m = detailMaterial;
                const url = swatchUrl(m.swatch_storage_path);
                const matUsages = usages.filter((u: any) => u.material_id === m.id);
                const label = supplierLabel(m);
                const children = childrenMap.get(m.id) || [];
                const parentMat = m.parent_material_id ? (materials as any[]).find((p) => p.id === m.parent_material_id) : null;
                return (
                  <>
                    <SheetHeader>
                      <SheetTitle className="text-lg">{m.name}</SheetTitle>
                      <SheetDescription>
                        {[m.category, m.brand].filter(Boolean).join(" · ") || "Material details"}
                      </SheetDescription>
                    </SheetHeader>

                    {/* Parent breadcrumb */}
                    {parentMat && (
                      <button
                        type="button"
                        className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
                        onClick={() => setDetailMaterialId(parentMat.id)}
                      >
                        <ArrowLeft className="h-3 w-3" /> {parentMat.name}
                      </button>
                    )}

                    {/* Swatch */}
                    {url ? (
                      <button
                        type="button"
                        className="relative w-full aspect-[3/2] mt-4 rounded-lg overflow-hidden group cursor-zoom-in"
                        onClick={() => setLightboxUrl(url)}
                      >
                        <img src={url} alt={m.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                          <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow" />
                        </div>
                      </button>
                    ) : (
                      <div className="w-full aspect-[3/2] mt-4 rounded-lg bg-muted flex items-center justify-center">
                        <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
                      </div>
                    )}

                    {/* Photo gallery */}
                    {Array.isArray(m.photos) && m.photos.length > 0 && (
                      <div className="mt-3 grid grid-cols-4 gap-1.5">
                        {m.photos.map((p: string) => {
                          const purl = swatchUrl(p);
                          if (!purl) return null;
                          return (
                            <button
                              key={p}
                              type="button"
                              className="relative aspect-square rounded overflow-hidden bg-muted cursor-zoom-in group"
                              onClick={() => setLightboxUrl(purl)}
                            >
                              <img src={purl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Status */}
                    <div className="mt-4">
                      <Label className="text-xs text-muted-foreground">Selection Status</Label>
                      <Select value={m.selection_status || "Pending"} onValueChange={(v) => updateMaterialStatus.mutate({ id: m.id, status: v })}>
                        <SelectTrigger className={`mt-1 ${statusTone(m.selection_status)}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_GROUPS.map((g) => (
                            <SelectGroup key={g.label}>
                              <SelectLabel>{g.label}</SelectLabel>
                              {g.statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      {lastStatusChange.get(m.id) && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Changed {new Date(lastStatusChange.get(m.id).changed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      )}
                    </div>

                    {/* Status History */}
                    {historyForMaterial(m.id).length > 0 && (
                      <div className="mt-3">
                        <Label className="text-xs text-muted-foreground">Status History</Label>
                        <div className="mt-1 max-h-40 overflow-y-auto space-y-1">
                          {historyForMaterial(m.id).map((h: any) => (
                            <div key={h.id} className="flex items-center gap-2 text-[11px] py-1 border-b border-muted last:border-0">
                              <span className="text-muted-foreground shrink-0">
                                {new Date(h.changed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                              <span className="truncate">
                                {h.from_status ? <><span className="text-muted-foreground">{h.from_status}</span> → </> : null}
                                <span className="font-medium">{h.to_status}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Separator className="my-4" />
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      {m.colour && <><span className="text-muted-foreground">Colour</span><span>{m.colour}</span></>}
                      {m.finish && <><span className="text-muted-foreground">Finish</span><span>{m.finish}</span></>}
                      {m.proposed_by && <><span className="text-muted-foreground">Proposed by</span><span>{m.proposed_by}</span></>}
                      {label && <><span className="text-muted-foreground">Supplier</span><span>{label}</span></>}
                      {m.dimension && <><span className="text-muted-foreground">Dimension</span><span>{m.dimension}</span></>}
                      {m.weight && <><span className="text-muted-foreground">Weight</span><span>{m.weight}</span></>}
                      {m.format && <><span className="text-muted-foreground">Format</span><span>{m.format}</span></>}
                    </div>

                    {/* Resistances */}
                    {(m.fire_resistance || m.scratch_resistance || m.water_resistance || m.corrosion_resistance || m.uv_resistance || m.shock_resistance || m.stain_resistance) && (
                      <>
                        <Separator className="my-4" />
                        <p className="text-xs font-medium text-muted-foreground mb-2">Resistances & Properties</p>
                        <div className="flex flex-wrap gap-1.5">
                          {m.fire_resistance && <Badge variant="outline" className="text-xs">Fire: {m.fire_resistance}</Badge>}
                          {m.scratch_resistance && <Badge variant="outline" className="text-xs">Scratch: {m.scratch_resistance}</Badge>}
                          {m.water_resistance && <Badge variant="outline" className="text-xs">Water: {m.water_resistance}</Badge>}
                          {m.corrosion_resistance && <Badge variant="outline" className="text-xs">Corrosion: {m.corrosion_resistance}</Badge>}
                          {m.uv_resistance && <Badge variant="outline" className="text-xs">UV: {m.uv_resistance}</Badge>}
                          {m.shock_resistance && <Badge variant="outline" className="text-xs">Shock: {m.shock_resistance}</Badge>}
                          {m.stain_resistance && <Badge variant="outline" className="text-xs">Stain: {m.stain_resistance}</Badge>}
                          {m.imo_certified && <Badge className="text-xs bg-green-600 hover:bg-green-700">IMO ✓</Badge>}
                        </div>
                      </>
                    )}

                    {/* Links */}
                    {(m.spec_sheet_url || m.certificate_url) && (
                      <>
                        <Separator className="my-4" />
                        <div className="flex flex-wrap gap-3 text-sm">
                          {m.spec_sheet_url && <a href={m.spec_sheet_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">Spec sheet <ExternalLink className="h-3 w-3" /></a>}
                          {m.certificate_url && <a href={m.certificate_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">Certificate <ExternalLink className="h-3 w-3" /></a>}
                        </div>
                      </>
                    )}

                    {/* Notes */}
                    {(m.notes || m.description || m.meeting_notes) && (
                      <>
                        <Separator className="my-4" />
                        {m.description && <><p className="text-xs font-medium text-muted-foreground mb-1">Description</p><p className="text-sm mb-3 whitespace-pre-wrap">{m.description}</p></>}
                        {m.notes && <><p className="text-xs font-medium text-muted-foreground mb-1">Notes</p><p className="text-sm mb-3 whitespace-pre-wrap">{m.notes}</p></>}
                        {m.meeting_notes && <><p className="text-xs font-medium text-muted-foreground mb-1">Meeting notes</p><p className="text-sm whitespace-pre-wrap">{m.meeting_notes}</p></>}
                      </>
                    )}

                    {/* Child materials (variants) */}
                    {children.length > 0 && (
                      <>
                        <Separator className="my-4" />
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium flex items-center gap-1.5">
                            <FolderOpen className="h-4 w-4 text-primary" />
                            Variants ({children.length})
                          </p>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAssignChildDialogParentId(m.id)}>
                              Assign Existing
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAddChild(m.id)}>
                              <Plus className="h-3 w-3 mr-0.5" /> New
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {children.map((child: any) => (
                            <div
                              key={child.id}
                              className="w-full flex items-center gap-2.5 p-2 rounded-md border hover:bg-muted/50 transition-colors group"
                            >
                              <button
                                type="button"
                                className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                                onClick={() => setDetailMaterialId(child.id)}
                              >
                                {child.swatch_storage_path ? (
                                  <img src={swatchUrl(child.swatch_storage_path)!} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                                ) : (
                                  <div className={`h-8 w-8 rounded shrink-0 ${categoryPlaceholder(child.category).bg} flex items-center justify-center`}>
                                    <span className={`text-[8px] font-semibold ${categoryPlaceholder(child.category).text}`}>{(child.category || "M")[0]}</span>
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{child.name}</p>
                                  {child.brand && <p className="text-[10px] text-muted-foreground truncate">{child.brand}</p>}
                                </div>
                                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusDot(child.selection_status)}`} />
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              </button>
                              <button
                                type="button"
                                title="Remove from folder"
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0 p-1"
                                onClick={() => unassignChild.mutate(child.id)}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Add variant button for materials with no children yet */}
                    {children.length === 0 && !m.parent_material_id && (
                      <>
                        <Separator className="my-4" />
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => openAddChild(m.id)}>
                            <Plus className="h-3 w-3 mr-1" /> New Variant
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => setAssignChildDialogParentId(m.id)}>
                            Assign Existing Material
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">Turn this into a folder by adding or assigning related material variants.</p>
                      </>
                    )}

                    {/* Usages */}
                    <Separator className="my-4" />
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">Used in ({matUsages.length})</p>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setUsageDialogMaterialId(m.id); }}>
                        <Plus className="h-3 w-3 mr-0.5" /> Location
                      </Button>
                    </div>
                    {matUsages.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No locations recorded.</p>
                    ) : (
                      <ul className="space-y-1.5 text-sm">
                        {matUsages.map((u: any) => (
                          <li key={u.id} className="flex items-start justify-between gap-2 group">
                            <span>
                              <span className="font-medium">{areaName(u.area_id)}</span>
                              {u.location_detail && <span className="text-muted-foreground"> — {u.location_detail}</span>}
                              {u.quantity && <span className="text-muted-foreground"> ({u.quantity}{u.unit ? ` ${u.unit}` : ""})</span>}
                            </span>
                            <button type="button" className="opacity-0 group-hover:opacity-100 text-destructive shrink-0" onClick={() => deleteUsage.mutate(u.id)}><Trash2 className="h-3 w-3" /></button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Actions */}
                    <Separator className="my-4" />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { openEditMaterial(m); setDetailMaterialId(null); }}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => {
                        const childCount = children.length;
                        const msg = childCount > 0 ? `Delete "${m.name}" and its ${childCount} variant(s)?` : "Delete this material?";
                        if (confirm(msg)) {
                          deleteMaterial.mutate(m.id);
                          setDetailMaterialId(null);
                        }
                      }}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                      </Button>
                    </div>
                  </>
                );
              })()}
            </SheetContent>
          </Sheet>

          {/* Usage dialog (shared) */}
          <Dialog open={!!usageDialogMaterialId} onOpenChange={(o) => !o && setUsageDialogMaterialId(null)}>
            <DialogContent>
              <DialogHeader><DialogTitle>Add usage location</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); addUsage.mutate(); }} className="space-y-3">
                <div className="space-y-2">
                  <Label>Interior area *</Label>
                  <Select value={usageForm.area_id} onValueChange={(v) => setUsageForm({ ...usageForm, area_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select area…" /></SelectTrigger>
                    <SelectContent>{interiorAreas.filter((a) => a.id).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Location detail</Label><Input placeholder="e.g. Headboard wall, Sofa upholstery" value={usageForm.location_detail} onChange={(e) => setUsageForm({ ...usageForm, location_detail: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Quantity</Label><Input type="number" step="0.01" value={usageForm.quantity} onChange={(e) => setUsageForm({ ...usageForm, quantity: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Unit</Label><Input placeholder="m², lm, pcs" value={usageForm.unit} onChange={(e) => setUsageForm({ ...usageForm, unit: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={usageForm.notes} onChange={(e) => setUsageForm({ ...usageForm, notes: e.target.value })} /></div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setUsageDialogMaterialId(null)}>Cancel</Button>
                  <Button type="submit" disabled={!usageForm.area_id || addUsage.isPending}>Add</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Assign existing material dialog */}
          <Dialog open={!!assignChildDialogParentId} onOpenChange={(o) => { if (!o) { setAssignChildDialogParentId(null); setAssignChildSearch(""); } }}>
            <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Assign Existing Material</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground">
                Pick a material to move under{" "}
                <span className="font-medium text-foreground">
                  {(materials as any[]).find((m) => m.id === assignChildDialogParentId)?.name || "this folder"}
                </span>.
              </p>
              <Input
                placeholder="Search materials…"
                value={assignChildSearch}
                onChange={(e) => setAssignChildSearch(e.target.value)}
                className="mt-2"
              />
              <div className="flex-1 overflow-y-auto mt-2 space-y-1 min-h-0 max-h-[50vh]">
                {(() => {
                  const parentId = assignChildDialogParentId;
                  if (!parentId) return null;
                  const parentChildren = childrenMap.get(parentId) || [];
                  const childIds = new Set(parentChildren.map((c: any) => c.id));
                  const candidates = (materials as any[]).filter((m) => {
                    if (m.id === parentId) return false;
                    if (childIds.has(m.id)) return false;
                    // Don't allow assigning a material that itself has children (would create nesting >1 deep)
                    if (childrenMap.has(m.id) && (childrenMap.get(m.id)!).length > 0) return false;
                    if (assignChildSearch) {
                      const hay = [m.name, m.brand, m.category].filter(Boolean).join(" ").toLowerCase();
                      if (!hay.includes(assignChildSearch.toLowerCase())) return false;
                    }
                    return true;
                  });
                  if (candidates.length === 0) {
                    return <p className="text-sm text-muted-foreground py-4 text-center">No matching materials found.</p>;
                  }
                  return candidates.map((m: any) => (
                    <button
                      key={m.id}
                      type="button"
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-md border hover:bg-muted/50 transition-colors text-left"
                      onClick={() => assignExistingChild.mutate({ materialId: m.id, parentId })}
                    >
                      {m.swatch_storage_path ? (
                        <img src={swatchUrl(m.swatch_storage_path)!} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
                      ) : (
                        <div className={`h-9 w-9 rounded shrink-0 ${categoryPlaceholder(m.category).bg} flex items-center justify-center`}>
                          <span className={`text-[9px] font-semibold ${categoryPlaceholder(m.category).text}`}>{(m.category || "M")[0]}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {[m.category, m.brand, m.parent_material_id ? `Under: ${(materials as any[]).find((p) => p.id === m.parent_material_id)?.name || "another"}` : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusDot(m.selection_status)}`} />
                    </button>
                  ));
                })()}
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ═══════ COMPARE TAB ═══════ */}
        <TabsContent value="compare" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Side-by-side comparison</CardTitle>
              <CardDescription>Tick materials in the Library tab to add them here.</CardDescription>
            </CardHeader>
            <CardContent>
              {compareMaterials.length === 0 ? (
                <p className="text-sm text-muted-foreground">No materials selected. Tick the checkbox on any material card to compare.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 sticky left-0 bg-background z-10 min-w-[160px]">Property</th>
                        {compareMaterials.map((m: any) => (
                          <th key={m.id} className="text-left p-2 min-w-[220px] align-top">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{m.name}</div>
                                {m.brand && <div className="text-xs text-muted-foreground truncate">{m.brand}</div>}
                              </div>
                              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => toggleCompare(m.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                            {m.swatch_storage_path && <img src={swatchUrl(m.swatch_storage_path)!} alt="" className="h-16 w-full object-cover rounded mt-1" />}
                          </th>
                        ))}
                      </tr>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-2 sticky left-0 bg-muted/40 z-10 font-normal text-xs text-muted-foreground">Status</th>
                        {compareMaterials.map((m: any) => (
                          <th key={m.id} className="p-2 font-normal">
                            <Select value={m.selection_status || "Pending"} onValueChange={(v) => updateMaterialStatus.mutate({ id: m.id, status: v })}>
                              <SelectTrigger className={`h-8 text-xs ${statusTone(m.selection_status)}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {STATUS_GROUPS.map((g) => (
                                  <SelectGroup key={g.label}>
                                    <SelectLabel>{g.label}</SelectLabel>
                                    {g.statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                  </SelectGroup>
                                ))}
                              </SelectContent>
                            </Select>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {COMPARE_PROPERTIES.map((p) => {
                        const anyValue = compareMaterials.some((m: any) => m[p.key]);
                        if (!anyValue) return null;
                        return (
                          <tr key={p.key} className="border-b align-top">
                            <td className="p-2 font-medium text-xs text-muted-foreground sticky left-0 bg-background z-10">{p.label}</td>
                            {compareMaterials.map((m: any) => (
                              <td key={m.id} className="p-2 text-xs whitespace-pre-wrap">{m[p.key] || <span className="text-muted-foreground">—</span>}</td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ DEVELOPMENT TAB ═══════ */}
        <TabsContent value="development" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                <CardTitle><a href="https://www.basedupon.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary transition-colors">The Brief — Studio Based Upon <ExternalLink className="h-3.5 w-3.5" /></a> × R2</CardTitle>
              </div>
              <CardDescription>Material Development Programme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-lg font-medium">
                Finding and developing <span className="text-orange-600 font-semibold">low maintenance</span> materials and finishes that{" "}
                <span className="text-orange-600 font-semibold">surprise</span> and{" "}
                <span className="text-orange-600 font-semibold">delight</span>.
              </p>
              <div className="grid md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <p>Find and develop a suite of materials for R2 that allow people to focus on doing interesting and productive things rather than polishing.</p>
                  <p className="mt-2">Use this project to develop a landscape of materiality, gather consultants, material banks, universities, innovators, manufacturers and craftspeople for use on future projects.</p>
                </div>
                <div>
                  <p>Combine Based Upon's experience in pioneering and innovating materiality and finishes with this new network to push materials even further for the ongoing aspirations of the fleet, Oceanco clients and the wider Gabeverse.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2"><Hammer className="h-5 w-5 text-primary" /><CardTitle>Techniques Under Exploration</CardTitle></div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-base">Carve</h4>
                <p className="text-sm text-muted-foreground">Carving is both a technical and expressive act &amp; one of the most direct forms of intervention.</p>
                <div className="grid sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-muted/50 rounded p-3">
                    <p className="font-medium mb-1">Material Composition</p>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>• Sculptural surface (top layer)</li><li>• Core material: Cork</li><li>• Substrate: Aluminium honeycomb</li>
                    </ul>
                  </div>
                  <div className="bg-muted/50 rounded p-3">
                    <p className="font-medium mb-1">Key Questions</p>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>• CNC precision vs. hand-finished irregularity</li><li>• Where to use the machine vs. the hand?</li><li>• Right balance for material combination</li>
                    </ul>
                  </div>
                  <div className="bg-muted/50 rounded p-3">
                    <p className="font-medium mb-1">Design Elements</p>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>• Depth, relief, and shadow</li><li>• Relationship between surface &amp; structure</li><li>• Sculpture, furniture, low relief wall panels</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /><CardTitle>Strategic Directions</CardTitle></div>
              <CardDescription>Two additional routes from the presentation for creating new material value.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-base">Disrupt</h4>
                <p className="text-sm text-muted-foreground">Challenging the assumed use of materials and influencing their formation.</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Interrupt manufacturing mid-way</li><li>• Alter curing, casting, or bonding stages</li><li>• Reconfigure how layers are assembled or combined</li><li>• Move upstream before the material becomes fixed</li>
                </ul>
              </div>
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-base">Redesign</h4>
                <p className="text-sm text-muted-foreground">Material banks, specification agencies, and strong designer-makers can surface underused materials and manufacturing routes.</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Source overlooked materials and processes</li><li>• Pair designers with manufacturers early</li><li>• Rework existing systems into yacht-grade applications</li><li>• Add aesthetic value without adding maintenance burden</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /><CardTitle>Research &amp; Partners</CardTitle></div>
              <CardDescription>Making contacts in the academic and research communities is central to this project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold"><a href="https://www.paperfactor.co.uk" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary transition-colors">Paper Factor <ExternalLink className="h-3 w-3" /></a></h4>
                  <Badge variant="secondary">Example Partner</Badge>
                </div>
                <p className="text-sm text-muted-foreground">Paper Factor have a unique and beautiful cellulose material made with traditional methods. Identified as a great fit for creating the new eco-friendly composite material.</p>
                <div className="mt-2">
                  <p className="text-xs font-medium">Next Steps</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                    <li className="flex items-center gap-1"><ArrowRight className="h-3 w-3 shrink-0" /> Choose surface finishes for POC sample from Paper Factor</li>
                    <li className="flex items-center gap-1"><ArrowRight className="h-3 w-3 shrink-0" /> Test their process with our materials to achieve benchmark quality</li>
                    <li className="flex items-center gap-1"><ArrowRight className="h-3 w-3 shrink-0" /> Question where to carve by hand, where to CNC</li>
                  </ul>
                </div>
              </div>
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold"><a href="https://www.spotmaterials.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary transition-colors">Rob Thompson <ExternalLink className="h-3 w-3" /></a></h4>
                  <Badge variant="secondary">Example Partner</Badge>
                </div>
                <p className="text-sm text-muted-foreground">Author of "Sustainable Materials, Processes and Production" and "Manufacturing Processes for Design Professionals". Works as a consultant specifying materials for building humanoid robots.</p>
                <div className="grid sm:grid-cols-2 gap-3 mt-2">
                  <div>
                    <p className="text-xs font-medium">Axes of Material Research</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                      <li>• Durability</li><li>• Easy to maintain</li><li>• Sustainability</li><li>• Aesthetic beauty</li><li>• Materials rejected for mass-production</li><li>• New materials for mass-production</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium">Next Steps</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                      <li className="flex items-center gap-1"><ArrowRight className="h-3 w-3 shrink-0" /> Get Rob to build his consultancy proposal</li>
                      <li className="flex items-center gap-1"><ArrowRight className="h-3 w-3 shrink-0" /> Increase the network in this area rapidly</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold"><a href="https://www.materialsassemble.co.uk" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary transition-colors">Sofia / Materials Assemble <ExternalLink className="h-3 w-3" /></a></h4>
                  <Badge variant="secondary">Example Partner</Badge>
                </div>
                <p className="text-sm text-muted-foreground">Sofia and Materials Assemble operate in the superyacht industry, creating links between designers and material manufacturers, often with an environmental or innovation angle.</p>
                <div className="mt-2">
                  <p className="text-xs font-medium">Next Steps</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                    <li className="flex items-center gap-1"><ArrowRight className="h-3 w-3 shrink-0" /> Meet with Sofia and get specifications / design parameters of chosen materials</li>
                    <li className="flex items-center gap-1"><ArrowRight className="h-3 w-3 shrink-0" /> Based on viable materials, set up meetings with manufacturers to commission samples</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Other Potential Partners</CardTitle><CardDescription>Longer-list opportunities for research, sustainability, and crossover innovation.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="font-semibold"><a href="https://www.arts.ac.uk/subjects/3d-design-and-product-design/postgraduate/ma-material-futures-csm/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary transition-colors">Material Futures (Central Saint Martins) <ExternalLink className="h-3 w-3" /></a></h4>
                <p className="text-sm text-muted-foreground">Interesting course with a generally high standard of students. Potential partnership feeding the best ideas and students into the programme.</p>
                <p className="text-xs text-muted-foreground">Next step: meet with Mael at Milan Design Week.</p>
              </div>
              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="font-semibold"><a href="https://www.themillsfabrica.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary transition-colors">The Mills Fabrica <ExternalLink className="h-3 w-3" /></a></h4>
                <p className="text-sm text-muted-foreground">Go-to solutions platform accelerating techstyle and agrifood tech innovations for sustainability and social impact.</p>
                <p className="text-xs text-muted-foreground">Next step: arrange calls with their most exciting partners.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══════ LIGHTBOX ═══════ */}
      <Dialog open={!!lightboxUrl} onOpenChange={(o) => !o && setLightboxUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-none bg-black/95 flex items-center justify-center">
          <DialogHeader className="sr-only"><DialogTitle>Swatch preview</DialogTitle></DialogHeader>
          <button
            type="button"
            className="absolute top-4 right-4 z-50 h-9 w-9 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-5 w-5 text-white" />
          </button>
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Material swatch full view"
              className="max-w-full max-h-[90vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

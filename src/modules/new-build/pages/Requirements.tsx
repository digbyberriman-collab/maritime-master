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
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import {
  ClipboardCheck, Plus, Trash2, ChevronDown, ChevronRight,
  Link2, Unlink, Upload, FileSpreadsheet, CheckCircle2, Circle,
  AlertCircle, FileText, GitBranch, Shield,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type Priority = "low" | "medium" | "high" | "critical";

interface RequirementForm {
  title: string;
  description: string;
  area_id: string;
  priority: Priority;
}

const emptyForm: RequirementForm = { title: "", description: "", area_id: "", priority: "medium" };

const priorityColors: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  critical: "bg-destructive/20 text-destructive",
};

export default function Requirements() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const projectId = currentProject?.id;

  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<RequirementForm>(emptyForm);
  const [showLink, setShowLink] = useState<string | null>(null);
  const [openAreas, setOpenAreas] = useState<Record<string, boolean>>({});
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<RequirementForm[]>([]);
  const [importFile, setImportFile] = useState("");

  // Queries
  const { data: requirements = [] } = useQuery({
    queryKey: ["requirements", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nb_requirements")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: deliverables = [] } = useQuery({
    queryKey: ["requirement_deliverables", projectId],
    queryFn: async () => {
      const reqIds = requirements.map((r) => r.id);
      if (!reqIds.length) return [];
      const { data, error } = await supabase
        .from("nb_requirement_deliverables")
        .select("*")
        .in("requirement_id", reqIds);
      if (error) throw error;
      return data;
    },
    enabled: requirements.length > 0,
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

  const { data: approvals = [] } = useQuery({
    queryKey: ["approvals-all", projectId],
    queryFn: async () => {
      const fileIds = files.map((f) => f.id);
      if (!fileIds.length) return [];
      const { data, error } = await supabase.from("nb_approvals").select("*").in("file_id", fileIds);
      if (error) throw error;
      return data;
    },
    enabled: files.length > 0,
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (isEdit: boolean) => {
      const payload = {
        title: form.title,
        description: form.description || null,
        area_id: form.area_id || null,
        priority: form.priority,
        project_id: projectId!,
        created_by: user!.id,
      };
      if (isEdit) {
        const { error } = await supabase.from("nb_requirements").update(payload).eq("id", editId!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("nb_requirements").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requirements"] });
      setShowAdd(false);
      setEditId(null);
      setForm(emptyForm);
      toast({ title: editId ? "Requirement updated" : "Requirement added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nb_requirements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requirements"] });
      toast({ title: "Requirement deleted" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (p: { requirement_id: string; deliverable_type: string; deliverable_id: string }) => {
      const { error } = await supabase.from("nb_requirement_deliverables").insert({
        ...p,
        linked_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requirement_deliverables"] });
      toast({ title: "Deliverable linked" });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nb_requirement_deliverables").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requirement_deliverables"] });
      toast({ title: "Deliverable unlinked" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      let count = 0;
      for (const row of importRows) {
        const areaMatch = areas.find((a) => a.name.toLowerCase() === row.area_id.toLowerCase());
        const { error } = await supabase.from("nb_requirements").insert({
          title: row.title,
          description: row.description || null,
          area_id: areaMatch?.id || null,
          priority: (["low", "medium", "high", "critical"].includes(row.priority) ? row.priority : "medium") as Priority,
          project_id: projectId!,
          created_by: user!.id,
        });
        if (!error) count++;
      }
      return count;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["requirements"] });
      setShowImport(false);
      setImportRows([]);
      toast({ title: `Imported ${count} requirements` });
    },
  });

  // Completion logic
  const getRequirementStatus = useCallback(
    (reqId: string) => {
      const links = deliverables.filter((d) => d.requirement_id === reqId);
      if (links.length === 0) return "unlinked";

      const allComplete = links.every((link) => {
        if (link.deliverable_type === "decision") {
          const dec = decisions.find((d) => d.id === link.deliverable_id);
          return dec?.status === "final";
        }
        if (link.deliverable_type === "file") {
          const file = files.find((f) => f.id === link.deliverable_id);
          if (file?.status === "approved") return true;
          const hasApproval = approvals.some((a) => a.file_id === link.deliverable_id && a.status === "approved");
          return hasApproval;
        }
        return false;
      });
      return allComplete ? "complete" : "in_progress";
    },
    [deliverables, decisions, files, approvals]
  );

  // Group by area
  const grouped = useMemo(() => {
    const map: Record<string, typeof requirements> = { unassigned: [] };
    areas.forEach((a) => (map[a.id] = []));
    requirements.forEach((r) => {
      const key = r.area_id || "unassigned";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [requirements, areas]);

  const getAreaProgress = (areaReqs: typeof requirements) => {
    if (!areaReqs.length) return 0;
    const complete = areaReqs.filter((r) => getRequirementStatus(r.id) === "complete").length;
    return Math.round((complete / areaReqs.length) * 100);
  };

  const totalProgress = useMemo(() => {
    if (!requirements.length) return 0;
    const complete = requirements.filter((r) => getRequirementStatus(r.id) === "complete").length;
    return Math.round((complete / requirements.length) * 100);
  }, [requirements, getRequirementStatus]);

  // Import handler
  const handleFile = useCallback(
    (file: File) => {
      setImportFile(file.name);
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "csv") {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            setImportRows(
              result.data.map((row: any) => ({
                title: row.Title || row.title || row.Name || row.name || "",
                description: row.Description || row.description || "",
                area_id: row.Area || row.area || "",
                priority: (row.Priority || row.priority || "medium").toLowerCase(),
              }))
            );
            setShowImport(true);
          },
        });
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const wb = XLSX.read(e.target?.result, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows: any[] = XLSX.utils.sheet_to_json(sheet);
          setImportRows(
            rows.map((row) => ({
              title: row.Title || row.title || row.Name || row.name || "",
              description: row.Description || row.description || "",
              area_id: row.Area || row.area || "",
              priority: (row.Priority || row.priority || "medium").toLowerCase(),
            }))
          );
          setShowImport(true);
        };
        reader.readAsArrayBuffer(file);
      }
    },
    []
  );

  const openEdit = (req: typeof requirements[0]) => {
    setForm({
      title: req.title,
      description: req.description || "",
      area_id: req.area_id || "",
      priority: req.priority as Priority,
    });
    setEditId(req.id);
    setShowAdd(true);
  };

  const statusIcon = (reqId: string) => {
    const s = getRequirementStatus(reqId);
    if (s === "complete") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    if (s === "in_progress") return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    return <Circle className="h-4 w-4 text-muted-foreground" />;
  };

  const toggleArea = (key: string) => setOpenAreas((prev) => ({ ...prev, [key]: !prev[key] }));

  if (!projectId) return <div className="p-8 text-muted-foreground">Select a project first.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Requirements
          </h1>
          <p className="text-muted-foreground text-sm">Track build spec requirements and match deliverables.</p>
        </div>
        <div className="flex gap-2">
          <label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button variant="outline" asChild>
              <span><Upload className="h-4 w-4 mr-1" /> Import</span>
            </Button>
          </label>
          <Button onClick={() => { setForm(emptyForm); setEditId(null); setShowAdd(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Requirement
          </Button>
        </div>
      </div>

      {/* Overall progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Completion</span>
            <span className="text-sm font-bold">{totalProgress}%</span>
          </div>
          <Progress value={totalProgress} className="h-3" />
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" /> {requirements.filter((r) => getRequirementStatus(r.id) === "complete").length} Complete</span>
            <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-yellow-600" /> {requirements.filter((r) => getRequirementStatus(r.id) === "in_progress").length} In Progress</span>
            <span className="flex items-center gap-1"><Circle className="h-3 w-3" /> {requirements.filter((r) => getRequirementStatus(r.id) === "unlinked").length} Unlinked</span>
          </div>
        </CardContent>
      </Card>

      {/* Grouped by area */}
      {Object.entries(grouped).map(([areaKey, areaReqs]) => {
        if (!areaReqs.length) return null;
        const area = areas.find((a) => a.id === areaKey);
        const areaName = area?.name || "Unassigned";
        const progress = getAreaProgress(areaReqs);
        const isOpen = openAreas[areaKey] !== false;

        return (
          <Collapsible key={areaKey} open={isOpen} onOpenChange={() => toggleArea(areaKey)}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-accent/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <CardTitle className="text-base">{areaName}</CardTitle>
                      <Badge variant="secondary" className="text-xs">{areaReqs.length}</Badge>
                    </div>
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <Progress value={progress} className="h-2 flex-1" />
                      <span className="text-sm font-medium w-10 text-right">{progress}%</span>
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Requirement</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Deliverables</TableHead>
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {areaReqs.map((req) => {
                        const links = deliverables.filter((d) => d.requirement_id === req.id);
                        return (
                          <TableRow key={req.id}>
                            <TableCell>{statusIcon(req.id)}</TableCell>
                            <TableCell>
                              <div className="font-medium">{req.title}</div>
                              {req.description && (
                                <div className="text-xs text-muted-foreground mt-0.5">{req.description}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={priorityColors[req.priority as Priority]}>{req.priority}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {links.map((link) => {
                                  const isFile = link.deliverable_type === "file";
                                  const item = isFile
                                    ? files.find((f) => f.id === link.deliverable_id)
                                    : decisions.find((d) => d.id === link.deliverable_id);
                                  const name = item ? ("name" in item ? item.name : item.title) : "Unknown";
                                  return (
                                    <Badge key={link.id} variant="outline" className="text-xs gap-1">
                                      {isFile ? <FileText className="h-3 w-3" /> : <GitBranch className="h-3 w-3" />}
                                      {name}
                                      <button onClick={() => unlinkMutation.mutate(link.id)} className="ml-1 hover:text-destructive">
                                        <Unlink className="h-3 w-3" />
                                      </button>
                                    </Badge>
                                  );
                                })}
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setShowLink(req.id)}>
                                  <Link2 className="h-3 w-3 mr-1" /> Link
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(req)}>
                                  <ClipboardCheck className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(req.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}

      {requirements.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No requirements yet. Add one manually or import from a spreadsheet.</p>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Requirement" : "Add Requirement"}</DialogTitle>
            <DialogDescription>Define a build spec requirement to track.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Hull structural approval" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Details…" />
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
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Priority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button disabled={!form.title.trim()} onClick={() => saveMutation.mutate(!!editId)}>
              {editId ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Deliverable Dialog */}
      <Dialog open={!!showLink} onOpenChange={() => setShowLink(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link Deliverable</DialogTitle>
            <DialogDescription>Select files or decisions to link to this requirement. A requirement is marked complete when all linked files are approved and all linked decisions are final.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-80 overflow-y-auto">
            {files.length > 0 && (
              <div>
                <Label className="flex items-center gap-1 mb-2"><FileText className="h-4 w-4" /> Files</Label>
                {files.map((f) => {
                  const alreadyLinked = deliverables.some(
                    (d) => d.requirement_id === showLink && d.deliverable_type === "file" && d.deliverable_id === f.id
                  );
                  return (
                    <div key={f.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent/30">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{f.name}</span>
                        <Badge variant="outline" className="text-xs">{f.status}</Badge>
                      </div>
                      {alreadyLinked ? (
                        <Badge variant="secondary" className="text-xs">Linked</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs"
                          onClick={() => linkMutation.mutate({ requirement_id: showLink!, deliverable_type: "file", deliverable_id: f.id })}
                        >
                          Link
                        </Button>
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
                  const alreadyLinked = deliverables.some(
                    (dl) => dl.requirement_id === showLink && dl.deliverable_type === "decision" && dl.deliverable_id === d.id
                  );
                  return (
                    <div key={d.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent/30">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{d.title}</span>
                        <Badge variant="outline" className="text-xs">{d.status}</Badge>
                      </div>
                      {alreadyLinked ? (
                        <Badge variant="secondary" className="text-xs">Linked</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs"
                          onClick={() => linkMutation.mutate({ requirement_id: showLink!, deliverable_type: "decision", deliverable_id: d.id })}
                        >
                          Link
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Requirements</DialogTitle>
            <DialogDescription>Preview {importRows.length} requirements from {importFile}. Columns expected: Title, Description, Area, Priority.</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.slice(0, 50).map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{row.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-48 truncate">{row.description}</TableCell>
                    <TableCell className="text-sm">{row.area_id}</TableCell>
                    <TableCell><Badge className={priorityColors[row.priority as Priority] || ""}>{row.priority}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
            <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending || !importRows.some((r) => r.title)}>
              Import {importRows.filter((r) => r.title).length} Requirements
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

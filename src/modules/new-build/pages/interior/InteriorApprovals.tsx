import { useMemo, useState } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckSquare, GitBranch, AlertTriangle, ArrowLeft, FileCheck, Clock, CalendarRange } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

interface ApprovalItem {
  id: string;
  drawing_number: string;
  room_name: string;
  deck_name: string;
  approval_doc: string;
  due_date: string | null;
  phase: string;
}

export default function InteriorApprovals() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;

  const { data: interiorAreas = [] } = useQuery({
    queryKey: ["interior-areas", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase.from("nb_areas").select("*").eq("project_id", projectId).eq("is_interior", true).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const interiorAreaIds = useMemo(() => interiorAreas.map((a) => a.id), [interiorAreas]);

  const { data: files = [] } = useQuery({
    queryKey: ["files", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_files").select("*").eq("project_id", projectId!);
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const interiorFileIds = useMemo(() => files.filter((f: any) => interiorAreaIds.includes(f.area_id)).map((f: any) => f.id), [files, interiorAreaIds]);

  const { data: approvals = [] } = useQuery({
    queryKey: ["approvals-interior", interiorFileIds.join(",")],
    queryFn: async () => {
      if (interiorFileIds.length === 0) return [];
      const { data, error } = await supabase.from("nb_approvals").select("*").in("file_id", interiorFileIds).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: interiorFileIds.length > 0,
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ["decisions-interior", projectId, interiorAreaIds.join(",")],
    queryFn: async () => {
      if (!projectId || interiorAreaIds.length === 0) return [];
      const { data, error } = await supabase.from("nb_decisions").select("*").eq("project_id", projectId).in("area_id", interiorAreaIds).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId && interiorAreaIds.length > 0,
  });

  const { data: interiorDrawings = [] } = useQuery({
    queryKey: ["interior-drawings", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_interior_drawings").select("*").eq("project_id", projectId!).order("deck_name").order("drawing_number");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  // Build flattened approval items from drawings
  const drawingApprovals = useMemo(() => {
    const items: ApprovalItem[] = [];
    const phaseConfig = [
      { key: "approval_doc_phase_1", dueKey: "delivery_phase_1", label: "Phase 1" },
      { key: "approval_doc_phase_2", dueKey: "delivery_phase_2", label: "Phase 2" },
      { key: "approval_doc_phase_3", dueKey: "delivery_phase_3", label: "Phase 3" },
      { key: "approval_doc_phase_4_5", dueKey: null, label: "Phase 4/5" },
    ];
    for (const d of interiorDrawings as any[]) {
      for (const pc of phaseConfig) {
        const doc = d[pc.key];
        if (doc && doc.trim()) {
          items.push({
            id: `${d.id}-${pc.label}`,
            drawing_number: d.drawing_number,
            room_name: d.room_name,
            deck_name: d.deck_name || "Unknown",
            approval_doc: doc,
            due_date: pc.dueKey ? d[pc.dueKey] || null : null,
            phase: pc.label,
          });
        }
      }
    }
    return items;
  }, [interiorDrawings]);

  // Group drawing approvals by phase
  const approvalsByPhase = useMemo(() => {
    const groups: Record<string, ApprovalItem[]> = {};
    for (const item of drawingApprovals) {
      if (!groups[item.phase]) groups[item.phase] = [];
      groups[item.phase].push(item);
    }
    return groups;
  }, [drawingApprovals]);

  const openRaid = useMemo(() => decisions.filter((d: any) => d.item_type !== "decision" && d.raid_status !== "closed" && d.raid_status !== "resolved"), [decisions]);
  const areaName = (id?: string | null) => interiorAreas.find((a) => a.id === id)?.name || "—";
  const fileName = (id: string) => files.find((f: any) => f.id === id)?.name || "—";

  if (!projectId) return <p className="text-muted-foreground">Select a project.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/interior" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <CheckSquare className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Interior Approvals — {currentProject?.name}</h1>
          <p className="text-muted-foreground text-sm">Drawing approval documents, due dates, decisions and open RAID items.</p>
        </div>
      </div>

      <Tabs defaultValue="drawing-approvals">
        <TabsList>
          <TabsTrigger value="drawing-approvals">Drawing Approvals ({drawingApprovals.length})</TabsTrigger>
          <TabsTrigger value="file-approvals">File Approvals ({approvals.length})</TabsTrigger>
          <TabsTrigger value="decisions">Decisions ({decisions.filter((d: any) => d.item_type === "decision").length})</TabsTrigger>
          <TabsTrigger value="raid">Open RAID ({openRaid.length})</TabsTrigger>
        </TabsList>

        {/* Drawing-based approvals with due dates */}
        <TabsContent value="drawing-approvals">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" />
                Drawing Approval Documents
              </CardTitle>
              <CardDescription>
                Approval documents linked to drawings, grouped by phase. Due dates correspond to the drawing delivery dates.
                View on the <Link to="/interior/drawings" className="text-primary underline">Drawings</Link> or <Link to="/interior/schedule" className="text-primary underline">Schedule</Link> pages.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {drawingApprovals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approval documents recorded in drawings yet.</p>
              ) : (
                <div className="space-y-6">
                  {Object.entries(approvalsByPhase).map(([phase, items]) => (
                    <div key={phase}>
                      <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <CalendarRange className="h-3.5 w-3.5 text-primary" />
                        {phase}
                        <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                      </h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Approval Document</TableHead>
                            <TableHead>Drawing</TableHead>
                            <TableHead className="min-w-[180px]">Room</TableHead>
                            <TableHead>Deck</TableHead>
                            <TableHead>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Due Date
                              </span>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-mono text-xs text-primary font-medium">{item.approval_doc}</TableCell>
                              <TableCell className="font-mono text-xs">{item.drawing_number}</TableCell>
                              <TableCell className="text-sm">{item.room_name}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{item.deck_name}</Badge></TableCell>
                              <TableCell>
                                {item.due_date ? (
                                  <Badge variant="secondary" className="text-xs">{item.due_date}</Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Existing file-based approvals */}
        <TabsContent value="file-approvals">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Approvals on interior files</CardTitle>
              <CardDescription>Read-only. Manage on the <Link to="/approvals" className="text-primary underline">Approvals</Link> page.</CardDescription>
            </CardHeader>
            <CardContent>
              {approvals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approvals on interior files yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead><TableHead>Status</TableHead><TableHead>Submitted</TableHead><TableHead>Comment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvals.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{fileName(a.file_id)}</TableCell>
                        <TableCell><Badge variant={a.status === "approved" ? "default" : a.status === "rejected" ? "destructive" : "secondary"}>{a.status}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{format(new Date(a.created_at), "d MMM yyyy")}</TableCell>
                        <TableCell className="text-sm">{a.comment || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="decisions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Decision timeline</CardTitle>
              <CardDescription>Decisions on interior areas. Manage on the <Link to="/decisions" className="text-primary underline">RAID Log</Link>.</CardDescription>
            </CardHeader>
            <CardContent>
              {decisions.filter((d: any) => d.item_type === "decision").length === 0 ? (
                <p className="text-sm text-muted-foreground">No decisions on interior areas yet.</p>
              ) : (
                <ul className="space-y-3">
                  {decisions.filter((d: any) => d.item_type === "decision").map((d: any) => (
                    <li key={d.id} className="border-l-2 border-primary/40 pl-3 py-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <GitBranch className="h-3.5 w-3.5 text-primary" />
                        <span className="font-medium text-sm">{d.title}</span>
                        <Badge variant="outline" className="text-xs">{d.status}</Badge>
                        <Badge variant="secondary" className="text-xs">{areaName(d.area_id)}</Badge>
                      </div>
                      {d.decision_text && <p className="text-sm text-muted-foreground mt-1">{d.decision_text}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {d.date ? format(new Date(d.date), "d MMM yyyy") : format(new Date(d.created_at), "d MMM yyyy")}
                        {d.assigned_owner && ` · ${d.assigned_owner}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="raid">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open risks, issues & actions</CardTitle>
              <CardDescription>Open items on interior areas. Manage on the <Link to="/decisions" className="text-primary underline">RAID Log</Link>.</CardDescription>
            </CardHeader>
            <CardContent>
              {openRaid.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open RAID items on interior areas.</p>
              ) : (
                <ul className="space-y-2">
                  {openRaid.map((d: any) => (
                    <li key={d.id} className="flex items-start gap-2 border-b pb-2 last:border-0">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{d.title}</span>
                          <Badge variant="outline" className="text-xs uppercase">{d.item_type}</Badge>
                          {d.raid_status && <Badge variant="secondary" className="text-xs">{d.raid_status}</Badge>}
                          <Badge variant="outline" className="text-xs">{areaName(d.area_id)}</Badge>
                        </div>
                        {d.background && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.background}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

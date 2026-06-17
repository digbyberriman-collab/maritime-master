import { useMemo, useState } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarRange, ArrowLeft, FileCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

interface PhaseItem {
  id: string;
  drawing_number: string;
  room_name: string;
  deck_name: string;
  delivery_date: string;
  design_level: string | null;
  deliverables_materials: string | null;
  approval_doc: string | null;
}

function parsePhaseItems(drawings: any[], phaseKey: string, approvalKey: string): PhaseItem[] {
  return drawings
    .filter((d) => d[phaseKey] && d[phaseKey].trim() !== "")
    .map((d) => ({
      id: d.id,
      drawing_number: d.drawing_number,
      room_name: d.room_name,
      deck_name: d.deck_name || "Unknown",
      delivery_date: d[phaseKey],
      design_level: d.design_level,
      deliverables_materials: d.deliverables_materials,
      approval_doc: d[approvalKey] || null,
    }))
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
}

export default function InteriorSchedule() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;
  const [activePhase, setActivePhase] = useState("1");

  const { data: interiorDrawings = [] } = useQuery({
    queryKey: ["interior-drawings", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("interior_drawings").select("*").eq("project_id", projectId!).order("deck_name").order("drawing_number");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: scheduleTasks = [] } = useQuery({
    queryKey: ["schedule-tasks-interior", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedule_tasks").select("*").eq("project_id", projectId!).order("start_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const interiorTasks = useMemo(() => {
    return scheduleTasks.filter((t: any) => /interior|cabin|salon|saloon|stateroom|owner|guest|crew\s*mess|galley|dining/i.test(t.task_name || ""));
  }, [scheduleTasks]);

  const phase1 = useMemo(() => parsePhaseItems(interiorDrawings as any[], "delivery_phase_1", "approval_doc_phase_1"), [interiorDrawings]);
  const phase2 = useMemo(() => parsePhaseItems(interiorDrawings as any[], "delivery_phase_2", "approval_doc_phase_2"), [interiorDrawings]);
  const phase3 = useMemo(() => parsePhaseItems(interiorDrawings as any[], "delivery_phase_3", "approval_doc_phase_3"), [interiorDrawings]);

  const phaseMap: Record<string, PhaseItem[]> = { "1": phase1, "2": phase2, "3": phase3 };
  const currentPhaseItems = phaseMap[activePhase] || [];

  const byDeck = useMemo(() => {
    const groups: Record<string, PhaseItem[]> = {};
    for (const item of currentPhaseItems) {
      if (!groups[item.deck_name]) groups[item.deck_name] = [];
      groups[item.deck_name].push(item);
    }
    return groups;
  }, [currentPhaseItems]);

  // Approval stats per phase
  const approvalStats = useMemo(() => {
    const total = currentPhaseItems.length;
    const withDoc = currentPhaseItems.filter(i => i.approval_doc).length;
    return { total, withDoc, without: total - withDoc };
  }, [currentPhaseItems]);

  if (!projectId) return <p className="text-muted-foreground">Select a project.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/interior" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <CalendarRange className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Interior Schedule — {currentProject?.name}</h1>
          <p className="text-muted-foreground text-sm">Drawing delivery phases, approval documents and interior-related timeline tasks.</p>
        </div>
      </div>

      {/* Phase delivery milestones */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drawing Delivery Phases</CardTitle>
          <CardDescription>Delivery dates and linked approval documents from the Studio Liaigre drawing list.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activePhase} onValueChange={setActivePhase}>
            <div className="flex items-center gap-4 flex-wrap">
              <TabsList>
                <TabsTrigger value="1">Phase 1 <Badge variant="secondary" className="ml-1.5 text-[10px]">{phase1.length}</Badge></TabsTrigger>
                <TabsTrigger value="2">Phase 2 <Badge variant="secondary" className="ml-1.5 text-[10px]">{phase2.length}</Badge></TabsTrigger>
                <TabsTrigger value="3">Phase 3 <Badge variant="secondary" className="ml-1.5 text-[10px]">{phase3.length}</Badge></TabsTrigger>
              </TabsList>
              {approvalStats.total > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileCheck className="h-3.5 w-3.5 text-green-500" />
                  {approvalStats.withDoc}/{approvalStats.total} have approval docs
                </div>
              )}
            </div>

            <TabsContent value={activePhase} className="mt-4">
              {currentPhaseItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No delivery dates recorded for Phase {activePhase}.</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(byDeck).map(([deck, items]) => (
                    <div key={deck}>
                      <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                        {deck}
                        <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                      </h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[160px]">Drawing Number</TableHead>
                            <TableHead className="min-w-[180px]">Room</TableHead>
                            <TableHead>Delivery Date</TableHead>
                            <TableHead>Approval Doc</TableHead>
                            <TableHead>Design Level</TableHead>
                            <TableHead>Materials</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-mono text-xs">{item.drawing_number}</TableCell>
                              <TableCell className="text-sm">{item.room_name}</TableCell>
                              <TableCell className="text-xs">{item.delivery_date}</TableCell>
                              <TableCell>
                                {item.approval_doc ? (
                                  <span className="font-mono text-[11px] text-primary">{item.approval_doc}</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{item.design_level || "—"}</Badge></TableCell>
                              <TableCell className="text-xs text-muted-foreground">{item.deliverables_materials || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Existing schedule tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline Tasks ({interiorTasks.length})</CardTitle>
          <CardDescription>Interior-related tasks from the project timeline. Edit on the <Link to="/timeline" className="text-primary underline">Timeline</Link> page.</CardDescription>
        </CardHeader>
        <CardContent>
          {interiorTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching tasks. Import a schedule on the Import page.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interiorTasks.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.task_name}</TableCell>
                    <TableCell>{t.start_date ? format(new Date(t.start_date), "d MMM yyyy") : "—"}</TableCell>
                    <TableCell>{t.end_date ? format(new Date(t.end_date), "d MMM yyyy") : "—"}</TableCell>
                    <TableCell>{t.percent_complete ?? 0}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

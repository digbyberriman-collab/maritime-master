import { useMemo, useState } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { supabase } from "@/modules/new-build/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, ArrowLeft, ArrowUpDown, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";

type SortField = "drawing_number" | "room_name" | "design_level" | "delivery_phase_1" | "delivery_phase_2" | "delivery_phase_3";

function ApprovalCell({ docRef, dueDate }: { docRef?: string | null; dueDate?: string | null }) {
  if (!docRef) return <span className="text-muted-foreground">—</span>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-[11px] text-primary cursor-help">{docRef}</span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">Approval doc: {docRef}</p>
          {dueDate && <p className="text-xs text-muted-foreground">Due: {dueDate}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function InteriorDrawings() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;

  const [deckFilter, setDeckFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("drawing_number");
  const [sortAsc, setSortAsc] = useState(true);

  const { data: interiorDrawings = [] } = useQuery({
    queryKey: ["interior-drawings", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_interior_drawings").select("*").eq("project_id", projectId!).order("deck_name").order("drawing_number");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const allDecks = useMemo(() => {
    const decks = new Set<string>();
    for (const d of interiorDrawings as any[]) {
      if (d.deck_name) decks.add(d.deck_name);
    }
    return Array.from(decks).sort();
  }, [interiorDrawings]);

  const filtered = useMemo(() => {
    let list = [...(interiorDrawings as any[])];
    if (deckFilter !== "all") list = list.filter((d) => d.deck_name === deckFilter);
    if (phaseFilter !== "all") {
      const phaseKey = `delivery_phase_${phaseFilter}` as string;
      list = list.filter((d) => d[phaseKey] && d[phaseKey].trim() !== "");
    }
    list.sort((a, b) => {
      const aVal = (a[sortField] || "") as string;
      const bVal = (b[sortField] || "") as string;
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [interiorDrawings, deckFilter, phaseFilter, sortField, sortAsc]);

  const drawingsByDeck = useMemo(() => {
    if (deckFilter !== "all") return { [deckFilter]: filtered };
    const groups: Record<string, any[]> = {};
    for (const d of filtered) {
      const deck = d.deck_name || "Unknown";
      if (!groups[deck]) groups[deck] = [];
      groups[deck].push(d);
    }
    return groups;
  }, [filtered, deckFilter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const SortableHead = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none hover:text-foreground ${className || ""}`} onClick={() => handleSort(field)}>
      <span className="flex items-center gap-1">
        {children}
        {sortField === field && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </TableHead>
  );

  // Compute approval summary stats
  const approvalStats = useMemo(() => {
    let total = 0, withApproval = 0;
    for (const d of filtered) {
      total++;
      if (d.approval_doc_phase_1 || d.approval_doc_phase_2 || d.approval_doc_phase_3 || d.approval_doc_phase_4_5) withApproval++;
    }
    return { total, withApproval, without: total - withApproval };
  }, [filtered]);

  if (!projectId) return <p className="text-muted-foreground">Select a project.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/interior" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <FileText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Interior Drawings — {currentProject?.name}</h1>
          <p className="text-muted-foreground text-sm">Studio Liaigre drawing list with delivery dates, approval documents and revision tracking.</p>
        </div>
      </div>

      {/* Filters + stats */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={deckFilter} onValueChange={setDeckFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter by deck" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Decks</SelectItem>
            {allDecks.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={phaseFilter} onValueChange={setPhaseFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter by phase" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Phases</SelectItem>
            <SelectItem value="1">Phase 1</SelectItem>
            <SelectItem value="2">Phase 2</SelectItem>
            <SelectItem value="3">Phase 3</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs text-muted-foreground">{filtered.length} drawing{filtered.length !== 1 ? "s" : ""}</Badge>
        <div className="flex items-center gap-1.5 ml-auto">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          <span className="text-xs text-muted-foreground">{approvalStats.withApproval} with approval docs</span>
          {approvalStats.without > 0 && (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 ml-2" />
              <span className="text-xs text-muted-foreground">{approvalStats.without} without</span>
            </>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No drawings match the current filters.</CardContent></Card>
      ) : (
        Object.entries(drawingsByDeck).map(([deck, drawings]) => (
          <Card key={deck}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {deck}
                <Badge variant="secondary" className="ml-auto">{drawings.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead field="drawing_number" className="min-w-[180px]">Drawing Number</SortableHead>
                      <SortableHead field="room_name" className="min-w-[200px]">Room</SortableHead>
                      <SortableHead field="design_level" className="min-w-[120px]">Design Level</SortableHead>
                      <SortableHead field="delivery_phase_1">Delivery P1</SortableHead>
                      <SortableHead field="delivery_phase_2">Delivery P2</SortableHead>
                      <SortableHead field="delivery_phase_3">Delivery P3</SortableHead>
                      <TableHead>Approval P1</TableHead>
                      <TableHead>Approval P2</TableHead>
                      <TableHead>Approval P3</TableHead>
                      <TableHead>Approval P4/5</TableHead>
                      <TableHead>Materials</TableHead>
                      <TableHead className="min-w-[200px]">Latest Rev</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drawings.map((d: any) => {
                      const latestRev = d.rev_h || d.rev_g || d.rev_f || d.rev_e || d.rev_d || d.rev_c || d.rev_b || d.rev_a;
                      const latestRevLetter = d.rev_h ? "H" : d.rev_g ? "G" : d.rev_f ? "F" : d.rev_e ? "E" : d.rev_d ? "D" : d.rev_c ? "C" : d.rev_b ? "B" : d.rev_a ? "A" : null;
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="font-mono text-xs">{d.drawing_number}</TableCell>
                          <TableCell className="text-sm">{d.room_name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs whitespace-nowrap">{d.design_level || "—"}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.delivery_phase_1 || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.delivery_phase_2 || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.delivery_phase_3 || "—"}</TableCell>
                          <TableCell><ApprovalCell docRef={d.approval_doc_phase_1} dueDate={d.delivery_phase_1} /></TableCell>
                          <TableCell><ApprovalCell docRef={d.approval_doc_phase_2} dueDate={d.delivery_phase_2} /></TableCell>
                          <TableCell><ApprovalCell docRef={d.approval_doc_phase_3} dueDate={d.delivery_phase_3} /></TableCell>
                          <TableCell><ApprovalCell docRef={d.approval_doc_phase_4_5} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.deliverables_materials || "—"}</TableCell>
                          <TableCell className="text-xs">
                            {latestRev ? (
                              <span><Badge variant="secondary" className="mr-1.5 text-[10px]">Rev {latestRevLetter}</Badge>{latestRev}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

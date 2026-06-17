import { useEffect, useMemo, useState } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { PROGRESS_OPTIONS, progressMeta, yearColor, fmtWeek, YEAR_COLORS } from "@/lib/piping-utils";
import {
  Download, Upload, Plus, Trash2, FileSpreadsheet, FileText, Settings as SettingsIcon,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";

type Block = {
  id: string;
  zone: string;
  block_code: string;
  sections: string | null;
  friday_week: number | null;
  friday_year: number | null;
  monday_week: number | null;
  monday_year: number | null;
  display_order: number;
};

type Milestone = {
  id: string;
  code: string | null;
  name: string;
  short_label: string | null;
  milestone_type: string;
  display_order: number;
  tracks_percent: boolean;
  has_date_markers: boolean;
};

type Progress = {
  id: string;
  block_id: string;
  milestone_id: string;
  planned_week: number | null;
  planned_year: number | null;
  progress_pct: number;
  achieved_week: number | null;
  achieved_year: number | null;
  notes: string | null;
};

const TYPE_COLORS: Record<string, string> = {
  review: "bg-purple-100 text-purple-800 border-purple-200",
  send: "bg-blue-100 text-blue-800 border-blue-200",
  phase: "bg-amber-100 text-amber-800 border-amber-200",
  general: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function Piping() {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);

  const projectId = currentProject?.id;

  async function load() {
    if (!projectId) return;
    setLoading(true);
    const [b, m] = await Promise.all([
      supabase.from("nb_piping_blocks").select("*").eq("project_id", projectId).order("display_order"),
      supabase.from("nb_piping_milestones").select("*").eq("project_id", projectId).order("display_order"),
    ]);
    const blockIds = (b.data ?? []).map((x: any) => x.id);
    const p = blockIds.length
      ? await supabase.from("nb_piping_progress").select("*").in("block_id", blockIds)
      : { data: [] as any[] };
    setBlocks((b.data ?? []) as Block[]);
    setMilestones((m.data ?? []) as Milestone[]);
    setProgress((p.data ?? []) as Progress[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const progressMap = useMemo(() => {
    const map = new Map<string, Progress>();
    progress.forEach((p) => map.set(`${p.block_id}:${p.milestone_id}`, p));
    return map;
  }, [progress]);

  async function upsertCell(block_id: string, milestone_id: string, patch: Partial<Progress>): Promise<void> {
    const existing = progressMap.get(`${block_id}:${milestone_id}`);
    if (existing) {
      const { data, error } = await supabase
        .from("nb_piping_progress").update(patch).eq("id", existing.id).select().single();
      if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
      setProgress((prev) => prev.map((p) => (p.id === data.id ? (data as Progress) : p)));
    } else {
      const { data, error } = await supabase
        .from("nb_piping_progress").insert({ block_id, milestone_id, progress_pct: 0, ...patch }).select().single();
      if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
      setProgress((prev) => [...prev, data as Progress]);
    }
  }

  if (!currentProject) {
    return <div className="p-6 text-muted-foreground">Select a project to view piping routing.</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Piping
          </h1>
          <p className="text-sm text-muted-foreground">
            Plan and track routing status per block / zone.
          </p>
        </div>
        <YearLegend />
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-5">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="blocks">Blocks</TabsTrigger>
          <TabsTrigger value="gantt">Gantt</TabsTrigger>
          <TabsTrigger value="io">Import / Export</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <Dashboard blocks={blocks} milestones={milestones} progress={progress} />
        </TabsContent>

        <TabsContent value="blocks">
          <BlocksMatrix
            blocks={blocks}
            milestones={milestones}
            progressMap={progressMap}
            onCellChange={upsertCell}
            onReload={load}
            projectId={projectId!}
          />
        </TabsContent>

        <TabsContent value="gantt">
          <GanttView blocks={blocks} milestones={milestones} progressMap={progressMap} />
        </TabsContent>

        <TabsContent value="io">
          <ImportExport
            blocks={blocks}
            milestones={milestones}
            progressMap={progressMap}
            projectId={projectId!}
            onReload={load}
          />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab milestones={milestones} projectId={projectId!} onReload={load} />
        </TabsContent>
      </Tabs>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
    </div>
  );
}

/* -------- Year color legend -------- */
function YearLegend() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Year:</span>
      {Object.entries(YEAR_COLORS).slice(1, 5).map(([y, c]) => (
        <div
          key={y}
          className="px-2 py-0.5 rounded text-xs font-medium border"
          style={{ background: c.bg, color: c.fg, borderColor: c.ring }}
        >
          {y}
        </div>
      ))}
    </div>
  );
}

/* -------- Dashboard -------- */
function Dashboard({ blocks, milestones, progress }: {
  blocks: Block[]; milestones: Milestone[]; progress: Progress[];
}) {
  const stats = useMemo(() => {
    const totalCells = blocks.length * milestones.length;
    const completed = progress.filter((p) => p.progress_pct === 100).length;
    const inProgress = progress.filter((p) => p.progress_pct > 0 && p.progress_pct < 100).length;
    const blocked = progress.filter((p) => p.progress_pct === 75).length;
    return { totalCells, completed, inProgress, blocked };
  }, [blocks, milestones, progress]);

  const byMilestone = useMemo(() => {
    return milestones.map((m) => {
      const cells = progress.filter((p) => p.milestone_id === m.id);
      const avg = cells.length ? Math.round(cells.reduce((s, c) => s + c.progress_pct, 0) / blocks.length) : 0;
      return { name: m.short_label || m.name.slice(0, 24), avg };
    });
  }, [milestones, progress, blocks]);

  const distribution = useMemo(() => {
    const counts = new Map<number, number>();
    PROGRESS_OPTIONS.forEach((o) => counts.set(o.value, 0));
    progress.forEach((p) => counts.set(p.progress_pct, (counts.get(p.progress_pct) ?? 0) + 1));
    return PROGRESS_OPTIONS.map((o) => ({
      name: `${o.value}%`,
      value: counts.get(o.value) ?? 0,
      fill: o.color,
    }));
  }, [progress]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Blocks" value={blocks.length} />
        <StatCard label="Milestones" value={milestones.length} />
        <StatCard label="Completed cells" value={stats.completed} />
        <StatCard label="In progress" value={stats.inProgress} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Average progress per milestone</CardTitle></CardHeader>
          <CardContent style={{ height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={byMilestone} margin={{ left: 0, right: 12, top: 8, bottom: 60 }}>
                <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} fontSize={10} height={70} />
                <YAxis domain={[0, 100]} fontSize={11} />
                <Tooltip />
                <Bar dataKey="avg" fill="hsl(215 80% 48%)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Status distribution</CardTitle></CardHeader>
          <CardContent style={{ height: 300 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={distribution} dataKey="value" nameKey="name" outerRadius={80} label>
                  {distribution.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-3xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

/* -------- Blocks matrix (the main grid) -------- */
function BlocksMatrix({
  blocks, milestones, progressMap, onCellChange, onReload, projectId,
}: {
  blocks: Block[];
  milestones: Milestone[];
  progressMap: Map<string, Progress>;
  onCellChange: (b: string, m: string, p: Partial<Progress>) => Promise<void>;
  onReload: () => void;
  projectId: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Block × milestone matrix</CardTitle>
        <AddBlockDialog projectId={projectId} onCreated={onReload} nextOrder={blocks.length + 1} />
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-[70vh] border-t">
          <table className="text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-background">
              <tr>
                <th className="sticky left-0 z-30 bg-background border-b border-r px-2 py-2 text-left min-w-[60px]">Zone</th>
                <th className="sticky left-[60px] z-30 bg-background border-b border-r px-2 py-2 text-left min-w-[80px]">Block</th>
                <th className="border-b border-r px-2 py-2 text-left min-w-[80px]">Sections</th>
                {milestones.map((m) => (
                  <th key={m.id} className="border-b border-r px-2 py-2 align-bottom text-left min-w-[120px]">
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className={`w-fit text-[10px] ${TYPE_COLORS[m.milestone_type] ?? ""}`}>
                        {m.milestone_type}
                      </Badge>
                      <div
                        className="font-medium leading-tight"
                        style={{ writingMode: "horizontal-tb", maxWidth: 140 }}
                        title={m.name}
                      >
                        {m.short_label || m.name}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.id} className="hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-background border-b border-r px-2 py-1 font-semibold">{b.zone}</td>
                  <td className="sticky left-[60px] z-10 bg-background border-b border-r px-2 py-1 font-semibold">{b.block_code}</td>
                  <td className="border-b border-r px-2 py-1 text-muted-foreground">{b.sections ?? "—"}</td>
                  {milestones.map((m) => {
                    const cell = progressMap.get(`${b.id}:${m.id}`);
                    return (
                      <td key={m.id} className="border-b border-r p-1 align-top">
                        <CellEditor
                          cell={cell}
                          onChange={(patch) => onCellChange(b.id, m.id, patch)}
                          tracksPercent={m.tracks_percent}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {blocks.length === 0 && (
                <tr><td colSpan={3 + milestones.length} className="text-center text-muted-foreground py-8">
                  No blocks yet — click “Add block”.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function CellEditor({
  cell, onChange, tracksPercent,
}: {
  cell?: Progress;
  onChange: (p: Partial<Progress>) => void;
  tracksPercent: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(cell?.planned_week?.toString() ?? "");
  const [py, setPy] = useState(cell?.planned_year?.toString() ?? "2026");
  const [aw, setAw] = useState(cell?.achieved_week?.toString() ?? "");
  const [ay, setAy] = useState(cell?.achieved_year?.toString() ?? "");
  const [pct, setPct] = useState(cell?.progress_pct ?? 0);

  useEffect(() => {
    if (open) {
      setPw(cell?.planned_week?.toString() ?? "");
      setPy(cell?.planned_year?.toString() ?? "2026");
      setAw(cell?.achieved_week?.toString() ?? "");
      setAy(cell?.achieved_year?.toString() ?? "");
      setPct(cell?.progress_pct ?? 0);
    }
  }, [open, cell]);

  const meta = progressMeta(cell?.progress_pct ?? 0);
  const planned = yearColor(cell?.planned_year);
  const achieved = yearColor(cell?.achieved_year);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="w-full text-left rounded border hover:ring-2 hover:ring-primary/50 transition p-1.5 space-y-1"
          style={{ background: meta.color, color: meta.text, borderColor: meta.text + "33" }}
        >
          <div className="flex items-center justify-between gap-1">
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold border"
              style={{ background: planned.bg, color: planned.fg, borderColor: planned.ring }}
              title="Planned week"
            >
              {fmtWeek(cell?.planned_week, cell?.planned_year)}
            </span>
            {tracksPercent && (
              <span className="text-[10px] font-bold tabular-nums">{cell?.progress_pct ?? 0}%</span>
            )}
          </div>
          {cell?.achieved_week != null && (
            <div
              className="text-[10px] px-1.5 py-0.5 rounded border w-fit"
              style={{ background: achieved.bg, color: achieved.fg, borderColor: achieved.ring }}
            >
              ✓ {fmtWeek(cell.achieved_week, cell.achieved_year)}
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Planned week</Label>
            <Input type="number" min={1} max={53} value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Planned year</Label>
            <Input type="number" value={py} onChange={(e) => setPy(e.target.value)} />
          </div>
        </div>
        {tracksPercent && (
          <div>
            <Label className="text-xs">Progress</Label>
            <Select value={String(pct)} onValueChange={(v) => setPct(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROGRESS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Achieved week</Label>
            <Input type="number" min={1} max={53} value={aw} onChange={(e) => setAw(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Achieved year</Label>
            <Input type="number" value={ay} onChange={(e) => setAy(e.target.value)} />
          </div>
        </div>
        <Button
          className="w-full"
          onClick={() => {
            onChange({
              planned_week: pw ? Number(pw) : null,
              planned_year: py ? Number(py) : null,
              progress_pct: pct,
              achieved_week: aw ? Number(aw) : null,
              achieved_year: ay ? Number(ay) : null,
            });
            setOpen(false);
          }}
        >Save</Button>
      </PopoverContent>
    </Popover>
  );
}

function AddBlockDialog({ projectId, onCreated, nextOrder }: {
  projectId: string; onCreated: () => void; nextOrder: number;
}) {
  const [open, setOpen] = useState(false);
  const [zone, setZone] = useState("");
  const [code, setCode] = useState("");
  const [sections, setSections] = useState("");
  const { toast } = useToast();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add block</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New block</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Zone</Label><Input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="B0" /></div>
          <div><Label>Block code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="B01" /></div>
          <div><Label>Sections</Label><Input value={sections} onChange={(e) => setSections(e.target.value)} placeholder="xxx/xxx" /></div>
        </div>
        <DialogFooter>
          <Button onClick={async () => {
            if (!zone || !code) return toast({ title: "Zone and block required", variant: "destructive" });
            const { error } = await supabase.from("nb_piping_blocks").insert({
              project_id: projectId, zone, block_code: code, sections: sections || null, display_order: nextOrder,
            });
            if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
            setOpen(false); setZone(""); setCode(""); setSections("");
            onCreated();
          }}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------- Gantt view (week-based) -------- */
function GanttView({ blocks, milestones, progressMap }: {
  blocks: Block[]; milestones: Milestone[]; progressMap: Map<string, Progress>;
}) {
  // Build all (year, week) tuples present, sorted
  const periods = useMemo(() => {
    const set = new Set<string>();
    progressMap.forEach((p) => {
      if (p.planned_week && p.planned_year) set.add(`${p.planned_year}-${p.planned_week}`);
    });
    return Array.from(set)
      .map((s) => { const [y, w] = s.split("-").map(Number); return { y, w }; })
      .sort((a, b) => a.y - b.y || a.w - b.w);
  }, [progressMap]);

  if (periods.length === 0) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">No planned weeks yet.</CardContent></Card>;
  }

  const colW = 36;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Gantt — by planned week</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-[70vh] border-t">
          <table className="text-xs">
            <thead className="sticky top-0 bg-background z-10">
              <tr>
                <th className="sticky left-0 bg-background border-r px-2 py-1 text-left min-w-[140px]">Block</th>
                {periods.map((p) => {
                  const c = yearColor(p.y);
                  return (
                    <th key={`${p.y}-${p.w}`} className="border-r px-1 py-1" style={{ background: c.bg, color: c.fg, minWidth: colW }}>
                      <div className="text-[10px]">'{String(p.y).slice(-2)}</div>
                      <div className="font-bold">{String(p.w).padStart(2, "0")}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="sticky left-0 bg-background border-r px-2 py-1 font-semibold">{b.zone} / {b.block_code}</td>
                  {periods.map((p) => {
                    const hits = milestones.filter((m) => {
                      const cell = progressMap.get(`${b.id}:${m.id}`);
                      return cell?.planned_week === p.w && cell?.planned_year === p.y;
                    });
                    return (
                      <td key={`${p.y}-${p.w}`} className="border-r p-0.5 align-top" style={{ minWidth: colW }}>
                        <div className="flex flex-col gap-0.5">
                          {hits.map((m) => {
                            const cell = progressMap.get(`${b.id}:${m.id}`)!;
                            const meta = progressMeta(cell.progress_pct);
                            return (
                              <div
                                key={m.id}
                                title={`${m.code ? m.code + " · " : ""}${m.name} — ${cell.progress_pct}%`}
                                className="h-4 rounded text-[9px] px-1 truncate border font-semibold"
                                style={{ background: meta.color, color: meta.text, borderColor: meta.text + "33" }}
                              >
                                {m.code || (m.short_label || m.name).slice(0, 4)}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------- Import / Export -------- */
function ImportExport({ blocks, milestones, progressMap, projectId, onReload }: {
  blocks: Block[]; milestones: Milestone[]; progressMap: Map<string, Progress>;
  projectId: string; onReload: () => void;
}) {
  const { toast } = useToast();

  function exportXlsx() {
    const header = ["Zone", "Block", "Sections", ...milestones.flatMap((m) => [
      `${m.short_label || m.name} — Planned WK`,
      `${m.short_label || m.name} — Year`,
      `${m.short_label || m.name} — Progress %`,
      `${m.short_label || m.name} — Achieved WK`,
      `${m.short_label || m.name} — Achieved Year`,
    ])];
    const rows = blocks.map((b) => [
      b.zone, b.block_code, b.sections ?? "",
      ...milestones.flatMap((m) => {
        const c = progressMap.get(`${b.id}:${m.id}`);
        return [c?.planned_week ?? "", c?.planned_year ?? "", c?.progress_pct ?? 0, c?.achieved_week ?? "", c?.achieved_year ?? ""];
      }),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Piping");
    XLSX.writeFile(wb, `piping-status-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
    doc.setFontSize(14);
    doc.text("Piping — Routing Status", 40, 32);
    doc.setFontSize(9);
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 40, 48);

    const head = [["Zone", "Block", ...milestones.map((m) => m.short_label || m.name)]];
    const body = blocks.map((b) => [
      b.zone, b.block_code,
      ...milestones.map((m) => {
        const c = progressMap.get(`${b.id}:${m.id}`);
        if (!c) return "";
        const wk = c.planned_week ? `W${c.planned_week} '${String(c.planned_year ?? "").slice(-2)}` : "";
        return `${wk}\n${c.progress_pct}%`;
      }),
    ]);
    autoTable(doc, {
      head, body, startY: 60,
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [37, 99, 235], fontSize: 7 },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index >= 2) {
          const b = blocks[data.row.index];
          const m = milestones[data.column.index - 2];
          const c = progressMap.get(`${b.id}:${m.id}`);
          if (c) {
            const meta = progressMeta(c.progress_pct);
            // crude HSL→RGB: just use a fixed mapping per status
            const rgb: Record<number, [number, number, number]> = {
              0: [235, 235, 235], 25: [253, 230, 138], 50: [191, 219, 254],
              75: [221, 204, 255], 90: [253, 186, 116], 100: [187, 247, 208],
            };
            data.cell.styles.fillColor = rgb[c.progress_pct] ?? [255, 255, 255];
          }
        }
      },
    });
    doc.save(`piping-status-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function importXlsx(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (rows.length < 2) return toast({ title: "Empty file", variant: "destructive" });

    let updated = 0, created = 0;
    // Expect same shape as export
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const [zone, code, sections, ...rest] = row.map((v) => (v == null ? "" : String(v)));
      if (!zone || !code) continue;

      let block = blocks.find((b) => b.zone === zone && b.block_code === code);
      if (!block) {
        const { data } = await supabase.from("nb_piping_blocks").insert({
          project_id: projectId, zone, block_code: code, sections, display_order: blocks.length + 1 + created,
        }).select().single();
        if (data) { block = data as Block; created++; }
      }
      if (!block) continue;

      for (let i = 0; i < milestones.length; i++) {
        const base = i * 5;
        const pw = rest[base]; const py = rest[base + 1]; const pct = rest[base + 2];
        const aw = rest[base + 3]; const ay = rest[base + 4];
        const milestone = milestones[i];
        if (!milestone) continue;
        await supabase.from("nb_piping_progress").upsert({
          block_id: block.id, milestone_id: milestone.id,
          planned_week: pw ? Number(pw) : null,
          planned_year: py ? Number(py) : null,
          progress_pct: pct ? Number(pct) : 0,
          achieved_week: aw ? Number(aw) : null,
          achieved_year: ay ? Number(ay) : null,
        }, { onConflict: "block_id,milestone_id" });
        updated++;
      }
    }
    toast({ title: "Import complete", description: `${created} new blocks, ${updated} cells updated.` });
    onReload();
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" />Export</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Button onClick={exportXlsx} className="w-full" variant="outline">
            <FileSpreadsheet className="h-4 w-4 mr-2" />Export to Excel (.xlsx)
          </Button>
          <Button onClick={exportPdf} className="w-full" variant="outline">
            <FileText className="h-4 w-4 mr-2" />Export to PDF
          </Button>
          <p className="text-xs text-muted-foreground">PDF is colour-coded by status. Excel preserves all values for re-import.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" />Import</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input type="file" accept=".xlsx,.xls" onChange={(e) => {
            const f = e.target.files?.[0]; if (f) importXlsx(f);
          }} />
          <p className="text-xs text-muted-foreground">
            Use the same column layout as the export. Matches existing blocks by Zone + Block code; creates new ones if missing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------- Settings -------- */
function SettingsTab({ milestones, projectId, onReload }: {
  milestones: Milestone[]; projectId: string; onReload: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState("general");

  function nextCode(): string {
    const nums = milestones
      .map((m) => /^M(\d+)$/i.exec(m.code || ""))
      .filter(Boolean)
      .map((x) => parseInt(x![1], 10));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return "M" + String(next).padStart(2, "0");
  }

  async function add() {
    if (!name) return;
    const finalCode = (code || nextCode()).trim();
    if (milestones.some((m) => (m.code || "").toLowerCase() === finalCode.toLowerCase())) {
      return toast({ title: "Code already in use", description: `${finalCode} is taken.`, variant: "destructive" });
    }
    const { error } = await supabase.from("nb_piping_milestones").insert({
      project_id: projectId, name, code: finalCode, milestone_type: type,
      display_order: milestones.length + 1, tracks_percent: true,
    });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    setName(""); setCode(""); onReload();
  }

  async function updateCode(id: string, newCode: string) {
    const trimmed = newCode.trim();
    if (!trimmed) return;
    if (milestones.some((m) => m.id !== id && (m.code || "").toLowerCase() === trimmed.toLowerCase())) {
      return toast({ title: "Code already in use", description: `${trimmed} is taken.`, variant: "destructive" });
    }
    const { error } = await supabase.from("nb_piping_milestones").update({ code: trimmed }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    onReload();
  }

  async function remove(id: string) {
    if (!confirm("Delete this milestone? All progress cells under it will also be removed.")) return;
    const { error } = await supabase.from("nb_piping_milestones").delete().eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    onReload();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><SettingsIcon className="h-4 w-4" />Milestones</CardTitle>
        <p className="text-xs text-muted-foreground">
          Each milestone has a unique short <strong>code</strong> (e.g. M01) used as the label in the Gantt view for quick identification.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder={`Code (e.g. ${nextCode()})`} value={code} onChange={(e) => setCode(e.target.value)} className="w-28" />
          <Input placeholder="New milestone name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="review">Review</SelectItem>
              <SelectItem value="send">Send</SelectItem>
              <SelectItem value="phase">Phase</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>

        <div className="border rounded divide-y">
          {milestones.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-muted-foreground tabular-nums w-6">{m.display_order}.</span>
                <Input
                  defaultValue={m.code || ""}
                  onBlur={(e) => { if (e.target.value !== (m.code || "")) updateCode(m.id, e.target.value); }}
                  className="h-7 w-20 font-mono text-xs"
                />
                <Badge variant="outline" className={`text-[10px] ${TYPE_COLORS[m.milestone_type] ?? ""}`}>{m.milestone_type}</Badge>
                <span className="truncate">{m.name}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(m.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

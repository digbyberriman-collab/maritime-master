import { useState, useMemo, useCallback } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { supabase } from "@/modules/new-build/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import {
  CalendarDays, List, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronR,
  GanttChart as GanttIcon, Upload, CheckCircle2, Circle, Link2, Clock, AlertTriangle,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, isSameMonth, addMonths, subMonths, parseISO,
  getISOWeek, getISOWeekYear, addWeeks, differenceInDays,
} from "date-fns";
import { appendix11Data, parseWeekDate } from "@/modules/new-build/data/appendix11-data";
import { GanttChart } from "@/modules/new-build/components/schedule/GanttChart";

type ViewMode = "calendar" | "list";

const statusColors: Record<string, string> = {
  idea: "bg-muted text-muted-foreground",
  active: "bg-primary/15 text-primary",
  final: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  changed: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

export default function Timeline() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const projectId = currentProject?.id;

  // ─── Tab state ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("schedule");

  // ─── Decisions Calendar state ─────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState("all");

  // ─── Build Schedule state ─────────────────────────────────────────────
  const [chapterFilter, setChapterFilter] = useState("all");
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState("all");
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});
  const [linkDialog, setLinkDialog] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // ─── Queries ──────────────────────────────────────────────────────────
  const { data: decisions = [], isLoading: loadingDecisions } = useQuery({
    queryKey: ["decisions", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("nb_decisions")
        .select("*, areas(name)")
        .eq("project_id", projectId)
        .not("date", "is", null)
        .order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: scheduleItems = [], isLoading: loadingSchedule } = useQuery({
    queryKey: ["deliverable_schedule_items", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("nb_deliverable_schedule_items")
        .select("*")
        .eq("project_id", projectId)
        .order("chapter_number")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: requirements = [] } = useQuery({
    queryKey: ["requirements", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("nb_requirements")
        .select("id, title")
        .eq("project_id", projectId)
        .order("title");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  // ─── Import mutation ──────────────────────────────────────────────────
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || !user) throw new Error("Missing context");
      const rows = appendix11Data.map((item, i) => ({
        project_id: projectId,
        chapter_number: item.chapter_number,
        chapter_name: item.chapter_name,
        description: item.description,
        builder_info_date: item.builder_info_date,
        owner_decision_date: item.owner_decision_date,
        delivery_by_owner: item.delivery_by_owner,
        resolved: item.owner_decision_date === "Done" || item.builder_info_date === "Done",
        sort_order: item.sort_order,
        created_by: user.id,
      }));
      // Insert in batches of 50
      for (let i = 0; i < rows.length; i += 50) {
        const { error } = await supabase
          .from("nb_deliverable_schedule_items")
          .insert(rows.slice(i, i + 50));
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["deliverable_schedule_items"] });
      toast({ title: `Imported ${count} deliverable items from Appendix 11` });
    },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  // ─── Link to requirement mutation ─────────────────────────────────────
  const linkMutation = useMutation({
    mutationFn: async ({ itemId, reqId }: { itemId: string; reqId: string | null }) => {
      const { error } = await supabase
        .from("nb_deliverable_schedule_items")
        .update({ requirement_id: reqId })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deliverable_schedule_items"] });
      toast({ title: "Requirement linked" });
      setLinkDialog(null);
    },
  });

  const toggleResolved = useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const { error } = await supabase
        .from("nb_deliverable_schedule_items")
        .update({ resolved })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliverable_schedule_items"] }),
  });

  // ─── Decisions calendar logic ─────────────────────────────────────────
  const filteredDecisions = useMemo(() => {
    let items = decisions;
    if (statusFilter !== "all") items = items.filter((d: any) => d.status === statusFilter);
    return items;
  }, [decisions, statusFilter]);

  const datesWithDecisions = useMemo(() => {
    const map = new Map<string, typeof decisions>();
    filteredDecisions.forEach((d: any) => {
      if (d.date) {
        if (!map.has(d.date)) map.set(d.date, []);
        map.get(d.date)!.push(d);
      }
    });
    return map;
  }, [filteredDecisions]);

  const selectedDecisions = useMemo(() => {
    if (viewMode === "calendar" && selectedDate) {
      return datesWithDecisions.get(format(selectedDate, "yyyy-MM-dd")) || [];
    }
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return filteredDecisions.filter((d: any) => {
      if (!d.date) return false;
      const date = parseISO(d.date);
      return date >= start && date <= end;
    });
  }, [viewMode, selectedDate, currentMonth, filteredDecisions, datesWithDecisions]);

  const daysWithItems = useMemo(
    () => Array.from(datesWithDecisions.keys()).map((d) => parseISO(d)),
    [datesWithDecisions],
  );

  // ─── Build Schedule logic ─────────────────────────────────────────────
  const chapters = useMemo(() => {
    const map: Record<number, { name: string; items: typeof scheduleItems }> = {};
    scheduleItems.forEach((it: any) => {
      if (!map[it.chapter_number]) map[it.chapter_number] = { name: it.chapter_name, items: [] };
      map[it.chapter_number].items.push(it);
    });
    return map;
  }, [scheduleItems]);

  const filteredChapters = useMemo(() => {
    let entries = Object.entries(chapters);
    if (chapterFilter !== "all") entries = entries.filter(([ch]) => ch === chapterFilter);
    if (scheduleStatusFilter !== "all") {
      entries = entries.map(([ch, data]) => [ch, {
        ...data,
        items: data.items.filter((it: any) =>
          scheduleStatusFilter === "done" ? it.resolved : !it.resolved,
        ),
      }]).filter(([, data]: any) => data.items.length > 0) as any;
    }
    return entries as [string, { name: string; items: any[] }][];
  }, [chapters, chapterFilter, scheduleStatusFilter]);

  const scheduleStats = useMemo(() => {
    const total = scheduleItems.length;
    const done = scheduleItems.filter((i: any) => i.resolved).length;
    const linked = scheduleItems.filter((i: any) => i.requirement_id).length;
    return { total, done, linked };
  }, [scheduleItems]);

  // ─── Gantt data ───────────────────────────────────────────────────────
  const ganttItems = useMemo(() => {
    return scheduleItems
      .map((it: any) => ({
        id: it.id,
        description: it.description,
        chapter_name: it.chapter_name,
        chapter_number: it.chapter_number,
        builder_date: parseWeekDate(it.builder_info_date),
        owner_date: parseWeekDate(it.owner_decision_date),
        resolved: it.resolved,
        requirement_title: requirements.find((r: any) => r.id === it.requirement_id)?.title || null,
      }))
      .filter((it) => it.builder_date || it.owner_date);
  }, [scheduleItems, requirements]);

  const toggleChapter = (ch: string) =>
    setOpenChapters((prev) => ({ ...prev, [ch]: prev[ch] === false ? true : prev[ch] === undefined ? false : !prev[ch] }));

  const getDateStatus = (dateStr: string | null) => {
    if (!dateStr) return null;
    if (dateStr === "Done") return "done";
    if (dateStr === "TBD") return "tbd";
    if (dateStr.startsWith("CS")) return "done";
    if (dateStr.startsWith("Defined")) return "reference";
    const d = parseWeekDate(dateStr);
    if (d && d < new Date()) return "overdue";
    return "upcoming";
  };

  const dateBadge = (dateStr: string | null) => {
    const status = getDateStatus(dateStr);
    if (!dateStr) return <span className="text-muted-foreground text-xs">—</span>;
    const cls =
      status === "done" ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" :
      status === "overdue" ? "bg-destructive/15 text-destructive" :
      status === "tbd" ? "bg-muted text-muted-foreground" :
      status === "reference" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" :
      "bg-accent text-accent-foreground";
    return <Badge className={`text-[11px] font-normal ${cls}`}>{dateStr}</Badge>;
  };

  // ─── Summary banner data ───────────────────────────────────────────
  const [summaryOpen, setSummaryOpen] = useState(true);
  const today = useMemo(() => new Date(), []);
  const currentWeekNum = getISOWeek(today);
  const currentWeekYear = getISOWeekYear(today);
  const fourWeeksOut = addWeeks(today, 4);

  const upcomingDeadlines = useMemo(() => {
    return scheduleItems
      .filter((it: any) => !it.resolved)
      .map((it: any) => {
        const bd = parseWeekDate(it.builder_info_date);
        const od = parseWeekDate(it.owner_decision_date);
        // Use the earliest upcoming date
        const dates = [bd, od].filter((d): d is Date => d !== null && d >= today && d <= fourWeeksOut);
        if (dates.length === 0) return null;
        const earliest = dates.sort((a, b) => a.getTime() - b.getTime())[0];
        return {
          id: it.id,
          description: it.description,
          chapter_name: it.chapter_name,
          chapter_number: it.chapter_number,
          date: earliest,
          daysUntil: differenceInDays(earliest, today),
          dateLabel: it.owner_decision_date && parseWeekDate(it.owner_decision_date) && parseWeekDate(it.owner_decision_date)! >= today && parseWeekDate(it.owner_decision_date)! <= fourWeeksOut
            ? it.owner_decision_date
            : it.builder_info_date,
          isOwnerDecision: it.owner_decision_date && parseWeekDate(it.owner_decision_date) && parseWeekDate(it.owner_decision_date)! >= today && parseWeekDate(it.owner_decision_date)! <= fourWeeksOut,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.date.getTime() - b.date.getTime()) as Array<{
        id: string; description: string; chapter_name: string; chapter_number: number;
        date: Date; daysUntil: number; dateLabel: string; isOwnerDecision: boolean;
      }>;
  }, [scheduleItems, today, fourWeeksOut]);

  const overdueItems = useMemo(() => {
    return scheduleItems
      .filter((it: any) => !it.resolved)
      .filter((it: any) => {
        const od = parseWeekDate(it.owner_decision_date);
        return od && od < today;
      })
      .length;
  }, [scheduleItems, today]);

  if (!projectId) return <div className="p-8 text-muted-foreground">Select a project first.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Schedule — {currentProject?.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Build schedule, decisions calendar, and Gantt chart</p>
        </div>
      </div>

      {/* ═══════════════════════ SUMMARY BANNER ═══════════════════════ */}
      {scheduleItems.length > 0 && (
        <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
          <Card className="border-primary/20">
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors">
                <div className="flex items-center gap-3">
                  <Badge className="bg-primary text-primary-foreground text-sm px-3 py-1">
                    Week {currentWeekNum}, {currentWeekYear}
                  </Badge>
                  <span className="text-sm font-medium">
                    {upcomingDeadlines.length} upcoming deadline{upcomingDeadlines.length !== 1 ? "s" : ""} in the next 4 weeks
                  </span>
                  {overdueItems > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {overdueItems} overdue
                    </Badge>
                  )}
                </div>
                {summaryOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronR className="h-4 w-4" />}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t px-4 py-3">
                {upcomingDeadlines.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No deadlines within the next 4 weeks — all clear.</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {upcomingDeadlines.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between text-sm border rounded px-3 py-2 hover:bg-accent/20 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            Ch.{item.chapter_number}
                          </Badge>
                          <span className="truncate">{item.description}</span>
                        </div>
                        <div className="flex items-center gap-2 ml-3 shrink-0">
                          <Badge
                            className={`text-[11px] ${
                              item.daysUntil <= 7
                                ? "bg-destructive/15 text-destructive"
                                : item.daysUntil <= 14
                                ? "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
                                : "bg-accent text-accent-foreground"
                            }`}
                          >
                            {item.dateLabel}
                          </Badge>
                          <span className="text-xs text-muted-foreground w-16 text-right">
                            {item.daysUntil === 0
                              ? "Today"
                              : item.daysUntil === 1
                              ? "Tomorrow"
                              : `${item.daysUntil}d away`}
                          </span>
                          <Badge variant="secondary" className="text-[9px]">
                            {item.isOwnerDecision ? "Owner" : "Builder"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="schedule" className="gap-1"><List className="h-3.5 w-3.5" /> Build Schedule</TabsTrigger>
          <TabsTrigger value="gantt" className="gap-1"><GanttIcon className="h-3.5 w-3.5" /> Gantt Chart</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1"><CalendarDays className="h-3.5 w-3.5" /> Decisions Calendar</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════ BUILD SCHEDULE TAB ═══════════════════════ */}
        <TabsContent value="schedule" className="space-y-4">
          {/* Stats + controls */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-green-600" /> {scheduleStats.done}/{scheduleStats.total} resolved</span>
              <span className="flex items-center gap-1"><Link2 className="h-4 w-4 text-primary" /> {scheduleStats.linked} linked to requirements</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={chapterFilter} onValueChange={setChapterFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Chapters" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Chapters</SelectItem>
                  {Object.entries(chapters).map(([ch, d]) => (
                    <SelectItem key={ch} value={ch}>{ch}. {d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={scheduleStatusFilter} onValueChange={setScheduleStatusFilter}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Items</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="done">Resolved</SelectItem>
                </SelectContent>
              </Select>
              {scheduleItems.length === 0 && (
                <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
                  <Upload className="h-4 w-4 mr-1" />
                  {importMutation.isPending ? "Importing…" : "Import Appendix 11"}
                </Button>
              )}
            </div>
          </div>

          {loadingSchedule ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : scheduleItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-lg font-medium">No deliverable schedule imported yet</p>
                <p className="text-sm text-muted-foreground mt-1">Import the Owner's Decision & Deliverables Schedule (Appendix 11) to get started.</p>
                <Button className="mt-4" onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
                  <Upload className="h-4 w-4 mr-1" /> Import Appendix 11
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredChapters.map(([ch, { name, items }]) => {
              const isOpen = openChapters[ch] !== false;
              const doneCount = items.filter((i: any) => i.resolved).length;
              return (
                <Collapsible key={ch} open={isOpen} onOpenChange={() => toggleChapter(ch)}>
                  <Card>
                    <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => toggleChapter(ch)}>
                      <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronR className="h-4 w-4" />}
                        <span className="font-semibold text-sm">{ch}. {name}</span>
                        <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                      </div>
                      <Badge variant="outline" className="text-xs">{doneCount}/{items.length} done</Badge>
                    </div>
                    <CollapsibleContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8" />
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[140px]">Builder Info</TableHead>
                            <TableHead className="w-[140px]">Owner Decision</TableHead>
                            <TableHead className="w-[160px]">Linked Requirement</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item: any) => {
                            const req = requirements.find((r: any) => r.id === item.requirement_id);
                            return (
                              <TableRow key={item.id} className={item.resolved ? "opacity-60" : ""}>
                                <TableCell>
                                  <Checkbox
                                    checked={item.resolved}
                                    onCheckedChange={(v) => toggleResolved.mutate({ id: item.id, resolved: !!v })}
                                  />
                                </TableCell>
                                <TableCell className="text-sm">{item.description}</TableCell>
                                <TableCell>{dateBadge(item.builder_info_date)}</TableCell>
                                <TableCell>{dateBadge(item.owner_decision_date)}</TableCell>
                                <TableCell>
                                  {req ? (
                                    <Button variant="ghost" size="sm" className="h-auto py-0.5 px-1 text-xs text-primary" onClick={() => setLinkDialog(item.id)}>
                                      {req.title}
                                    </Button>
                                  ) : (
                                    <Button variant="ghost" size="sm" className="h-auto py-0.5 px-1 text-xs text-muted-foreground" onClick={() => setLinkDialog(item.id)}>
                                      <Link2 className="h-3 w-3 mr-1" /> Link
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })
          )}
        </TabsContent>

        {/* ═══════════════════════ GANTT CHART TAB ═══════════════════════ */}
        <TabsContent value="gantt">
          {ganttItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {scheduleItems.length === 0 ? "Import the deliverables schedule first to see the Gantt chart." : "No items with parseable dates found."}
              </CardContent>
            </Card>
          ) : (
            <GanttChart items={ganttItems} />
          )}
        </TabsContent>

        {/* ═══════════════════════ DECISIONS CALENDAR TAB ═══════════════════════ */}
        <TabsContent value="calendar" className="space-y-4">
          <div className="flex gap-2 justify-end">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="idea">Idea</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="final">Final</SelectItem>
                <SelectItem value="changed">Changed</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex border rounded-md">
              <Button size="sm" variant={viewMode === "calendar" ? "default" : "ghost"} className="rounded-r-none" onClick={() => setViewMode("calendar")}>
                <CalendarDays className="h-4 w-4" />
              </Button>
              <Button size="sm" variant={viewMode === "list" ? "default" : "ghost"} className="rounded-l-none" onClick={() => setViewMode("list")}>
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {loadingDecisions ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
              {viewMode === "calendar" && (
                <Card className="w-fit">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-medium">{format(currentMonth, "MMMM yyyy")}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      month={currentMonth}
                      onMonthChange={setCurrentMonth}
                      modifiers={{ hasDecision: daysWithItems }}
                      modifiersStyles={{
                        hasDecision: {
                          fontWeight: "bold",
                          textDecoration: "underline",
                          textDecorationColor: "hsl(var(--primary))",
                          textUnderlineOffset: "4px",
                        },
                      }}
                    />
                  </CardContent>
                </Card>
              )}

              <div className="space-y-3 min-w-0">
                {viewMode === "calendar" && selectedDate && (
                  <h2 className="text-lg font-semibold">{format(selectedDate, "EEEE, MMMM d, yyyy")}</h2>
                )}
                {viewMode === "list" && (
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">{format(currentMonth, "MMMM yyyy")}</h2>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-3 w-3" /></Button>
                      <Button size="sm" variant="outline" onClick={() => setCurrentMonth(new Date())}>Today</Button>
                      <Button size="sm" variant="outline" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-3 w-3" /></Button>
                    </div>
                  </div>
                )}

                {selectedDecisions.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      {viewMode === "calendar" && !selectedDate
                        ? "Select a date to see decisions. Underlined dates have entries."
                        : "No dated decisions for this period."}
                    </CardContent>
                  </Card>
                ) : (
                  selectedDecisions.map((d: any) => (
                    <Card key={d.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{d.title}</span>
                              <Badge className={statusColors[d.status] || ""}>
                                {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                              </Badge>
                              {d.areas?.name && <Badge variant="outline" className="text-xs">{d.areas.name}</Badge>}
                            </div>
                            {d.decision_text && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{d.decision_text}</p>}
                          </div>
                          {d.date && viewMode === "list" && (
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{format(parseISO(d.date), "MMM d")}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Link to Requirement Dialog ──────────────────────────────────── */}
      <Dialog open={!!linkDialog} onOpenChange={() => setLinkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to Requirement</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-auto">
            <Button
              variant="ghost"
              className="w-full justify-start text-sm text-muted-foreground"
              onClick={() => linkDialog && linkMutation.mutate({ itemId: linkDialog, reqId: null })}
            >
              <Circle className="h-3 w-3 mr-2" /> None (unlink)
            </Button>
            {requirements.map((req: any) => (
              <Button
                key={req.id}
                variant="ghost"
                className="w-full justify-start text-sm"
                onClick={() => linkDialog && linkMutation.mutate({ itemId: linkDialog, reqId: req.id })}
              >
                <CheckCircle2 className="h-3 w-3 mr-2 text-primary" /> {req.title}
              </Button>
            ))}
            {requirements.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No requirements created yet. Add them in the Requirements module first.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

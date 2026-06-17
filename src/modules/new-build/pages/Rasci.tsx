import { useState, useMemo, useCallback } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, X, Filter } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

const PHASES = [
  { value: "design", label: "Design" },
  { value: "specify", label: "Specify" },
  { value: "engineering", label: "Engineering" },
  { value: "purchase", label: "Purchase" },
  { value: "produce", label: "Produce" },
  { value: "deliver", label: "Deliver" },
  { value: "install", label: "Install" },
  { value: "commission", label: "Commission" },
  { value: "handover", label: "Handover" },
] as const;

type RasciValue = "responsible" | "support" | "consulted" | "informed";

const BADGE_STYLES: Record<RasciValue, { label: string; className: string }> = {
  responsible: { label: "R", className: "bg-primary text-primary-foreground font-bold" },
  support: { label: "S", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  consulted: { label: "C", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  informed: { label: "I", className: "bg-muted text-muted-foreground" },
};

const ASSIGNMENT_TYPES: RasciValue[] = ["responsible", "support", "consulted", "informed"];

/** Pad an element code to 3 digits (e.g. "1" → "001", "10" → "010") */
const padCode = (code: string) => code.padStart(3, "0");

export default function Rasci() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;
  const [phase, setPhase] = useState<string>("design");
  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<RasciValue>>(new Set(ASSIGNMENT_TYPES));
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string> | null>(null); // null = all
  const [selectedGroups, setSelectedGroups] = useState<Set<string> | null>(null); // null = all
  const [detailElementId, setDetailElementId] = useState<string | null>(null);
  

  const { data: elementCodes = [] } = useQuery({
    queryKey: ["element_codes", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("nb_element_codes")
        .select("id, code, name")
        .eq("project_id", projectId)
        .order("code");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["rasci_roles", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("nb_rasci_roles")
        .select("id, name, display_order")
        .eq("project_id", projectId)
        .order("display_order");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["rasci_assignments", projectId, phase],
    queryFn: async () => {
      if (!projectId) return [];
      let all: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("nb_rasci_assignments")
          .select("element_code_id, rasci_role_id, assignment")
          .eq("project_id", projectId)
          .eq("phase", phase as any)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        all = all.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
    enabled: !!projectId,
  });

  // All assignments (all phases) for the detail panel
  const { data: allAssignments = [] } = useQuery({
    queryKey: ["rasci_assignments_all", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      let all: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("nb_rasci_assignments")
          .select("element_code_id, rasci_role_id, assignment, phase")
          .eq("project_id", projectId)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        all = all.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
    enabled: !!projectId && !!detailElementId,
  });

  const assignmentMap = useMemo(() => {
    const map: Record<string, Record<string, RasciValue>> = {};
    for (const a of assignments) {
      if (!map[a.element_code_id]) map[a.element_code_id] = {};
      map[a.element_code_id][a.rasci_role_id] = a.assignment as RasciValue;
    }
    return map;
  }, [assignments]);

  const activeRoleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of assignments) ids.add(a.rasci_role_id);
    return ids;
  }, [assignments]);

  const activeRoles = useMemo(
    () => roles.filter((r) => activeRoleIds.has(r.id)),
    [roles, activeRoleIds]
  );

  // Derive element groups (first 2 digits of code)
  const elementGroups = useMemo(() => {
    const groups = new Map<string, string>();
    for (const ec of elementCodes) {
      const prefix = padCode(ec.code).substring(0, 2);
      if (!groups.has(prefix)) {
        // Use first element in group for the label
        groups.set(prefix, ec.name);
      }
    }
    return Array.from(groups.keys()).sort();
  }, [elementCodes]);

  // Filtered roles
  const visibleRoles = useMemo(() => {
    if (!selectedRoleIds) return activeRoles;
    return activeRoles.filter((r) => selectedRoleIds.has(r.id));
  }, [activeRoles, selectedRoleIds]);

  // Filtered element codes – flat list sorted numerically
  const filteredCodes = useMemo(() => {
    const q = search.toLowerCase();
    return elementCodes
      .filter((ec) => {
        if (!assignmentMap[ec.id]) return false;
        if (q && !padCode(ec.code).toLowerCase().includes(q) && !ec.name.toLowerCase().includes(q)) return false;
        const group = padCode(ec.code).substring(0, 2);
        if (selectedGroups && !selectedGroups.has(group)) return false;
        const ecAssignments = assignmentMap[ec.id];
        if (ecAssignments) {
          const hasSelectedType = Object.values(ecAssignments).some((v) => selectedTypes.has(v));
          if (!hasSelectedType) return false;
        }
        return true;
      })
      .sort((a, b) => Number(a.code) - Number(b.code));
  }, [elementCodes, search, assignmentMap, selectedGroups, selectedTypes]);

  // Stats
  const stats = useMemo(() => {
    const total = assignments.length;
    const byValue: Record<string, number> = {};
    for (const a of assignments) {
      byValue[a.assignment] = (byValue[a.assignment] || 0) + 1;
    }
    return { total, byValue };
  }, [assignments]);

  // Detail panel data
  const detailElement = useMemo(
    () => elementCodes.find((ec) => ec.id === detailElementId),
    [elementCodes, detailElementId]
  );

  const detailData = useMemo(() => {
    if (!detailElementId) return [];
    return allAssignments.filter((a) => a.element_code_id === detailElementId);
  }, [allAssignments, detailElementId]);

  const detailByPhase = useMemo(() => {
    const map: Record<string, { role: string; assignment: RasciValue }[]> = {};
    for (const a of detailData) {
      if (!map[a.phase]) map[a.phase] = [];
      const role = roles.find((r) => r.id === a.rasci_role_id);
      if (role) {
        map[a.phase].push({ role: role.name, assignment: a.assignment as RasciValue });
      }
    }
    return map;
  }, [detailData, roles]);

  

  const toggleType = useCallback((type: RasciValue) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedTypes.size < 4) count++;
    if (selectedRoleIds) count++;
    if (selectedGroups) count++;
    return count;
  }, [selectedTypes, selectedRoleIds, selectedGroups]);

  const clearFilters = useCallback(() => {
    setSelectedTypes(new Set(ASSIGNMENT_TYPES));
    setSelectedRoleIds(null);
    setSelectedGroups(null);
  }, []);

  // Group name lookup from first element
  const groupNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ec of elementCodes) {
      const prefix = padCode(ec.code).substring(0, 2);
      if (!map[prefix]) map[prefix] = ec.name.split(" ").slice(0, 3).join(" ");
    }
    return map;
  }, [elementCodes]);

  const totalFilteredRows = filteredCodes.length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          RASCI Matrix — {currentProject?.name}
        </h1>
        <p className="text-muted-foreground mt-1">
          Responsibility assignments per element code and lifecycle phase
        </p>
      </div>

      {/* Phase tabs */}
      <Tabs value={phase} onValueChange={setPhase}>
        <ScrollArea className="w-full">
          <TabsList className="inline-flex w-auto">
            {PHASES.map((p) => (
              <TabsTrigger key={p.value} value={p.value} className="text-xs sm:text-sm">
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Tabs>

      {/* Stats + filters row */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="text-sm text-muted-foreground">
            {totalFilteredRows} elements · {stats.total} assignments · {visibleRoles.length} roles
          </div>
          <div className="flex gap-2">
            {Object.entries(BADGE_STYLES).map(([key, style]) => {
              const count = stats.byValue[key] || 0;
              if (count === 0) return null;
              return (
                <div key={key} className="flex items-center gap-1">
                  <span className={`inline-flex items-center justify-center h-5 w-5 rounded text-xs ${style.className}`}>
                    {style.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search elements…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 w-[200px] text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Filter popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-h-[70vh] overflow-y-auto" align="end">
              <div className="space-y-4">
                {/* Assignment type filter */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Assignment Type</h4>
                  <div className="flex flex-wrap gap-2">
                    {ASSIGNMENT_TYPES.map((type) => (
                      <button
                        key={type}
                        onClick={() => toggleType(type)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-opacity ${
                          selectedTypes.has(type) ? "opacity-100" : "opacity-30"
                        } ${BADGE_STYLES[type].className}`}
                      >
                        {BADGE_STYLES[type].label} — <span className="capitalize">{type}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Role filter */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">Roles</h4>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedRoleIds(selectedRoleIds ? null : new Set())}
                    >
                      {selectedRoleIds ? "Select all" : "Clear all"}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {activeRoles.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer hover:bg-muted/50 px-1 rounded">
                        <Checkbox
                          checked={!selectedRoleIds || selectedRoleIds.has(r.id)}
                          onCheckedChange={(checked) => {
                            setSelectedRoleIds((prev) => {
                              const base = prev || new Set(activeRoles.map((x) => x.id));
                              const next = new Set(base);
                              if (checked) next.add(r.id);
                              else next.delete(r.id);
                              // If all selected, reset to null
                              if (next.size === activeRoles.length) return null;
                              return next;
                            });
                          }}
                        />
                        <span className="truncate">{r.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Element group filter */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">Element Groups</h4>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedGroups(selectedGroups ? null : new Set())}
                    >
                      {selectedGroups ? "Select all" : "Clear all"}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {elementGroups.map((g) => (
                      <label key={g} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer hover:bg-muted/50 px-1 rounded">
                        <Checkbox
                          checked={!selectedGroups || selectedGroups.has(g)}
                          onCheckedChange={(checked) => {
                            setSelectedGroups((prev) => {
                              const base = prev || new Set(elementGroups);
                              const next = new Set(base);
                              if (checked) next.add(g);
                              else next.delete(g);
                              if (next.size === elementGroups.length) return null;
                              return next;
                            });
                          }}
                        />
                        <span className="font-mono text-xs">{g}</span>
                        <span className="text-muted-foreground truncate">{groupNames[g]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {activeFilterCount > 0 && (
                  <>
                    <Separator />
                    <Button variant="ghost" size="sm" className="w-full" onClick={clearFilters}>
                      Clear all filters
                    </Button>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Matrix table */}
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : totalFilteredRows === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {search || activeFilterCount > 0
              ? "No element codes match your current filters."
              : "No RASCI assignments found for this phase."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <ScrollArea className="w-full">
            <div className="min-w-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-20 bg-card min-w-[60px]">EC</TableHead>
                    <TableHead className="sticky left-[60px] z-20 bg-card min-w-[180px]">Element</TableHead>
                    {visibleRoles.map((r) => (
                      <TableHead
                        key={r.id}
                        className="text-center px-0 pb-2 pt-0 h-auto"
                        style={{ width: 36, minWidth: 36, maxWidth: 36 }}
                      >
                        <div
                          className="text-[10px] leading-tight text-muted-foreground whitespace-nowrap origin-bottom-left"
                          style={{
                            writingMode: "vertical-rl",
                            transform: "rotate(180deg)",
                            height: 100,
                            display: "flex",
                            alignItems: "center",
                          }}
                          title={r.name}
                        >
                          {r.name.length > 25 ? r.name.substring(0, 23) + "…" : r.name}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCodes.map((ec) => (
                    <TableRow
                      key={ec.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => setDetailElementId(ec.id)}
                    >
                      <TableCell className="sticky left-0 z-10 bg-card font-mono text-xs py-1 px-2">
                        {padCode(ec.code)}
                      </TableCell>
                      <TableCell
                        className="sticky left-[60px] z-10 bg-card text-xs truncate max-w-[200px] py-1"
                        title={ec.name}
                      >
                        {ec.name}
                      </TableCell>
                      {visibleRoles.map((r) => {
                        const val = assignmentMap[ec.id]?.[r.id];
                        const show = val && selectedTypes.has(val);
                        return (
                          <TableCell key={r.id} className="text-center px-0 py-1" style={{ width: 36 }}>
                            {show && (
                              <span
                                className={`inline-flex items-center justify-center h-5 w-5 rounded text-[10px] font-medium ${BADGE_STYLES[val].className}`}
                                title={`${r.name}: ${val}`}
                              >
                                {BADGE_STYLES[val].label}
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        {Object.entries(BADGE_STYLES).map(([key, style]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`inline-flex items-center justify-center h-6 w-6 rounded text-xs font-medium ${style.className}`}>
              {style.label}
            </span>
            <span className="text-muted-foreground capitalize">{key}</span>
          </div>
        ))}
      </div>

      {/* Element detail side panel */}
      <Sheet open={!!detailElementId} onOpenChange={(open) => !open && setDetailElementId(null)}>
        <SheetContent className="w-[400px] sm:w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className="font-mono text-primary">{detailElement ? padCode(detailElement.code) : ""}</span>
              <span>{detailElement?.name}</span>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              All RASCI assignments across lifecycle phases
            </p>
            {PHASES.map((p) => {
              const phaseAssignments = detailByPhase[p.value];
              if (!phaseAssignments || phaseAssignments.length === 0) return null;
              // Group by assignment type
              const byType: Record<RasciValue, string[]> = {
                responsible: [],
                support: [],
                consulted: [],
                informed: [],
              };
              for (const a of phaseAssignments) {
                byType[a.assignment].push(a.role);
              }
              return (
                <div key={p.value} className="border rounded-lg p-3">
                  <h4 className="text-sm font-semibold mb-2">{p.label}</h4>
                  <div className="space-y-1.5">
                    {ASSIGNMENT_TYPES.map((type) => {
                      if (byType[type].length === 0) return null;
                      return (
                        <div key={type} className="flex items-start gap-2">
                          <span
                            className={`inline-flex items-center justify-center h-5 w-5 rounded text-[10px] font-medium mt-0.5 shrink-0 ${BADGE_STYLES[type].className}`}
                          >
                            {BADGE_STYLES[type].label}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {byType[type].join(", ")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {Object.keys(detailByPhase).length === 0 && (
              <p className="text-sm text-muted-foreground">Loading assignments…</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

import { useState, useCallback } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Pencil, Trash2, Download, FileText, Ship } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import {
  zoneDefinitions,
  deckDefinitions,
  subzoneMappings,
  getZonesForDeck,
  getSubzonesForDeck,
  zoneDefinitionDocument,
  type ZoneDefinition,
} from "@/data/zone-definition-data";

type LocationTab = "zone-plan" | "zones" | "subzones" | "decks" | "blocks" | "areas" | "sections";

interface FormState {
  open: boolean;
  editing: any | null;
  name: string;
  description: string;
  parentId: string;
  deckNumber: string;
}

const emptyForm: FormState = { open: false, editing: null, name: "", description: "", parentId: "", deckNumber: "" };

export default function Locations() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<LocationTab>("zone-plan");
  const [form, setForm] = useState<FormState>(emptyForm);

  // ─── Queries ───
  const { data: zones = [] } = useQuery({
    queryKey: ["zones", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_zones").select("*").eq("project_id", projectId!).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: subzones = [] } = useQuery({
    queryKey: ["subzones", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_subzones").select("*, zones(name)").eq("project_id", projectId!).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: decks = [] } = useQuery({
    queryKey: ["decks", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_decks").select("*, zones(name)").eq("project_id", projectId!).order("deck_number");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: blocks = [] } = useQuery({
    queryKey: ["blocks", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_blocks").select("*, decks(name)").eq("project_id", projectId!).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: locationAreas = [] } = useQuery({
    queryKey: ["location_areas", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_location_areas").select("*, blocks(name)").eq("project_id", projectId!).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["sections", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_sections").select("*, location_areas(name)").eq("project_id", projectId!).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  // ─── Mutations ───
  const invalidate = useCallback(
    (key: string) => queryClient.invalidateQueries({ queryKey: [key, projectId] }),
    [queryClient, projectId]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const base: any = { name: form.name, description: form.description || null, project_id: projectId };

      if (tab === "subzones") base.zone_id = form.parentId;
      if (tab === "decks") { base.zone_id = form.parentId; base.deck_number = form.deckNumber ? Number(form.deckNumber) : null; }
      if (tab === "blocks") base.deck_id = form.parentId;
      if (tab === "areas") base.block_id = form.parentId;
      if (tab === "sections") base.location_area_id = form.parentId;

      const tableName = tab === "areas" ? "location_areas" : tab;

      if (form.editing) {
        const { error } = await supabase.from(tableName as any).update(base).eq("id", form.editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(tableName as any).insert(base);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: form.editing ? "Updated" : "Created", description: `${form.name} saved successfully.` });
      invalidate(tab === "areas" ? "location_areas" : tab);
      setForm(emptyForm);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const tableName = tab === "areas" ? "location_areas" : tab;
      const { error } = await supabase.from(tableName as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Deleted" });
      invalidate(tab === "areas" ? "location_areas" : tab);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ─── Helpers ───
  const openCreate = () => setForm({ ...emptyForm, open: true });
  const openEdit = (item: any) => {
    setForm({
      open: true,
      editing: item,
      name: item.name,
      description: item.description || "",
      parentId: item.zone_id || item.deck_id || item.block_id || item.location_area_id || "",
      deckNumber: item.deck_number?.toString() || "",
    });
  };

  const parentLabel = { subzones: "Zone", decks: "Zone", blocks: "Deck", areas: "Block", sections: "Area" } as const;
  const parentOptions = {
    subzones: zones,
    decks: zones,
    blocks: decks,
    areas: blocks,
    sections: locationAreas,
  } as const;

  const isCrudTab = tab !== "zone-plan";
  const needsParent = isCrudTab && tab !== "zones";
  const needsDeckNumber = tab === "decks";

  // ─── Table data per tab ───
  const rows = { zones, subzones, decks, blocks, areas: locationAreas, sections } as const;
  const currentRows = isCrudTab ? rows[tab as keyof typeof rows] : [];
  const getParentName = (item: any) => {
    if (tab === "subzones") return item.zones?.name;
    if (tab === "decks") return item.zones?.name;
    if (tab === "blocks") return item.decks?.name;
    if (tab === "areas") return item.blocks?.name;
    if (tab === "sections") return item.location_areas?.name;
    return null;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Locations
        </h1>
        <p className="text-muted-foreground text-sm">Manage zones, subzones, decks, blocks, areas, and sections.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as LocationTab)}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList>
            <TabsTrigger value="zone-plan" className="gap-1.5">
              <Ship className="h-3.5 w-3.5" /> Zone Plan
            </TabsTrigger>
            <TabsTrigger value="zones">Zones</TabsTrigger>
            <TabsTrigger value="subzones">Subzones</TabsTrigger>
            <TabsTrigger value="decks">Decks</TabsTrigger>
            <TabsTrigger value="blocks">Blocks</TabsTrigger>
            <TabsTrigger value="areas">Areas</TabsTrigger>
            <TabsTrigger value="sections">Sections</TabsTrigger>
          </TabsList>
          {isCrudTab && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Add {tab.slice(0, -1)}
            </Button>
          )}
        </div>

        {/* ── ZONE PLAN TAB ── */}
        <TabsContent value="zone-plan" className="space-y-4 mt-4">
          {/* Document reference */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Ship className="h-4 w-4" /> Zone Definition Plan — Y727
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Drawing {zoneDefinitionDocument.fullNumber} Rev {zoneDefinitionDocument.revision} — Defines the longitudinal and vertical zone breakdown for hull and superstructure.
                  </p>
                </div>
                <a
                  href={`/documents/${zoneDefinitionDocument.fileName}`}
                  download
                  className="shrink-0"
                >
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Drawing PDF
                  </Button>
                </a>
              </div>
            </CardHeader>
          </Card>

          {/* Zone–Deck Matrix */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Zone–Deck Matrix</CardTitle>
              <p className="text-sm text-muted-foreground">
                Each cell shows the subzone codes where a zone intersects a deck. Hull zones (A–D) cover decks 00–03; superstructure zones (E–G, H&J) cover decks 04–07.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10 min-w-[160px]">Deck</TableHead>
                      {zoneDefinitions.map((z) => (
                        <TableHead key={z.id} className="text-center min-w-[100px]">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help underline decoration-dotted underline-offset-2 decoration-muted-foreground/50">
                                {z.name}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-sm">
                              <p className="font-medium">{z.fullName}</p>
                              <p className="text-muted-foreground mt-0.5">{z.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...deckDefinitions].reverse().map((deck) => {
                      const deckSubzones = getSubzonesForDeck(deck.number);
                      const deckZoneIds = getZonesForDeck(deck.number);

                      return (
                        <TableRow key={deck.number}>
                          <TableCell className="sticky left-0 bg-background z-10 font-medium whitespace-nowrap">
                            <span className="font-mono text-xs text-muted-foreground mr-2">{deck.code}</span>
                            {deck.name}
                          </TableCell>
                          {zoneDefinitions.map((zone) => {
                            const isPresent = deckZoneIds.includes(zone.id);
                            const codes = deckSubzones
                              .filter((s) => s.zoneId === zone.id)
                              .map((s) => s.code);

                            if (!isPresent) {
                              return (
                                <TableCell key={zone.id} className="text-center">
                                  <span className="text-muted-foreground/30">—</span>
                                </TableCell>
                              );
                            }

                            return (
                              <TableCell key={zone.id} className="text-center p-1">
                                <div
                                  className="rounded-md px-2 py-1.5 text-xs font-mono font-medium"
                                  style={{
                                    backgroundColor: `${zone.colorHex}20`,
                                    color: zone.colorHex,
                                    border: `1px solid ${zone.colorHex}40`,
                                  }}
                                >
                                  {codes.join(", ")}
                                </div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Zone Legend */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Hull Zones */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Hull Zones (Decks 00–03)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {zoneDefinitions.filter((z) => z.type === "hull").map((zone) => (
                  <ZoneLegendRow key={zone.id} zone={zone} />
                ))}
              </CardContent>
            </Card>

            {/* Superstructure Zones */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Superstructure Zones (Decks 04–07)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {zoneDefinitions.filter((z) => z.type === "superstructure").map((zone) => (
                  <ZoneLegendRow key={zone.id} zone={zone} />
                ))}
              </CardContent>
            </Card>
          </div>

          {/* General Note */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-start gap-3 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">General Note</p>
                  <p>Building sequence is according to Level 2 planning Basic Engineering. Typical package delivery is from Basic Engineering to Detail Engineering. Zone selection determines the engineering and production work breakdown structure.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CRUD TABS ── */}
        {isCrudTab && (
          <Card className="mt-4">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    {needsParent && <TableHead>{parentLabel[tab as keyof typeof parentLabel]}</TableHead>}
                    {needsDeckNumber && <TableHead>Deck #</TableHead>}
                    {(tab === "zones" || tab === "blocks") && <TableHead>Status</TableHead>}
                    {(tab === "zones" || tab === "blocks" || tab === "decks" || tab === "areas") && <TableHead className="text-right">Components</TableHead>}
                    {(tab === "areas") && <TableHead>Area Code</TableHead>}
                    {(tab === "sections") && <TableHead>Section Code</TableHead>}
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(currentRows as any[]).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={tab === "zones" ? 5 : needsParent ? 4 : 3} className="text-center text-muted-foreground py-8">
                        No {tab} yet. Click "Add" to create one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (currentRows as any[]).map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        {needsParent && (
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{getParentName(item) || "—"}</Badge>
                          </TableCell>
                        )}
                        {needsDeckNumber && <TableCell>{item.deck_number ?? "—"}</TableCell>}
                        {(tab === "zones" || tab === "blocks") && (
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">{item.status || "—"}</Badge>
                          </TableCell>
                        )}
                        {(tab === "zones" || tab === "blocks" || tab === "decks" || tab === "areas") && (
                          <TableCell className="text-right font-mono">{item.number_of_components ?? 0}</TableCell>
                        )}
                        {tab === "areas" && (
                          <TableCell className="font-mono text-xs">{item.area_code || "—"}</TableCell>
                        )}
                        {tab === "sections" && (
                          <TableCell className="font-mono text-xs">{item.section_code || "—"}</TableCell>
                        )}
                        <TableCell className="text-muted-foreground text-sm truncate max-w-[300px]">
                          {item.description || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Tabs>

      {/* Add / Edit Dialog */}
      <Dialog open={form.open} onOpenChange={(open) => !open && setForm(emptyForm)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.editing ? "Edit" : "Add"} {isCrudTab ? tab.slice(0, -1) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Enter name" />
            </div>
            {needsParent && (
              <div>
                <Label>{parentLabel[tab as keyof typeof parentLabel]}</Label>
                <Select value={form.parentId} onValueChange={(v) => setForm((f) => ({ ...f, parentId: v }))}>
                  <SelectTrigger><SelectValue placeholder={`Select ${parentLabel[tab as keyof typeof parentLabel].toLowerCase()}`} /></SelectTrigger>
                  <SelectContent>
                    {(parentOptions[tab as keyof typeof parentOptions] || []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {needsDeckNumber && (
              <div>
                <Label>Deck Number</Label>
                <Input type="number" value={form.deckNumber} onChange={(e) => setForm((f) => ({ ...f, deckNumber: e.target.value }))} placeholder="e.g. 1" />
              </div>
            )}
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(emptyForm)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || (needsParent && !form.parentId)}>
              {form.editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ZoneLegendRow({ zone }: { zone: ZoneDefinition }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
      <div
        className="w-4 h-4 rounded-sm shrink-0 border"
        style={{
          backgroundColor: `${zone.colorHex}30`,
          borderColor: `${zone.colorHex}60`,
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{zone.name}</span>
          <span className="text-xs text-muted-foreground">— {zone.fullName}</span>
        </div>
        <p className="text-xs text-muted-foreground">{zone.description}</p>
        {zone.extent_mm && (
          <span className="text-xs font-mono text-muted-foreground/70">
            Extent: {(zone.extent_mm / 1000).toFixed(1)} m
          </span>
        )}
      </div>
    </div>
  );
}

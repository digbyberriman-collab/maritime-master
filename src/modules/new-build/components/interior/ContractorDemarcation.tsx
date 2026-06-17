import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Plus, Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// ── Types ─────────────────────────────────────────────────────────────
type DeckView = {
  id: string;
  label: string;
  display_order: number;
  image_storage_path: string;
  image_width: number;
  image_height: number;
};

type DeckRoom = {
  id: string;
  deck_view_id: string | null;
  label: string;
  area_id: string | null;
  svg_polygon: string | null;
  bbox_x: number | null;
  bbox_y: number | null;
  bbox_width: number | null;
  bbox_height: number | null;
};

type Assignment = {
  id: string;
  room_id: string;
  supplier_id: string;
  produces_drawing: boolean;
  creates_detail_booklet: boolean;
  approves_drawing: boolean;
  defines_materials: boolean;
  scope_notes: string | null;
};

type Supplier = { id: string; name: string; company: string | null };

// Fixed palette for contractor colours — up to 12 distinguishable colours
const COLOURS = [
  "rgba(59,130,246,0.35)",  // blue
  "rgba(239,68,68,0.35)",   // red
  "rgba(34,197,94,0.35)",   // green
  "rgba(245,158,11,0.35)",  // amber
  "rgba(168,85,247,0.35)",  // purple
  "rgba(236,72,153,0.35)",  // pink
  "rgba(20,184,166,0.35)",  // teal
  "rgba(249,115,22,0.35)",  // orange
  "rgba(99,102,241,0.35)",  // indigo
  "rgba(234,179,8,0.35)",   // yellow
  "rgba(6,182,212,0.35)",   // cyan
  "rgba(244,63,94,0.35)",   // rose
];

const SOLID_COLOURS = COLOURS.map((c) => c.replace("0.35)", "1)"));

const SCOPE_LABELS: { key: keyof Pick<Assignment, "produces_drawing" | "creates_detail_booklet" | "approves_drawing" | "defines_materials">; label: string; short: string }[] = [
  { key: "produces_drawing", label: "Produces 1:20 drawing", short: "Dwg" },
  { key: "creates_detail_booklet", label: "Creates detail booklet", short: "Booklet" },
  { key: "approves_drawing", label: "Approves drawing package", short: "Approve" },
  { key: "defines_materials", label: "Defines materials", short: "Materials" },
];

export default function ContractorDemarcation() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Data fetching ──────────────────────────────────────────────────
  const { data: decks = [] } = useQuery({
    queryKey: ["deck-views-interior", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nb_deck_views")
        .select("id,label,display_order,image_storage_path,image_width,image_height")
        .eq("project_id", projectId!)
        .order("display_order");
      if (error) throw error;
      return data as DeckView[];
    },
    enabled: !!projectId,
  });

  const { data: allRooms = [] } = useQuery({
    queryKey: ["deck-rooms-all", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nb_deck_rooms").select("*");
      if (error) throw error;
      return data as DeckRoom[];
    },
    enabled: !!projectId,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nb_suppliers")
        .select("id,name,company")
        .eq("project_id", projectId!);
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!projectId,
  });

  const { data: assignments = [], refetch: refetchAssignments } = useQuery({
    queryKey: ["contractor-assignments", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nb_room_contractor_assignments")
        .select("*")
        .eq("project_id", projectId!);
      if (error) throw error;
      return data as Assignment[];
    },
    enabled: !!projectId,
  });

  // ── Active deck & image ────────────────────────────────────────────
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  useEffect(() => {
    if (decks.length && !activeDeckId) setActiveDeckId(decks[0].id);
  }, [decks]);

  const activeDeck = decks.find((d) => d.id === activeDeckId) ?? null;
  const [deckUrl, setDeckUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDeck) { setDeckUrl(null); return; }
    (async () => {
      const { data } = await supabase.storage
        .from("deck-plans")
        .createSignedUrl(activeDeck.image_storage_path, 3600);
      setDeckUrl(data?.signedUrl ?? null);
    })();
  }, [activeDeck]);

  const rooms = useMemo(
    () => allRooms.filter((r) => r.deck_view_id === activeDeckId),
    [allRooms, activeDeckId],
  );

  // ── Supplier → colour mapping ─────────────────────────────────────
  const supplierColourMap = useMemo(() => {
    const uniqueIds = Array.from(new Set(assignments.map((a) => a.supplier_id)));
    const map: Record<string, { fill: string; solid: string }> = {};
    uniqueIds.forEach((id, i) => {
      map[id] = { fill: COLOURS[i % COLOURS.length], solid: SOLID_COLOURS[i % SOLID_COLOURS.length] };
    });
    return map;
  }, [assignments]);

  // ── Selected room state ────────────────────────────────────────────
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;
  const roomAssignments = useMemo(
    () => assignments.filter((a) => a.room_id === selectedRoomId),
    [assignments, selectedRoomId],
  );

  // ── Assignment dialog ──────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formSupplierId, setFormSupplierId] = useState("");
  const [formScopes, setFormScopes] = useState({
    produces_drawing: false,
    creates_detail_booklet: false,
    approves_drawing: false,
    defines_materials: false,
  });
  const [formNotes, setFormNotes] = useState("");

  const openAddDialog = () => {
    setFormSupplierId("");
    setFormScopes({ produces_drawing: false, creates_detail_booklet: false, approves_drawing: false, defines_materials: false });
    setFormNotes("");
    setDialogOpen(true);
  };

  const saveAssignment = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("nb_room_contractor_assignments").insert({
        project_id: projectId!,
        room_id: selectedRoomId!,
        supplier_id: formSupplierId,
        ...formScopes,
        scope_notes: formNotes || null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refetchAssignments();
      toast({ title: "Contractor assigned" });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nb_room_contractor_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchAssignments();
      toast({ title: "Assignment removed" });
    },
  });

  const updateAssignment = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: "produces_drawing" | "creates_detail_booklet" | "approves_drawing" | "defines_materials"; value: boolean }) => {
      const { error } = await supabase.from("nb_room_contractor_assignments").update({ [field]: value } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refetchAssignments(),
  });

  // ── Helpers ────────────────────────────────────────────────────────
  const supplierLabel = (id: string) => {
    const s = suppliers.find((s) => s.id === id);
    return s ? `${s.name}${s.company ? ` (${s.company})` : ""}` : id.slice(0, 8);
  };

  const roomHasAssignment = (roomId: string) => assignments.some((a) => a.room_id === roomId);
  const roomPrimarySupplier = (roomId: string) => {
    const a = assignments.find((a) => a.room_id === roomId);
    return a ? a.supplier_id : null;
  };

  // Already-assigned supplier IDs for this room (to prevent duplicates)
  const assignedSupplierIds = new Set(roomAssignments.map((a) => a.supplier_id));

  if (!projectId) return null;

  return (
    <div className="space-y-4">
      {decks.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No deck plans uploaded yet. Go to the <strong>Deck Plan</strong> page to upload GA drawings and create deck views first.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Deck selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {decks.map((d) => (
              <Button
                key={d.id}
                size="sm"
                variant={d.id === activeDeckId ? "default" : "outline"}
                onClick={() => { setActiveDeckId(d.id); setSelectedRoomId(null); }}
              >
                {d.label}
              </Button>
            ))}
          </div>

          {/* Legend */}
          {Object.keys(supplierColourMap).length > 0 && (
            <div className="flex flex-wrap gap-3 text-xs">
              {Object.entries(supplierColourMap).map(([sid, col]) => (
                <span key={sid} className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm border" style={{ backgroundColor: col.solid }} />
                  {supplierLabel(sid)}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block w-3 h-3 rounded-sm border bg-muted" />
                Unassigned
              </span>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            {/* Deck plan view */}
            <Card className="overflow-hidden">
              <div className="relative">
                {deckUrl && activeDeck && (
                  <div className="relative">
                    <img
                      src={deckUrl}
                      alt={activeDeck.label}
                      className="w-full h-auto block"
                      draggable={false}
                    />
                    {/* SVG overlay for rooms */}
                    <svg
                      className="absolute inset-0 w-full h-full"
                      viewBox={`0 0 ${activeDeck.image_width} ${activeDeck.image_height}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {rooms.map((room) => {
                        const suppId = roomPrimarySupplier(room.id);
                        const col = suppId ? supplierColourMap[suppId] : null;
                        const isSelected = room.id === selectedRoomId;

                        if (room.svg_polygon) {
                          return (
                            <polygon
                              key={room.id}
                              points={room.svg_polygon}
                              fill={col?.fill || "rgba(156,163,175,0.2)"}
                              stroke={isSelected ? "hsl(var(--primary))" : (col?.solid || "rgba(156,163,175,0.5)")}
                              strokeWidth={isSelected ? 4 : 2}
                              className="cursor-pointer transition-all"
                              onClick={() => setSelectedRoomId(room.id)}
                            />
                          );
                        }
                        if (room.bbox_x != null && room.bbox_y != null && room.bbox_width != null && room.bbox_height != null) {
                          return (
                            <rect
                              key={room.id}
                              x={room.bbox_x}
                              y={room.bbox_y}
                              width={room.bbox_width}
                              height={room.bbox_height}
                              fill={col?.fill || "rgba(156,163,175,0.2)"}
                              stroke={isSelected ? "hsl(var(--primary))" : (col?.solid || "rgba(156,163,175,0.5)")}
                              strokeWidth={isSelected ? 4 : 2}
                              className="cursor-pointer transition-all"
                              onClick={() => setSelectedRoomId(room.id)}
                            />
                          );
                        }
                        return null;
                      })}
                      {/* Labels */}
                      {rooms.map((room) => {
                        const cx = room.svg_polygon
                          ? (() => {
                              const pts = room.svg_polygon.split(/[\s,]+/).map(Number);
                              let sx = 0, sy = 0, n = 0;
                              for (let i = 0; i < pts.length - 1; i += 2) { sx += pts[i]; sy += pts[i + 1]; n++; }
                              return { x: sx / n, y: sy / n };
                            })()
                          : room.bbox_x != null
                            ? { x: room.bbox_x + (room.bbox_width || 0) / 2, y: room.bbox_y! + (room.bbox_height || 0) / 2 }
                            : null;
                        if (!cx) return null;
                        return (
                          <text
                            key={`label-${room.id}`}
                            x={cx.x}
                            y={cx.y}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={Math.min(activeDeck.image_width * 0.012, 14)}
                            fontWeight={600}
                            fill="hsl(var(--foreground))"
                            className="pointer-events-none select-none"
                            style={{ paintOrder: "stroke", stroke: "hsl(var(--background))", strokeWidth: 3 }}
                          >
                            {room.label}
                          </text>
                        );
                      })}
                    </svg>
                  </div>
                )}
                {!deckUrl && (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    Loading deck image…
                  </div>
                )}
              </div>
            </Card>

            {/* Side panel — room detail & assignments */}
            <div className="space-y-4">
              {selectedRoom ? (
                <>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {selectedRoom.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {roomAssignments.length === 0 && (
                        <p className="text-sm text-muted-foreground">No contractors assigned to this room yet.</p>
                      )}

                      {roomAssignments.map((a) => {
                        const col = supplierColourMap[a.supplier_id];
                        return (
                          <div key={a.id} className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col?.solid }} />
                                {supplierLabel(a.supplier_id)}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => deleteAssignment.mutate(a.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                              {SCOPE_LABELS.map((s) => (
                                <label key={s.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                                  <Checkbox
                                    checked={a[s.key]}
                                    onCheckedChange={(v) =>
                                      updateAssignment.mutate({ id: a.id, field: s.key, value: !!v })
                                    }
                                  />
                                  {s.label}
                                </label>
                              ))}
                            </div>
                            {a.scope_notes && (
                              <p className="text-xs text-muted-foreground">{a.scope_notes}</p>
                            )}
                          </div>
                        );
                      })}

                      <Button size="sm" variant="outline" className="w-full" onClick={openAddDialog}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Assign contractor
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Summary table for this room */}
                  {roomAssignments.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Scope Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Responsibility</TableHead>
                              {roomAssignments.map((a) => (
                                <TableHead key={a.id} className="text-xs text-center">
                                  {supplierLabel(a.supplier_id).split(" (")[0]}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {SCOPE_LABELS.map((s) => (
                              <TableRow key={s.key}>
                                <TableCell className="text-xs font-medium">{s.label}</TableCell>
                                {roomAssignments.map((a) => (
                                  <TableCell key={a.id} className="text-center">
                                    {a[s.key] ? (
                                      <Badge variant="default" className="text-[10px] px-1.5 py-0">✓</Badge>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Click a room on the deck plan to view or assign contractors.
                  </CardContent>
                </Card>
              )}

              {/* Full project assignment summary */}
              {assignments.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">All Assignments ({assignments.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[300px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Room</TableHead>
                            <TableHead className="text-xs">Contractor</TableHead>
                            <TableHead className="text-xs">Scope</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {assignments.map((a) => {
                            const room = allRooms.find((r) => r.id === a.room_id);
                            const scopes = SCOPE_LABELS.filter((s) => a[s.key]).map((s) => s.short);
                            return (
                              <TableRow
                                key={a.id}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => {
                                  // Switch to the correct deck if needed
                                  if (room?.deck_view_id && room.deck_view_id !== activeDeckId) {
                                    setActiveDeckId(room.deck_view_id);
                                  }
                                  setSelectedRoomId(a.room_id);
                                }}
                              >
                                <TableCell className="text-xs">{room?.label || "—"}</TableCell>
                                <TableCell className="text-xs">{supplierLabel(a.supplier_id).split(" (")[0]}</TableCell>
                                <TableCell className="text-xs">
                                  {scopes.length > 0 ? scopes.join(", ") : <span className="text-muted-foreground">None set</span>}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Add assignment dialog */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign contractor to {selectedRoom?.label}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Contractor / Supplier</Label>
                  <Select value={formSupplierId} onValueChange={setFormSupplierId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a contractor…" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers
                        .filter((s) => !assignedSupplierIds.has(s.id))
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}{s.company ? ` (${s.company})` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Scope of responsibility</Label>
                  {SCOPE_LABELS.map((s) => (
                    <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={formScopes[s.key]}
                        onCheckedChange={(v) => setFormScopes((prev) => ({ ...prev, [s.key]: !!v }))}
                      />
                      {s.label}
                    </label>
                  ))}
                </div>

                <div>
                  <Label>Additional notes</Label>
                  <Textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="e.g. Responsible for supplying 1:20 drawing and approving workshop dwg packages…"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => saveAssignment.mutate()} disabled={!formSupplierId}>
                  Assign
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

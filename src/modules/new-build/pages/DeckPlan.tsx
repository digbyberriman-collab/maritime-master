import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "@/lib/pdfjs-setup";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Minus,
  Pencil,
  ScanSearch,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
  XCircle,
  ZoomIn,
} from "lucide-react";

type Area = { id: string; name: string };

type DeckView = {
  id: string;
  project_id: string;
  label: string;
  display_order: number;
  image_storage_path: string;
  image_width: number;
  image_height: number;
};

type DeckRoom = {
  id: string;
  deck_view_id: string | null;
  drawing_id: string | null;
  deck: string;
  label: string;
  area_id: string | null;
  svg_polygon: string | null;
  bbox_x: number | null;
  bbox_y: number | null;
  bbox_width: number | null;
  bbox_height: number | null;
};

type Mode = "view" | "place";

// DPI multiplier when rendering the saved deck PNG. 2 = retina-sharp.
const CROP_RENDER_SCALE = 2;
// DPI for the in-cropper preview. Lower = faster crop UI, still readable.
const CROPPER_RENDER_SCALE = 1.5;

/** Get marker position as percentage of image dimensions */
function getMarkerPos(room: DeckRoom, imageWidth: number, imageHeight: number) {
  // Use center of bbox if available
  if (room.bbox_x != null && room.bbox_y != null) {
    const cx = room.bbox_x + (room.bbox_width ?? 0) / 2;
    const cy = room.bbox_y + (room.bbox_height ?? 0) / 2;
    return { x: (cx / imageWidth) * 100, y: (cy / imageHeight) * 100 };
  }
  // Fall back to polygon centroid
  if (room.svg_polygon) {
    const pts = room.svg_polygon.split(" ").map((p) => {
      const [x, y] = p.split(",").map(Number);
      return { x, y };
    });
    if (pts.length > 0) {
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      return { x: (cx / imageWidth) * 100, y: (cy / imageHeight) * 100 };
    }
  }
  return { x: 50, y: 50 };
}

// ---- Area detail types ----
type AreaDetail = {
  decisions: Array<{ id: string; title: string; status: string; item_type: string }>;
  files: Array<{ id: string; name: string; status: string }>;
  approvals: Array<{ id: string; status: string; file_id: string; file_name?: string }>;
  equipment: Array<{ id: string; name: string; status: string }>;
  materials: Array<{ id: string; name: string; selection_status: string }>;
};

export default function DeckPlan() {
  const { currentProject } = useProject();
  const [isAdmin, setIsAdmin] = useState(false);
  const [areas, setAreas] = useState<Area[]>([]);

  const [decks, setDecks] = useState<DeckView[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const activeDeck = useMemo(
    () => decks.find((d) => d.id === activeDeckId) ?? null,
    [decks, activeDeckId],
  );
  const [activeDeckUrl, setActiveDeckUrl] = useState<string | null>(null);

  // Hotspots on the active deck
  const [rooms, setRooms] = useState<DeckRoom[]>([]);
  const [mode, setMode] = useState<Mode>("view");
  const [roomForm, setRoomForm] = useState({ label: "", area_id: "" });
  const [pendingMarker, setPendingMarker] = useState<{ x: number; y: number } | null>(null);
  const [activeRoom, setActiveRoom] = useState<DeckRoom | null>(null);
  const [areaDetail, setAreaDetail] = useState<AreaDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editingRoom, setEditingRoom] = useState<DeckRoom | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectedRooms, setDetectedRooms] = useState<
    Array<{ label: string; svg_polygon: string; bbox_x: number; bbox_y: number; bbox_width: number; bbox_height: number }>
  >([]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom & pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Reset zoom/pan when switching decks
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [activeDeckId]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom((z) => Math.min(10, Math.max(0.5, z + delta * z)));
  }, []);

  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || mode !== "place") {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [mode, pan]);

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
  }, [isPanning]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const [cropperOpen, setCropperOpen] = useState(false);

  // -----------------------------------------------------------------
  // Initial loads
  // -----------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    })();
  }, []);

  const loadDecks = async () => {
    if (!currentProject) return;
    const { data } = await supabase
      .from("nb_deck_views")
      .select("*")
      .eq("project_id", currentProject.id)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    const list = (data ?? []) as DeckView[];
    setDecks(list);
    setActiveDeckId((cur) => {
      if (cur && list.some((d) => d.id === cur)) return cur;
      return list[0]?.id ?? null;
    });
  };

  useEffect(() => {
    if (!currentProject) return;
    loadDecks();
    (async () => {
      const { data } = await supabase
        .from("nb_areas")
        .select("id,name")
        .eq("project_id", currentProject.id)
        .order("name");
      setAreas(data ?? []);
    })();
  }, [currentProject]);

  // Sign URL for the active deck image
  useEffect(() => {
    if (!activeDeck) {
      setActiveDeckUrl(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase.storage
        .from("deck-plans")
        .createSignedUrl(activeDeck.image_storage_path, 3600);
      if (error) {
        toast.error("Could not load deck image: " + error.message);
        return;
      }
      setActiveDeckUrl(data.signedUrl);
    })();
  }, [activeDeck]);

  // Load hotspots for active deck + realtime
  useEffect(() => {
    if (!activeDeck) {
      setRooms([]);
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from("nb_deck_rooms")
        .select("*")
        .eq("deck_view_id", activeDeck.id);
      setRooms((data ?? []) as DeckRoom[]);
    };
    load();
    const channel = supabase
      .channel(`deck_rooms:dv:${activeDeck.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deck_rooms",
          filter: `deck_view_id=eq.${activeDeck.id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeDeck]);

  // -----------------------------------------------------------------
  // Load area detail when a room is selected
  // -----------------------------------------------------------------
  const loadAreaDetail = async (areaId: string) => {
    setLoadingDetail(true);
    setAreaDetail(null);
    try {
      const [decisionsRes, filesRes, approvalsRes, equipRes, matsRes] = await Promise.all([
        supabase.from("nb_decisions").select("id,title,status,item_type").eq("area_id", areaId).order("created_at", { ascending: false }).limit(20),
        supabase.from("nb_files").select("id,name,status").eq("area_id", areaId).order("created_at", { ascending: false }).limit(20),
        supabase.from("nb_approvals").select("id,status,file_id").limit(50),
        supabase.from("nb_equipment").select("id,name,status").eq("area_id", areaId).order("created_at", { ascending: false }).limit(20),
        supabase.from("nb_materials").select("id,name,selection_status").limit(100),
      ]);

      // Filter approvals to those linked to files in this area
      const fileIds = new Set((filesRes.data ?? []).map((f: any) => f.id));
      const areaApprovals = (approvalsRes.data ?? [])
        .filter((a: any) => fileIds.has(a.file_id))
        .map((a: any) => ({
          ...a,
          file_name: (filesRes.data ?? []).find((f: any) => f.id === a.file_id)?.name,
        }));

      // Filter materials by area via material_usages
      const { data: usages } = await supabase
        .from("nb_material_usages")
        .select("material_id")
        .eq("area_id", areaId);
      const matIds = new Set((usages ?? []).map((u: any) => u.material_id));
      const areaMats = (matsRes.data ?? []).filter((m: any) => matIds.has(m.id));

      setAreaDetail({
        decisions: decisionsRes.data ?? [],
        files: filesRes.data ?? [],
        approvals: areaApprovals,
        equipment: equipRes.data ?? [],
        materials: areaMats,
      });
    } catch {
      toast.error("Failed to load area details");
    } finally {
      setLoadingDetail(false);
    }
  };

  const openRoomDetail = (room: DeckRoom) => {
    setActiveRoom(room);
    if (room.area_id) {
      loadAreaDetail(room.area_id);
    } else {
      setAreaDetail(null);
    }
  };

  // -----------------------------------------------------------------
  // Place marker mode
  // -----------------------------------------------------------------
  const clickToImageCoords = (e: React.MouseEvent) => {
    if (!overlayRef.current || !activeDeck) return null;
    const rect = overlayRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    return {
      x: (xPx / rect.width) * activeDeck.image_width,
      y: (yPx / rect.height) * activeDeck.image_height,
    };
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (mode !== "place") return;
    const pt = clickToImageCoords(e);
    if (!pt) return;
    setPendingMarker(pt);
    setRoomForm({ label: "", area_id: "" });
  };

  const cancelPlacing = () => {
    setPendingMarker(null);
    setMode("view");
  };

  const saveRoom = async () => {
    if (!pendingMarker || !activeDeck) return;
    if (!roomForm.label.trim()) {
      toast.error("Marker label required");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("nb_deck_rooms").insert({
      deck_view_id: activeDeck.id,
      drawing_id: null,
      deck: activeDeck.label,
      label: roomForm.label.trim(),
      area_id: roomForm.area_id || null,
      svg_polygon: null,
      bbox_x: pendingMarker.x,
      bbox_y: pendingMarker.y,
      bbox_width: 0,
      bbox_height: 0,
      is_confirmed: true,
      source: "manual",
      created_by: user?.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Marker saved");
    setPendingMarker(null);
    setMode("view");
  };

  const deleteRoom = async (id: string) => {
    const { error } = await supabase.from("nb_deck_rooms").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Marker deleted");
    setActiveRoom(null);
    setEditingRoom(null);
  };

  const detectRooms = async () => {
    if (!activeDeck) return;
    setDetecting(true);
    setDetectedRooms([]);
    try {
      const { data, error } = await supabase.functions.invoke("detect-rooms", {
        body: {
          deck_view_id: activeDeck.id,
          image_storage_path: activeDeck.image_storage_path,
          image_width: activeDeck.image_width,
          image_height: activeDeck.image_height,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const detected = data?.rooms ?? [];
      if (detected.length === 0) {
        toast.info("No rooms detected — the AI couldn't identify distinct areas on this plan.");
      } else {
        toast.success(`Detected ${detected.length} room(s). Review and confirm below.`);
        setDetectedRooms(detected);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Detection failed");
    } finally {
      setDetecting(false);
    }
  };

  const confirmDetectedRoom = async (index: number) => {
    if (!activeDeck) return;
    const room = detectedRooms[index];
    const { data: { user } } = await supabase.auth.getUser();
    const cx = room.bbox_x + room.bbox_width / 2;
    const cy = room.bbox_y + room.bbox_height / 2;
    const { error } = await supabase.from("nb_deck_rooms").insert({
      deck_view_id: activeDeck.id,
      drawing_id: null,
      deck: activeDeck.label,
      label: room.label,
      area_id: null,
      svg_polygon: room.svg_polygon,
      bbox_x: cx,
      bbox_y: cy,
      bbox_width: room.bbox_width,
      bbox_height: room.bbox_height,
      is_confirmed: true,
      source: "ai",
      created_by: user?.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`"${room.label}" confirmed`);
    setDetectedRooms((prev) => prev.filter((_, i) => i !== index));
  };

  const confirmAllDetected = async () => {
    if (!activeDeck) return;
    const { data: { user } } = await supabase.auth.getUser();
    const rows = detectedRooms.map((room) => {
      const cx = room.bbox_x + room.bbox_width / 2;
      const cy = room.bbox_y + room.bbox_height / 2;
      return {
        deck_view_id: activeDeck.id,
        drawing_id: null,
        deck: activeDeck.label,
        label: room.label,
        area_id: null,
        svg_polygon: room.svg_polygon,
        bbox_x: cx,
        bbox_y: cy,
        bbox_width: room.bbox_width,
        bbox_height: room.bbox_height,
        is_confirmed: true,
        source: "ai",
        created_by: user?.id,
      };
    });
    const { error } = await supabase.from("nb_deck_rooms").insert(rows);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`All ${detectedRooms.length} rooms confirmed`);
    setDetectedRooms([]);
  };

  const dismissDetectedRoom = (index: number) => {
    setDetectedRooms((prev) => prev.filter((_, i) => i !== index));
  };

  // -----------------------------------------------------------------
  // Delete a deck
  // -----------------------------------------------------------------
  const deleteDeck = async (deck: DeckView) => {
    if (!confirm(`Delete "${deck.label}"? This will also delete its hotspots.`))
      return;
    await supabase.from("nb_deck_rooms").delete().eq("deck_view_id", deck.id);
    await supabase.storage.from("nb-deck-plans").remove([deck.image_storage_path]);
    const { error } = await supabase.from("nb_deck_views").delete().eq("id", deck.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deck deleted");
    await loadDecks();
  };

  // Helper: status badge
  const statusBadge = (status: string) => {
    const s = status?.toLowerCase();
    if (s === "approved" || s === "done" || s === "decided" || s === "accepted")
      return <Badge className="bg-green-600/15 text-green-700 border-green-600/30 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />{status}</Badge>;
    if (s === "pending" || s === "draft" || s === "idea" || s === "proposed")
      return <Badge variant="secondary" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />{status}</Badge>;
    if (s === "rejected" || s === "cancelled")
      return <Badge variant="destructive" className="text-[10px]"><XCircle className="h-3 w-3 mr-1" />{status}</Badge>;
    return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  };

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------
  if (!currentProject) {
    return <div className="p-6">Select a project to view deck plans.</div>;
  }

  const linkedAreaName = activeRoom?.area_id
    ? areas.find((a) => a.id === activeRoom.area_id)?.name
    : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b bg-card px-4 py-2">
        <h1 className="text-lg font-semibold">Deck Plan</h1>
        <Badge variant="outline">{decks.length} deck{decks.length === 1 ? "" : "s"}</Badge>

        <div className="ml-auto flex items-center gap-2">
          {activeDeck && isAdmin && mode === "view" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={detectRooms}
                disabled={detecting}
              >
                {detecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ScanSearch className="mr-2 h-4 w-4" />
                )}
                {detecting ? "Detecting…" : "Auto-detect rooms"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMode("place")}>
                <MapPin className="mr-2 h-4 w-4" />
                Place marker
              </Button>
            </>
          )}
          {mode === "place" && (
            <>
              <Badge variant="secondary">
                Click on the plan to place a marker
              </Badge>
              <Button variant="ghost" size="sm" onClick={cancelPlacing}>
                <X className="mr-1 h-4 w-4" /> Cancel
              </Button>
            </>
          )}
          {isAdmin && mode === "view" && (
            <Button size="sm" onClick={() => setCropperOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add deck from PDF
            </Button>
          )}
        </div>
      </div>

      {/* Deck tabs */}
      {decks.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b bg-card/50 px-4 py-1.5">
          {decks.map((d) => (
            <div key={d.id} className="flex shrink-0 items-center">
              <Button
                variant={d.id === activeDeckId ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveDeckId(d.id)}
              >
                {d.label}
              </Button>
              {isAdmin && d.id === activeDeckId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteDeck(d)}
                  title="Delete this deck"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Viewer */}
      <div className="relative flex-1 overflow-auto bg-muted/30">
        {decks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Upload className="h-10 w-10" />
            <div>
              <p className="font-medium text-foreground">No decks yet</p>
              <p className="text-sm">
                {isAdmin
                  ? "Upload a PDF, highlight a deck region and label it."
                  : "An admin needs to add deck plans."}
              </p>
            </div>
            {isAdmin && (
              <Button onClick={() => setCropperOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add your first deck
              </Button>
            )}
          </div>
        ) : !activeDeckUrl || !activeDeck ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div
            ref={containerRef}
            className="relative flex min-h-full items-start justify-center overflow-hidden"
            onWheel={handleWheel}
            onMouseDown={handlePanStart}
            onMouseMove={handlePanMove}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
            style={{ cursor: isPanning ? "grabbing" : mode === "place" ? "crosshair" : undefined }}
          >
            {/* Zoom controls */}
            <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 shadow"
                onClick={() => setZoom((z) => Math.min(10, z * 1.3))}
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 shadow"
                onClick={() => setZoom((z) => Math.max(0.5, z / 1.3))}
                title="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 shadow"
                onClick={resetView}
                title="Reset view"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              {zoom !== 1 && (
                <Badge variant="secondary" className="text-[10px] justify-center shadow">
                  {Math.round(zoom * 100)}%
                </Badge>
              )}
            </div>

            <div
              className="relative inline-block transition-transform duration-75"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
              }}
            >
              <img
                ref={imgRef}
                src={activeDeckUrl}
                alt={activeDeck.label}
                className="block max-w-full rounded shadow"
                style={{ maxHeight: "calc(100vh - 12rem)" }}
                draggable={false}
              />
              <div
                ref={overlayRef}
                onClick={handleOverlayClick}
                className="absolute inset-0"
              >
                {/* Room markers */}
                {rooms.map((r) => {
                  const pos = getMarkerPos(r, activeDeck.image_width, activeDeck.image_height);
                  return (
                    <button
                      key={r.id}
                      className="absolute group"
                      style={{
                        left: `${pos.x}%`,
                        top: `${pos.y}%`,
                        transform: "translate(-50%, -50%)",
                        pointerEvents: mode === "view" ? "auto" : "none",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (mode === "view") openRoomDetail(r);
                      }}
                    >
                      {/* Tiny dot */}
                      <div className="h-[5px] w-[5px] rounded-full bg-destructive/50 border border-white/60 shadow-sm group-hover:scale-[2] group-hover:bg-destructive transition-all" />
                      {/* Label on hover */}
                      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 whitespace-nowrap rounded bg-background/95 px-1 py-px text-[8px] font-medium text-foreground shadow border border-border opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none max-w-[100px] truncate">
                        {r.label}
                      </span>
                    </button>
                  );
                })}

                {/* Pending marker while placing */}
                {pendingMarker && activeDeck && (
                  <div
                    className="absolute"
                    style={{
                      left: `${(pendingMarker.x / activeDeck.image_width) * 100}%`,
                      top: `${(pendingMarker.y / activeDeck.image_height) * 100}%`,
                      transform: "translate(-50%, -50%)",
                      pointerEvents: "none",
                    }}
                  >
                    <div className="h-3 w-3 rounded-full bg-primary border-2 border-white shadow animate-pulse" />
                  </div>
                )}

                {/* Detected room markers (yellow) */}
                {detectedRooms.map((r, i) => {
                  const cx = r.bbox_x + r.bbox_width / 2;
                  const cy = r.bbox_y + r.bbox_height / 2;
                  return (
                    <div
                      key={`detected-${i}`}
                      className="absolute group"
                      style={{
                        left: `${(cx / activeDeck.image_width) * 100}%`,
                        top: `${(cy / activeDeck.image_height) * 100}%`,
                        transform: "translate(-50%, -50%)",
                        pointerEvents: "none",
                      }}
                    >
                      <div className="h-2.5 w-2.5 rounded-full bg-yellow-500 border border-white shadow-sm" />
                      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 whitespace-nowrap rounded bg-yellow-500/90 px-1 py-px text-[8px] font-medium text-yellow-950 shadow max-w-[100px] truncate">
                        {r.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detected rooms confirmation panel */}
      {detectedRooms.length > 0 && (
        <div className="border-t bg-card px-4 py-3 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">
              AI-detected rooms ({detectedRooms.length})
            </h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setDetectedRooms([])}>
                Dismiss all
              </Button>
              <Button size="sm" onClick={confirmAllDetected}>
                <Check className="mr-1 h-3.5 w-3.5" />
                Confirm all
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {detectedRooms.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded border border-yellow-500/30 bg-yellow-500/5 px-3 py-1.5 text-sm"
              >
                <span className="truncate font-medium">{r.label}</span>
                <div className="flex gap-1 ml-2 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-green-600 hover:bg-green-100"
                    onClick={() => confirmDetectedRoom(i)}
                    title="Confirm"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    onClick={() => dismissDetectedRoom(i)}
                    title="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cropper dialog */}
      <DeckCropperDialog
        open={cropperOpen}
        onOpenChange={setCropperOpen}
        projectId={currentProject.id}
        nextOrder={decks.length}
        onSaved={loadDecks}
      />

      {/* Save marker dialog */}
      <Dialog open={!!pendingMarker} onOpenChange={(o) => !o && setPendingMarker(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New marker</DialogTitle>
            <DialogDescription>
              Place a labelled marker on this deck. Optionally link it to a project area to see all related data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Label</Label>
              <Input
                value={roomForm.label}
                onChange={(e) => setRoomForm({ ...roomForm, label: e.target.value })}
                placeholder="e.g. Owner's Cabin"
                autoFocus
              />
            </div>
            <div>
              <Label>Linked area (optional)</Label>
              <Select
                value={roomForm.area_id || "none"}
                onValueChange={(v) =>
                  setRoomForm({ ...roomForm, area_id: v === "none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {areas
                    .filter((a) => a.id)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingMarker(null)}>
              Cancel
            </Button>
            <Button onClick={saveRoom}>Save marker</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit marker dialog */}
      <Dialog open={!!editingRoom} onOpenChange={(o) => !o && setEditingRoom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Marker</DialogTitle>
          </DialogHeader>
          {editingRoom && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  value={editingRoom.label}
                  onChange={(e) =>
                    setEditingRoom({ ...editingRoom, label: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Linked area</Label>
                <Select
                  value={editingRoom.area_id ?? "none"}
                  onValueChange={(v) =>
                    setEditingRoom({ ...editingRoom, area_id: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              onClick={() => editingRoom && deleteRoom(editingRoom.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
            <Button
              onClick={async () => {
                if (!editingRoom) return;
                const { error } = await supabase
                  .from("nb_deck_rooms")
                  .update({
                    label: editingRoom.label.trim(),
                    area_id: editingRoom.area_id,
                  })
                  .eq("id", editingRoom.id);
                if (error) {
                  toast.error(error.message);
                  return;
                }
                setRooms((prev) =>
                  prev.map((r) =>
                    r.id === editingRoom.id
                      ? { ...r, label: editingRoom.label.trim(), area_id: editingRoom.area_id }
                      : r,
                  ),
                );
                // Update active room if it's the same
                if (activeRoom?.id === editingRoom.id) {
                  setActiveRoom({ ...activeRoom, label: editingRoom.label.trim(), area_id: editingRoom.area_id });
                  if (editingRoom.area_id) loadAreaDetail(editingRoom.area_id);
                }
                toast.success("Marker updated");
                setEditingRoom(null);
              }}
              disabled={!editingRoom?.label.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Room detail sheet */}
      <Sheet open={!!activeRoom} onOpenChange={(o) => { if (!o) setActiveRoom(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-destructive" />
              {activeRoom?.label}
            </SheetTitle>
            {linkedAreaName && (
              <p className="text-sm text-muted-foreground">
                Linked to area: <span className="font-medium text-foreground">{linkedAreaName}</span>
              </p>
            )}
          </SheetHeader>

          {isAdmin && activeRoom && (
            <Button
              variant="outline"
              size="sm"
              className="mb-4"
              onClick={() => {
                setEditingRoom({ ...activeRoom });
              }}
            >
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit marker
            </Button>
          )}

          {!activeRoom?.area_id ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <MapPin className="h-10 w-10 mb-3 opacity-40" />
              <p className="font-medium text-foreground">No area linked</p>
              <p className="text-sm mt-1">
                Link this marker to a project area to see decisions, files, approvals, equipment, and materials for this space.
              </p>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => activeRoom && setEditingRoom({ ...activeRoom })}
                >
                  Link to area
                </Button>
              )}
            </div>
          ) : loadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : areaDetail ? (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="decisions">RAID</TabsTrigger>
                <TabsTrigger value="equipment">Equip</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-3">
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-2">
                  <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">{areaDetail.files.length}</p>
                    <p className="text-[11px] text-muted-foreground">Files</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">{areaDetail.approvals.length}</p>
                    <p className="text-[11px] text-muted-foreground">Approvals</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">{areaDetail.decisions.length}</p>
                    <p className="text-[11px] text-muted-foreground">RAID Items</p>
                  </Card>
                  <Card className="p-3 text-center">
                    <p className="text-2xl font-bold">{areaDetail.equipment.length}</p>
                    <p className="text-[11px] text-muted-foreground">Equipment</p>
                  </Card>
                </div>

                {/* Approvals list */}
                {areaDetail.approvals.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Recent Approvals</h4>
                    <div className="space-y-1.5">
                      {areaDetail.approvals.slice(0, 5).map((a) => (
                        <div key={a.id} className="flex items-center justify-between text-sm border rounded px-2.5 py-1.5">
                          <span className="truncate">{a.file_name ?? "File"}</span>
                          {statusBadge(a.status)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Materials */}
                {areaDetail.materials.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Materials</h4>
                    <div className="space-y-1.5">
                      {areaDetail.materials.slice(0, 5).map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-sm border rounded px-2.5 py-1.5">
                          <span className="truncate">{m.name}</span>
                          {statusBadge(m.selection_status)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="files" className="mt-3">
                {areaDetail.files.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No files linked to this area.</p>
                ) : (
                  <div className="space-y-1.5">
                    {areaDetail.files.map((f) => (
                      <div key={f.id} className="flex items-center justify-between text-sm border rounded px-2.5 py-2">
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </div>
                        {statusBadge(f.status)}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="decisions" className="mt-3">
                {areaDetail.decisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No RAID items for this area.</p>
                ) : (
                  <div className="space-y-1.5">
                    {areaDetail.decisions.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-sm border rounded px-2.5 py-2">
                        <div className="truncate">
                          <span className="truncate">{d.title}</span>
                          <Badge variant="outline" className="ml-2 text-[9px]">{d.item_type}</Badge>
                        </div>
                        {statusBadge(d.status)}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="equipment" className="mt-3">
                {areaDetail.equipment.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No equipment for this area.</p>
                ) : (
                  <div className="space-y-1.5">
                    {areaDetail.equipment.map((eq) => (
                      <div key={eq.id} className="flex items-center justify-between text-sm border rounded px-2.5 py-2">
                        <span className="truncate">{eq.name}</span>
                        {statusBadge(eq.status)}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// =====================================================================
// Cropper dialog: pick a PDF, choose a page, drag a rectangle, label, save
// =====================================================================

function DeckCropperDialog({
  open,
  onOpenChange,
  projectId,
  nextOrder,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  nextOrder: number;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [renderedSize, setRenderedSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  // Width (in CSS px) available to render the PDF page in the dialog.
  // Updated on mount and on resize so the page always fits horizontally.
  const [previewWidth, setPreviewWidth] = useState<number>(900);
  const previewWrapRef = useRef<HTMLDivElement>(null);

  // Crop rectangle in *rendered preview* pixel coords
  const [crop, setCrop] = useState<
    { x: number; y: number; w: number; h: number } | null
  >(null);
  const [dragging, setDragging] = useState<
    { startX: number; startY: number } | null
  >(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
   // Aspect ratio removed – users upload full-page PDFs now.

  // Reset everything when closed
  useEffect(() => {
    if (open) return;
    setFile(null);
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl(null);
    setNumPages(0);
    setPageNumber(1);
    setRenderedSize(null);
    setCrop(null);
    setDragging(null);
    setLabel("");
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(f);
    setFileUrl(URL.createObjectURL(f));
    setCrop(null);
    setPageNumber(1);
  };

  const onPageRendered = (page: { width: number; height: number; originalWidth: number; originalHeight: number }) => {
    setRenderedSize({ w: page.width, h: page.height });
    setCrop(null);
  };

  // Track available width so PDF page always fits the dialog horizontally.
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = previewWrapRef.current;
      if (!el) return;
      // subtract padding (p-2 = 8px each side) so the page never overflows
      const w = Math.max(320, el.clientWidth - 16);
      setPreviewWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (previewWrapRef.current) ro.observe(previewWrapRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open, fileUrl]);

  // Drag-to-select rectangle
  const onMouseDown = (e: React.MouseEvent) => {
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragging({ startX: x, startY: y });
    setCrop({ x, y, w: 0, h: 0 });
  };
   const onMouseMove = (e: React.MouseEvent) => {
     if (!dragging || !previewRef.current) return;
     const rect = previewRef.current.getBoundingClientRect();
     const x = e.clientX - rect.left;
     const y = e.clientY - rect.top;
     const dx = x - dragging.startX;
     const dy = y - dragging.startY;
     const endX = dragging.startX + dx;
     const endY = dragging.startY + dy;
     const minX = Math.min(dragging.startX, endX);
     const minY = Math.min(dragging.startY, endY);
     setCrop({
       x: minX,
       y: minY,
       w: Math.abs(dx),
       h: Math.abs(dy),
     });
   };
   const onMouseUp = () => setDragging(null);

   const handleSave = async () => {
     if (!file || !fileUrl || !renderedSize) {
       toast.error("Please upload a PDF first");
       return;
     }
    if (!label.trim()) {
      toast.error("Give this deck a label");
      return;
    }
    setSaving(true);
    try {
      // The cropper preview rendered the page scaled to fit the dialog width.
      // Compute the actual scale used (rendered px / PDF points) so we can
      // translate the crop rectangle back into PDF coordinate space.
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const previewScale = renderedSize.w / baseViewport.width;

       // If user drew a crop, use it; otherwise use full page
       const hasCrop = crop && crop.w >= 10 && crop.h >= 10;
       const cropPdfX = hasCrop ? crop.x / previewScale : 0;
       const cropPdfY = hasCrop ? crop.y / previewScale : 0;
       const cropPdfW = hasCrop ? crop.w / previewScale : baseViewport.width;
       const cropPdfH = hasCrop ? crop.h / previewScale : baseViewport.height;

      const viewport = page.getViewport({ scale: CROP_RENDER_SCALE });

      const fullCanvas = document.createElement("canvas");
      fullCanvas.width = Math.ceil(viewport.width);
      fullCanvas.height = Math.ceil(viewport.height);
      const fullCtx = fullCanvas.getContext("2d", { alpha: false });
      if (!fullCtx) throw new Error("Canvas not supported");
      fullCtx.fillStyle = "#ffffff";
      fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
      await page.render({
        canvas: fullCanvas,
        canvasContext: fullCtx,
        viewport,
      } as any).promise;

      const sx = cropPdfX * CROP_RENDER_SCALE;
      const sy = cropPdfY * CROP_RENDER_SCALE;
      const sw = cropPdfW * CROP_RENDER_SCALE;
      const sh = cropPdfH * CROP_RENDER_SCALE;

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = Math.ceil(sw);
      cropCanvas.height = Math.ceil(sh);
      const cropCtx = cropCanvas.getContext("2d", { alpha: false });
      if (!cropCtx) throw new Error("Canvas not supported");
      cropCtx.fillStyle = "#ffffff";
      cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
      cropCtx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

      const blob: Blob = await new Promise((resolve, reject) =>
        cropCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Failed to encode PNG"))),
          "image/png",
        ),
      );

      const filename = `${projectId}/decks/${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabase.storage
        .from("deck-plans")
        .upload(filename, blob, { contentType: "image/png", upsert: false });
      if (upErr) throw upErr;

      const { data: { user } } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from("nb_deck_views").insert({
        project_id: projectId,
        label: label.trim(),
        display_order: nextOrder,
        image_storage_path: filename,
        image_width: cropCanvas.width,
        image_height: cropCanvas.height,
        source_page_number: pageNumber,
        source_crop_x: cropPdfX,
        source_crop_y: cropPdfY,
        source_crop_width: cropPdfW,
        source_crop_height: cropPdfH,
        created_by: user?.id,
      });
      if (insErr) throw insErr;

      toast.success(`Saved "${label.trim()}"`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save deck");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add a deck from a PDF</DialogTitle>
           <DialogDescription>
             Upload a PDF and choose the page. The full page will be saved as a deck image. Optionally, drag a rectangle to crop a specific region.
           </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* File picker + page selector */}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="file"
              accept="application/pdf"
              onChange={onFileChange}
              className="max-w-sm"
            />
            {numPages > 0 && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Page</Label>
                <Select
                  value={String(pageNumber)}
                  onValueChange={(v) => {
                    setPageNumber(Number(v));
                    setCrop(null);
                  }}
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: numPages }, (_, i) => (
                      <SelectItem key={i} value={String(i + 1)}>
                        Page {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Deck label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Sun Deck"
                className="w-[220px]"
              />
            </div>
          </div>

          {/* Preview */}
          <div ref={previewWrapRef} className="max-h-[70vh] overflow-auto rounded border bg-muted/30 p-2">
            {!fileUrl ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Upload className="h-8 w-8" />
                <p className="text-sm">Choose a PDF to begin</p>
              </div>
            ) : (
              <Document
                file={fileUrl}
                onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
                loading={
                  <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                }
                error={<div className="p-4 text-destructive">Failed to load PDF.</div>}
              >
                <div
                  ref={previewRef}
                  className="relative inline-block cursor-crosshair select-none"
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={onMouseUp}
                  onMouseLeave={onMouseUp}
                >
                  <Page
                    pageNumber={pageNumber}
                    width={previewWidth}
                    onLoadSuccess={onPageRendered}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                  />
                  {crop && renderedSize && (
                    <div
                      className="pointer-events-none absolute border-2 border-primary bg-primary/10"
                      style={{
                        left: crop.x,
                        top: crop.y,
                        width: crop.w,
                        height: crop.h,
                      }}
                    />
                  )}
                </div>
              </Document>
            )}
          </div>

           {fileUrl && (
             <p className="text-xs text-muted-foreground">
               Tip: the full page will be used. Optionally drag a rectangle to crop a specific area.
             </p>
           )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save deck
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

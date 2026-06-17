import { useState, useCallback } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Flag, Plus, Calendar, CheckCircle2, Clock, Pause, Target,
  ChevronRight, Pencil, Trash2,
} from "lucide-react";
import { format } from "date-fns";

type PhaseStatus = "planned" | "active" | "completed" | "on_hold";

const STATUS_META: Record<PhaseStatus, { label: string; icon: typeof Clock; className: string }> = {
  planned: { label: "Planned", icon: Clock, className: "bg-muted text-muted-foreground" },
  active: { label: "Active", icon: Target, className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  completed: { label: "Completed", icon: CheckCircle2, className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  on_hold: { label: "On Hold", icon: Pause, className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
};

export default function Phases() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const projectId = currentProject?.id;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [phaseDialogOpen, setPhaseDialogOpen] = useState(false);
  const [editingPhase, setEditingPhase] = useState<any>(null);

  // ─── Queries ───
  const { data: phases = [] } = useQuery({
    queryKey: ["build_phases", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("build_phases")
        .select("*")
        .eq("project_id", projectId!)
        .order("display_order");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ["milestones", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("milestones")
        .select("*")
        .eq("project_id", projectId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  const { data: scheduleTasks = [] } = useQuery({
    queryKey: ["phase_schedule_tasks", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_tasks")
        .select("id, task_name, start_date, end_date, percent_complete, phase_id")
        .eq("project_id", projectId!);
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });

  // ─── Mutations ───
  const updatePhase = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await supabase.from("build_phases").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["build_phases"] });
      toast({ title: "Phase updated" });
    },
  });

  const createMilestone = useMutation({
    mutationFn: async (ms: any) => {
      const { error } = await supabase.from("milestones").insert(ms);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones"] });
      setMilestoneDialogOpen(false);
      toast({ title: "Milestone added" });
    },
  });

  const toggleMilestone = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const updates: any = { is_completed };
      if (is_completed) {
        updates.actual_date = new Date().toISOString().split("T")[0];
        updates.completed_by = user?.id;
      } else {
        updates.actual_date = null;
        updates.completed_by = null;
      }
      const { error } = await supabase.from("milestones").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["milestones"] }),
  });

  const deleteMilestone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("milestones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones"] });
      toast({ title: "Milestone deleted" });
    },
  });

  const updateMilestone = useMutation({
    mutationFn: async ({ id, target_date, actual_date, is_completed, completed_by }: {
      id: string; target_date?: string | null; actual_date?: string | null; is_completed?: boolean; completed_by?: string | null;
    }) => {
      const updates: Record<string, any> = {};
      if (target_date !== undefined) updates.target_date = target_date;
      if (actual_date !== undefined) updates.actual_date = actual_date;
      if (is_completed !== undefined) updates.is_completed = is_completed;
      if (completed_by !== undefined) updates.completed_by = completed_by;
      const { error } = await supabase.from("milestones").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones"] });
      toast({ title: "Milestone updated" });
    },
  });

  // ─── Helpers ───
  const selectedPhase = phases.find((p) => p.id === selectedPhaseId) || phases[0];
  const phaseMilestones = milestones.filter((m) => m.phase_id === selectedPhase?.id);
  const phaseTasks = scheduleTasks.filter((t) => t.phase_id === selectedPhase?.id);

  const getPhaseProgress = (phaseId: string) => {
    const ms = milestones.filter((m) => m.phase_id === phaseId);
    if (!ms.length) return 0;
    return Math.round((ms.filter((m) => m.is_completed).length / ms.length) * 100);
  };

  if (!projectId) return <div className="p-8 text-muted-foreground">Select a project first.</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Build Phases
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track progress through design, engineering, construction, outfitting, and commissioning
          </p>
        </div>
      </div>

      {/* ─── Phase Timeline ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" /> Phase Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-stretch gap-1">
            {phases.map((phase, idx) => {
              const progress = getPhaseProgress(phase.id);
              const status = phase.status as PhaseStatus;
              const meta = STATUS_META[status];
              const isSelected = selectedPhase?.id === phase.id;

              return (
                <button
                  key={phase.id}
                  onClick={() => setSelectedPhaseId(phase.id)}
                  className={`flex-1 rounded-lg p-3 text-left transition-all border-2 ${
                    isSelected
                      ? "border-primary shadow-md"
                      : "border-transparent hover:border-muted-foreground/20"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: phase.colour || "#2563EB" }}
                    />
                    <span className="text-xs font-semibold truncate">{phase.name}</span>
                  </div>
                  <Progress value={progress} className="h-1.5 mb-1.5" />
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${meta.className}`}>
                      {meta.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{progress}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ─── Selected Phase Detail ─── */}
      {selectedPhase && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Phase Info */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{selectedPhase.name}</CardTitle>
                <Select
                  value={selectedPhase.status}
                  onValueChange={(v) => updatePhase.mutate({ id: selectedPhase.id, status: v })}
                >
                  <SelectTrigger className="w-28 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {selectedPhase.description && (
                <p className="text-muted-foreground">{selectedPhase.description}</p>
              )}
              <Separator />
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Planned start</span>
                  <span>{selectedPhase.planned_start_date ? format(new Date(selectedPhase.planned_start_date), "dd MMM yyyy") : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Planned end</span>
                  <span>{selectedPhase.planned_end_date ? format(new Date(selectedPhase.planned_end_date), "dd MMM yyyy") : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Actual start</span>
                  <span>{selectedPhase.actual_start_date ? format(new Date(selectedPhase.actual_start_date), "dd MMM yyyy") : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Actual end</span>
                  <span>{selectedPhase.actual_end_date ? format(new Date(selectedPhase.actual_end_date), "dd MMM yyyy") : "—"}</span>
                </div>
              </div>
              <Separator />
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Milestones</span>
                  <span>{phaseMilestones.filter((m) => m.is_completed).length}/{phaseMilestones.length}</span>
                </div>
                <Progress value={getPhaseProgress(selectedPhase.id)} className="h-2" />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Linked schedule tasks</span>
                <span>{phaseTasks.length}</span>
              </div>

              {/* Edit dates */}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => { setEditingPhase(selectedPhase); setPhaseDialogOpen(true); }}
              >
                <Pencil className="h-3 w-3 mr-1" /> Edit Dates
              </Button>
            </CardContent>
          </Card>

          {/* Milestones */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" /> Milestones
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => setMilestoneDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Milestone
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {phaseMilestones.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No milestones yet. Add key deliverables and gate reviews for this phase.
                </p>
              ) : (
                <div className="space-y-2">
                  {phaseMilestones.map((ms) => (
                    <MilestoneRow
                      key={ms.id}
                      milestone={ms}
                      onToggle={(id, val) => toggleMilestone.mutate({ id, is_completed: val })}
                      onUpdate={(id, updates) => updateMilestone.mutate({ id, ...updates })}
                      onDelete={(id) => deleteMilestone.mutate(id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Add Milestone Dialog ─── */}
      <MilestoneDialog
        open={milestoneDialogOpen}
        onOpenChange={setMilestoneDialogOpen}
        onSubmit={(data) =>
          createMilestone.mutate({
            ...data,
            project_id: projectId,
            phase_id: selectedPhase?.id,
            created_by: user?.id,
          })
        }
      />

      {/* ─── Edit Phase Dates Dialog ─── */}
      <PhaseDateDialog
        open={phaseDialogOpen}
        onOpenChange={setPhaseDialogOpen}
        phase={editingPhase}
        onSubmit={(data) => {
          updatePhase.mutate({ id: editingPhase.id, ...data });
          setPhaseDialogOpen(false);
        }}
      />
    </div>
  );
}

// ─── Milestone Dialog ───
function MilestoneDialog({
  open, onOpenChange, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: { name: string; description: string; target_date: string | null; sort_order: number }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      target_date: targetDate || null,
      sort_order: 0,
    });
    setName("");
    setDescription("");
    setTargetDate("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Milestone</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Class approval received" />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Target Date</Label>
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>Add Milestone</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Phase Date Editor Dialog ───
function PhaseDateDialog({
  open, onOpenChange, phase, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phase: any;
  onSubmit: (data: any) => void;
}) {
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [actualStart, setActualStart] = useState("");
  const [actualEnd, setActualEnd] = useState("");

  // Sync from phase when dialog opens
  const initFromPhase = () => {
    if (!phase) return;
    setPlannedStart(phase.planned_start_date || "");
    setPlannedEnd(phase.planned_end_date || "");
    setActualStart(phase.actual_start_date || "");
    setActualEnd(phase.actual_end_date || "");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) initFromPhase(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {phase?.name} Dates</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Planned Start</Label>
            <Input type="date" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
          </div>
          <div>
            <Label>Planned End</Label>
            <Input type="date" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
          </div>
          <div>
            <Label>Actual Start</Label>
            <Input type="date" value={actualStart} onChange={(e) => setActualStart(e.target.value)} />
          </div>
          <div>
            <Label>Actual End</Label>
            <Input type="date" value={actualEnd} onChange={(e) => setActualEnd(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSubmit({
            planned_start_date: plannedStart || null,
            planned_end_date: plannedEnd || null,
            actual_start_date: actualStart || null,
            actual_end_date: actualEnd || null,
          })}>
            Save Dates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inline Milestone Row ───
function MilestoneRow({
  milestone: ms,
  onToggle,
  onUpdate,
  onDelete,
}: {
  milestone: any;
  onToggle: (id: string, val: boolean) => void;
  onUpdate: (id: string, updates: { target_date?: string | null; actual_date?: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [targetDate, setTargetDate] = useState(ms.target_date || "");
  const [actualDate, setActualDate] = useState(ms.actual_date || "");

  const handleSave = () => {
    onUpdate(ms.id, {
      target_date: targetDate || null,
      actual_date: actualDate || null,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setTargetDate(ms.target_date || "");
    setActualDate(ms.actual_date || "");
    setEditing(false);
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
        ms.is_completed ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900" : "bg-card"
      }`}
    >
      <button
        onClick={() => onToggle(ms.id, !ms.is_completed)}
        className="shrink-0 mt-0.5"
      >
        <CheckCircle2
          className={`h-5 w-5 transition-colors ${
            ms.is_completed ? "text-green-600 fill-green-600" : "text-muted-foreground/40 hover:text-primary"
          }`}
        />
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${ms.is_completed ? "line-through text-muted-foreground" : ""}`}>
          {ms.name}
        </p>
        {ms.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{ms.description}</p>
        )}

        {editing ? (
          <div className="mt-2 flex items-end gap-2 flex-wrap">
            <div>
              <Label className="text-[10px] text-muted-foreground">Target Date</Label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="h-7 text-xs w-36"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Actual Date</Label>
              <Input
                type="date"
                value={actualDate}
                onChange={(e) => setActualDate(e.target.value)}
                className="h-7 text-xs w-36"
              />
            </div>
            <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleSave}>
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-3 flex-wrap">
            {ms.target_date && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(new Date(ms.target_date), "dd MMM yyyy")}
              </span>
            )}
            {ms.actual_date && (
              <Badge variant="outline" className="text-[10px] bg-green-50 dark:bg-green-950">
                ✓ {format(new Date(ms.actual_date), "dd MMM")}
              </Badge>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-muted-foreground/40 hover:text-primary transition-colors"
            title="Edit dates"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => onDelete(ms.id)}
          className="text-muted-foreground/40 hover:text-destructive transition-colors"
          title="Delete milestone"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

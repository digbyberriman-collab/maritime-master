import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { itemTypeLabels, raidStatusLabels, type RaidItemType, type RaidStatus } from "./RaidItemCard";

export interface RaidFormData {
  title: string;
  item_type: RaidItemType;
  raid_status: RaidStatus;
  decision_text: string;
  reasoning: string;
  background: string;
  date: string;
  area_id: string;
  notes: string;
  assigned_owner: string;
  source_reference: string;
}

export const emptyRaidForm: RaidFormData = {
  title: "",
  item_type: "decision",
  raid_status: "current",
  decision_text: "",
  reasoning: "",
  background: "",
  date: "",
  area_id: "",
  notes: "",
  assigned_owner: "",
  source_reference: "",
};

interface RaidItemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: RaidFormData;
  onChange: (form: RaidFormData) => void;
  onSubmit: () => void;
  isPending: boolean;
  isEditing: boolean;
  areas: { id: string; name: string }[];
}

export function RaidItemForm({ open, onOpenChange, form, onChange, onSubmit, isPending, isEditing, areas }: RaidItemFormProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Item" : "Add RAID Item"}</DialogTitle>
          <DialogDescription>Track decisions, assumptions, risks, and issues.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
          className="space-y-4 mt-2"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={form.item_type} onValueChange={(v) => onChange({ ...form, item_type: v as RaidItemType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(itemTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.raid_status} onValueChange={(v) => onChange({ ...form, raid_status: v as RaidStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(raidStatusLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" value={form.title} onChange={(e) => onChange({ ...form, title: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.decision_text} onChange={(e) => onChange({ ...form, decision_text: e.target.value })} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Background / Mitigation</Label>
            <Textarea value={form.background} onChange={(e) => onChange({ ...form, background: e.target.value })} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Reasoning</Label>
            <Textarea value={form.reasoning} onChange={(e) => onChange({ ...form, reasoning: e.target.value })} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date Raised</Label>
              <Input type="date" value={form.date} onChange={(e) => onChange({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Area</Label>
              <Select value={form.area_id || "none"} onValueChange={(v) => onChange({ ...form, area_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Owner</Label>
              <Input value={form.assigned_owner} onChange={(e) => onChange({ ...form, assigned_owner: e.target.value })} placeholder="Who owns this item?" />
            </div>
            <div className="space-y-2">
              <Label>Source Reference</Label>
              <Input value={form.source_reference} onChange={(e) => onChange({ ...form, source_reference: e.target.value })} placeholder="e.g. Ref 1 - Part 0" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => onChange({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEditing ? "Update" : "Add Item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

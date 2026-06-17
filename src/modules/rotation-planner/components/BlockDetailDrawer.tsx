import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { RotationAssignment, PlannerLane, ConflictInfo } from '../types';
import { ROTATION_TYPE_LABELS, STATUS_LABELS } from '../constants';
import type { VesselLite, CrewLite } from '../hooks/useVesselsAndCrew';
import { AlertTriangle, Trash2, Copy, Scissors } from 'lucide-react';

interface Props {
  assignment: RotationAssignment | null;
  open: boolean;
  onClose: () => void;
  onSave: (a: Partial<RotationAssignment> & { id?: string }) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (a: RotationAssignment) => void;
  onSplit?: (a: RotationAssignment) => void;
  lanes: PlannerLane[];
  vessels: VesselLite[];
  crew: CrewLite[];
  conflicts?: ConflictInfo[];
}

const BlockDetailDrawer: React.FC<Props> = ({
  assignment, open, onClose, onSave, onDelete, onDuplicate, onSplit,
  lanes, vessels, crew, conflicts,
}) => {
  const [form, setForm] = useState<Partial<RotationAssignment>>({});
  useEffect(() => { setForm(assignment ?? {}); }, [assignment]);

  if (!assignment) return null;

  const update = (k: keyof RotationAssignment, v: any) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Rotation block</SheetTitle>
        </SheetHeader>

        {conflicts && conflicts.length > 0 && (
          <div className="mt-3 p-2 rounded border border-destructive/40 bg-destructive/5 text-xs text-destructive flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div>{conflicts.map((c) => c.reason).join(' · ')}</div>
          </div>
        )}

        <div className="space-y-3 mt-4 text-sm">
          <div>
            <Label>Label</Label>
            <Input value={form.label ?? ''} onChange={(e) => update('label', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Start</Label>
              <Input type="date" value={form.start_date ?? ''} onChange={(e) => update('start_date', e.target.value)} />
            </div>
            <div>
              <Label>End</Label>
              <Input type="date" value={form.end_date ?? ''} onChange={(e) => update('end_date', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Type</Label>
              <Select value={form.rotation_type ?? 'onboard'} onValueChange={(v) => update('rotation_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROTATION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status ?? 'draft'} onValueChange={(v) => update('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Vessel</Label>
            <Select value={form.vessel_id ?? ''} onValueChange={(v) => update('vessel_id', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Lane / role</Label>
            <Select value={form.lane_id ?? ''} onValueChange={(v) => update('lane_id', v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {lanes.filter((l) => !form.vessel_id || l.vessel_id === form.vessel_id).map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.lane_label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Crew member</Label>
            <Select value={form.crew_user_id ?? ''} onValueChange={(v) => update('crew_user_id', v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                {crew.map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.user_id.slice(0, 8)}
                    {c.rank ? ` · ${c.rank}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Colour</Label>
            <Input type="color" value={form.colour ?? '#16a34a'} onChange={(e) => update('colour', e.target.value)} className="h-9 w-16 p-1" />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes ?? ''} onChange={(e) => update('notes', e.target.value)} />
          </div>
        </div>

        <SheetFooter className="mt-4 gap-2 flex-row flex-wrap">
          {onDuplicate && <Button variant="outline" size="sm" onClick={() => onDuplicate(assignment)}><Copy className="h-4 w-4 mr-1" />Duplicate</Button>}
          {onSplit && <Button variant="outline" size="sm" onClick={() => onSplit(assignment)}><Scissors className="h-4 w-4 mr-1" />Split</Button>}
          <Button variant="destructive" size="sm" onClick={() => { onDelete(assignment.id); onClose(); }}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => { onSave({ ...form, id: assignment.id }); onClose(); }}>Save</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default BlockDetailDrawer;
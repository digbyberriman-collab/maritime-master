import React, { useState } from 'react';
import { Check, Loader2, Pencil, Ship, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/modules/hris/lib/format';
import { assignmentDays, END_REASONS, isoDay, type AssignmentPatch, type AssignmentRecord } from '@/modules/hris/lib/employmentHistory';

interface AssignmentsTableProps {
  assignments: AssignmentRecord[];
  today: Date;
  canEdit: boolean;
  isLoading?: boolean;
  isSaving?: boolean;
  onSave: (assignment: AssignmentRecord, patch: AssignmentPatch) => Promise<unknown>;
  /** Right-hand header slot (e.g. the CSV export button). */
  actions?: React.ReactNode;
}

interface Draft {
  join_date: string;
  leave_date: string;
  position: string;
  rank: string;
  end_reason: string;
  notes: string;
}

const NONE = '__none__';

const toDraft = (a: AssignmentRecord): Draft => ({
  join_date: a.join_date.slice(0, 10),
  leave_date: a.leave_date ? a.leave_date.slice(0, 10) : '',
  position: a.position,
  rank: a.rank ?? '',
  end_reason: a.end_reason ?? NONE,
  notes: a.notes ?? '',
});

const reasonLabel = (value: string | null): string => END_REASONS.find((r) => r.value === value)?.label ?? (value ?? '—');

/**
 * One row per crew_assignments record, newest first, with inline editing
 * for HR editors. Dates use native date inputs so the row stays compact.
 */
export const AssignmentsTable: React.FC<AssignmentsTableProps> = ({ assignments, today, canEdit, isLoading, isSaving, onSave, actions }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (a: AssignmentRecord) => {
    setEditingId(a.id);
    setDraft(toDraft(a));
    setError(null);
  };

  const cancel = () => {
    setEditingId(null);
    setDraft(null);
    setError(null);
  };

  const save = async (a: AssignmentRecord) => {
    if (!draft) return;
    if (!draft.join_date) {
      setError('Join date is required.');
      return;
    }
    if (!draft.position.trim()) {
      setError('Position is required.');
      return;
    }
    if (draft.leave_date && draft.leave_date < draft.join_date) {
      setError('Leave date cannot be before the join date.');
      return;
    }
    const patch: AssignmentPatch = {
      join_date: draft.join_date,
      leave_date: draft.leave_date || null,
      position: draft.position.trim(),
      rank: draft.rank.trim() || null,
      end_reason: draft.leave_date ? (draft.end_reason === NONE ? null : draft.end_reason) : null,
      notes: draft.notes.trim() || null,
    };
    try {
      await onSave(a, patch);
      cancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save changes.');
    }
  };

  const update = (key: keyof Draft, value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Ship className="h-4 w-4 text-muted-foreground" />
          Assignments
          {!isLoading && <span className="text-sm font-normal text-muted-foreground">· {assignments.length}</span>}
        </CardTitle>
        {actions}
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {isLoading ? (
          <div className="space-y-2 px-6 pb-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : assignments.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">No vessel assignments recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Vessel</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="min-w-[180px]">Notes</TableHead>
                  {canEdit && <TableHead className="w-[88px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => {
                  const editing = editingId === a.id && draft;
                  const onBoard = !a.leave_date || a.leave_date.slice(0, 10) > isoDay(today);
                  if (editing) {
                    return (
                      <React.Fragment key={a.id}>
                        <TableRow className="bg-muted/30 align-top">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {a.vessel_name ?? 'Unknown vessel'}
                              {onBoard && <Badge className="text-[10px]">Current</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input value={draft.position} onChange={(e) => update('position', e.target.value)} className="h-8" aria-label="Position" />
                          </TableCell>
                          <TableCell>
                            <Input value={draft.rank} onChange={(e) => update('rank', e.target.value)} className="h-8" placeholder="—" aria-label="Rank" />
                          </TableCell>
                          <TableCell>
                            <Input type="date" value={draft.join_date} onChange={(e) => update('join_date', e.target.value)} className="h-8" aria-label="Join date" />
                          </TableCell>
                          <TableCell>
                            <Input type="date" value={draft.leave_date} onChange={(e) => update('leave_date', e.target.value)} className="h-8" aria-label="Leave date" />
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {assignmentDays({ join_date: draft.join_date, leave_date: draft.leave_date || null }, today)}
                          </TableCell>
                          <TableCell>
                            <Select value={draft.end_reason} onValueChange={(v) => update('end_reason', v)} disabled={!draft.leave_date}>
                              <SelectTrigger className="h-8" aria-label="End reason">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent className="bg-popover">
                                <SelectItem value={NONE}>—</SelectItem>
                                {END_REASONS.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Textarea value={draft.notes} onChange={(e) => update('notes', e.target.value)} rows={2} className="min-h-[32px] resize-none text-xs" aria-label="Notes" />
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => save(a)} disabled={isSaving} aria-label="Save">
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-500" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancel} disabled={isSaving} aria-label="Cancel">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {error && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={9} className="py-2 text-xs text-destructive">
                              {error}
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  }
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {a.vessel_name ?? 'Unknown vessel'}
                          {onBoard && <Badge className="text-[10px]">Current</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{a.position}</TableCell>
                      <TableCell className="text-muted-foreground">{a.rank ?? '—'}</TableCell>
                      <TableCell className="tabular-nums">{formatDate(a.join_date)}</TableCell>
                      <TableCell className="tabular-nums">{a.leave_date ? formatDate(a.leave_date) : <span className="text-muted-foreground">On board</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{assignmentDays(a, today)}</TableCell>
                      <TableCell className="text-muted-foreground">{a.leave_date ? reasonLabel(a.end_reason) : '—'}</TableCell>
                      <TableCell className="max-w-[260px] whitespace-pre-line text-xs text-muted-foreground">{a.notes ?? '—'}</TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex justify-end">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(a)} disabled={Boolean(editingId)} aria-label="Edit assignment">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AssignmentsTable;

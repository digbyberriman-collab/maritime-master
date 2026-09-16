import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, X, CheckCircle2, ArrowRightLeft, Scissors, UserMinus, Trash2, ExternalLink, Wand2 } from 'lucide-react';
import type { ConflictItem } from '../lib/conflicts';
import type { RotationAssignment } from '../types';
import { addDays, fromISO, toISO, differenceInCalendarDays } from '../lib/dateMath';

export interface ConflictResolution {
  label: string;
  updates: (Partial<RotationAssignment> & { id: string })[];
  deletes?: string[];
}

interface Props {
  items: ConflictItem[];
  assignmentsById: Map<string, RotationAssignment>;
  crewName: (id: string | null) => string;
  laneName: (id: string | null) => string;
  canEdit: boolean;
  onApply: (res: ConflictResolution) => void;
  onOpenBlock: (id: string) => void;
  onClose: () => void;
}

/** Suggested fixes for a single conflict, computed from the two blocks involved. */
function resolutionsFor(
  item: ConflictItem,
  byId: Map<string, RotationAssignment>
): ConflictResolution[] {
  const primary = byId.get(item.primaryId);
  if (!primary) return [];
  const out: ConflictResolution[] = [];

  if (item.kind === 'overlap' && item.otherId) {
    const other = byId.get(item.otherId);
    if (!other) return [];
    const earlier = other.start_date <= primary.start_date ? other : primary;
    const later = earlier === other ? primary : other;

    const trimmedEnd = toISO(addDays(fromISO(later.start_date), -1));
    if (trimmedEnd >= earlier.start_date) {
      out.push({
        label: 'Trim the earlier block',
        updates: [{ id: earlier.id, end_date: trimmedEnd }],
      });
    }

    const duration = differenceInCalendarDays(fromISO(later.end_date), fromISO(later.start_date));
    const newStart = addDays(fromISO(earlier.end_date), 1);
    out.push({
      label: 'Move the later block after it',
      updates: [{ id: later.id, start_date: toISO(newStart), end_date: toISO(addDays(newStart, duration)) }],
    });

    out.push({
      label: 'Leave the later block unassigned',
      updates: [{ id: later.id, crew_user_id: null, status: 'draft' }],
    });

    out.push({
      label: 'Delete the later block',
      updates: [],
      deletes: [later.id],
    });
  }

  if (item.kind === 'leave') {
    if (item.overlapStart > primary.start_date) {
      out.push({
        label: 'End the block before the leave starts',
        updates: [{ id: primary.id, end_date: toISO(addDays(fromISO(item.overlapStart), -1)) }],
      });
    }
    if (item.overlapEnd < primary.end_date) {
      out.push({
        label: 'Start the block after the leave ends',
        updates: [{ id: primary.id, start_date: toISO(addDays(fromISO(item.overlapEnd), 1)) }],
      });
    }
    out.push({ label: 'Record this block as leave', updates: [{ id: primary.id, rotation_type: 'leave' }] });
    out.push({ label: 'Leave the block unassigned', updates: [{ id: primary.id, crew_user_id: null, status: 'draft' }] });
    out.push({ label: 'Delete the block', updates: [], deletes: [primary.id] });
  }

  return out;
}

const ICONS: Record<string, React.ReactNode> = {
  'Trim the earlier block': <Scissors className="h-3.5 w-3.5" />,
  'Move the later block after it': <ArrowRightLeft className="h-3.5 w-3.5" />,
  'End the block before the leave starts': <Scissors className="h-3.5 w-3.5" />,
  'Start the block after the leave ends': <Scissors className="h-3.5 w-3.5" />,
};

const ConflictPanel: React.FC<Props> = ({
  items, assignmentsById, crewName, laneName, canEdit, onApply, onOpenBlock, onClose,
}) => {
  const [expanded, setExpanded] = useState<string | null>(items[0]?.key ?? null);

  const grouped = useMemo(() => {
    const m = new Map<string, ConflictItem[]>();
    for (const it of items) {
      const key = it.crewLabel || (it.crewId ? crewName(it.crewId) || 'Unnamed crew' : 'Unassigned');
      const arr = m.get(key) ?? [];
      arr.push(it);
      m.set(key, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items, crewName]);

  return (
    <aside className="w-[360px] shrink-0 border-l bg-card flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <div className="text-sm font-medium">Conflicts</div>
        <Badge variant={items.length ? 'destructive' : 'secondary'}>{items.length}</Badge>
        <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={onClose} aria-label="Close conflicts panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground p-6 text-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          No clashes in the current view.
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-3">
            {grouped.map(([person, list]) => (
              <div key={person}>
                <div className="px-1 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{person}</div>
                <div className="space-y-2">
                  {list.map((it) => {
                    const primary = assignmentsById.get(it.primaryId);
                    const other = it.otherId ? assignmentsById.get(it.otherId) : null;
                    const open = expanded === it.key;
                    const fixes = open ? resolutionsFor(it, assignmentsById) : [];
                    return (
                      <div key={it.key} className="rounded-md border p-2 text-xs">
                        <button
                          className="w-full text-left"
                          onClick={() => setExpanded(open ? null : it.key)}
                        >
                          <div className="font-medium text-destructive flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {it.reason}
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            {it.overlapStart} → {it.overlapEnd}
                          </div>
                          {primary && (
                            <div className="mt-1">
                              <span className="font-medium">{primary.label || 'Rotation'}</span>{' '}
                              <span className="text-muted-foreground">
                                {laneName(primary.lane_id)} · {primary.start_date} → {primary.end_date}
                              </span>
                            </div>
                          )}
                          {other && (
                            <div>
                              <span className="font-medium">{other.label || 'Rotation'}</span>{' '}
                              <span className="text-muted-foreground">
                                {laneName(other.lane_id)} · {other.start_date} → {other.end_date}
                              </span>
                            </div>
                          )}
                        </button>

                        {open && (
                          <div className="mt-2 pt-2 border-t space-y-1">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Wand2 className="h-3.5 w-3.5" /> Suggested fixes
                            </div>
                            {canEdit ? fixes.map((f) => (
                              <Button
                                key={f.label}
                                variant="outline"
                                size="sm"
                                className="w-full justify-start h-7 text-xs"
                                onClick={() => onApply(f)}
                              >
                                <span className="mr-1.5">
                                  {ICONS[f.label] ?? (f.deletes?.length
                                    ? <Trash2 className="h-3.5 w-3.5" />
                                    : <UserMinus className="h-3.5 w-3.5" />)}
                                </span>
                                {f.label}
                              </Button>
                            )) : (
                              <div className="text-muted-foreground">You have view-only access, so fixes are disabled.</div>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start h-7 text-xs"
                              onClick={() => onOpenBlock(it.primaryId)}
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open block details
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </aside>
  );
};

export default ConflictPanel;

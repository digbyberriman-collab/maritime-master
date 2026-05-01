import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { WorkRestBlock } from '../types';

const MINUTES_PER_DAY = 1440;

function fmtTime(min: number) {
  const m = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(min)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function parseTime(value: string): number | null {
  const parts = value.split(':');
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 24 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

interface Props {
  date: string;
  blocks: WorkRestBlock[];
  onChange: (blocks: WorkRestBlock[]) => void;
  disabled?: boolean;
  height?: number;
}

/**
 * 24-hour horizontal timeline. Click & drag empty space to create a work
 * block. Click an existing work block to edit/delete. Time is snapped to
 * the nearest 15 minutes.
 */
export const DayTimeline: React.FC<Props> = ({
  date,
  blocks,
  onChange,
  disabled,
  height = 56,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const workBlocks = useMemo(
    () =>
      [...blocks]
        .map((b, i) => ({ ...b, _idx: i }))
        .filter((b) => b.block_type === 'work')
        .sort((a, b) => a.start_minute - b.start_minute),
    [blocks]
  );

  const positionFromX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const minute = Math.round((ratio * MINUTES_PER_DAY) / 15) * 15;
    return Math.max(0, Math.min(MINUTES_PER_DAY, minute));
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    if ((e.target as HTMLElement).dataset.role === 'block') return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const m = positionFromX(e.clientX);
    setDragStart(m);
    setDragEnd(m);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragStart === null) return;
    setDragEnd(positionFromX(e.clientX));
  };

  const commitDrag = () => {
    if (dragStart === null || dragEnd === null) return;
    const s = Math.min(dragStart, dragEnd);
    const e = Math.max(dragStart, dragEnd);
    if (e - s >= 15) {
      const next = mergeBlocks([
        ...blocks,
        { block_type: 'work', start_minute: s, end_minute: e },
      ]);
      onChange(next);
    }
    setDragStart(null);
    setDragEnd(null);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={commitDrag}
        onPointerCancel={() => {
          setDragStart(null);
          setDragEnd(null);
        }}
        className={`relative w-full rounded border bg-success/5 border-success/30 select-none ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-crosshair'
        }`}
        style={{ height }}
        aria-label={`Timeline for ${date}`}
      >
        {/* Hour gridlines */}
        {Array.from({ length: 25 }, (_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 border-l border-border/40"
            style={{ left: `${(i / 24) * 100}%` }}
          />
        ))}

        {/* Existing work blocks */}
        {workBlocks.map((b) => (
          <div
            key={b._idx}
            data-role="block"
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) setEditingIdx(b._idx);
            }}
            className="absolute top-0 bottom-0 bg-primary/85 text-primary-foreground rounded text-[10px] flex items-center justify-center px-1 truncate hover:bg-primary cursor-pointer shadow-sm"
            style={{
              left: `${(b.start_minute / MINUTES_PER_DAY) * 100}%`,
              width: `${((b.end_minute - b.start_minute) / MINUTES_PER_DAY) * 100}%`,
            }}
            title={`${fmtTime(b.start_minute)}–${fmtTime(b.end_minute)}${
              b.notes ? ` · ${b.notes}` : ''
            }`}
          >
            {fmtTime(b.start_minute)}–{fmtTime(b.end_minute)}
          </div>
        ))}

        {/* In-progress drag preview */}
        {dragStart !== null && dragEnd !== null && (
          <div
            className="absolute top-0 bottom-0 bg-primary/40 border border-primary rounded"
            style={{
              left: `${(Math.min(dragStart, dragEnd) / MINUTES_PER_DAY) * 100}%`,
              width: `${(Math.abs(dragEnd - dragStart) / MINUTES_PER_DAY) * 100}%`,
            }}
          />
        )}
      </div>

      {editingIdx !== null && (
        <BlockEditor
          block={blocks[editingIdx]}
          onSave={(b) => {
            const next = [...blocks];
            next[editingIdx] = b;
            onChange(mergeBlocks(next));
            setEditingIdx(null);
          }}
          onDelete={() => {
            const next = blocks.filter((_, i) => i !== editingIdx);
            onChange(next);
            setEditingIdx(null);
          }}
          onClose={() => setEditingIdx(null)}
        />
      )}
    </div>
  );
};

const BlockEditor: React.FC<{
  block: WorkRestBlock;
  onSave: (b: WorkRestBlock) => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ block, onSave, onDelete, onClose }) => {
  const [start, setStart] = useState(fmtTime(block.start_minute));
  const [end, setEnd] = useState(fmtTime(block.end_minute));
  const [category, setCategory] = useState(block.category ?? '');
  const [notes, setNotes] = useState(block.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const s = parseTime(start);
    const e = parseTime(end);
    if (s === null || e === null) {
      setError('Use HH:MM format.');
      return;
    }
    if (e <= s) {
      setError('End time must be after start time.');
      return;
    }
    onSave({
      ...block,
      start_minute: s,
      end_minute: e,
      category: category || null,
      notes: notes || null,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit work block</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <Input value={start} onChange={(e) => setStart(e.target.value)} placeholder="08:00" />
            </div>
            <div>
              <Label>End</Label>
              <Input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="18:00" />
            </div>
          </div>
          <div>
            <Label>Category (optional)</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="watch, deck, drill, port…"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onDelete} className="mr-auto text-destructive">
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Merge overlapping or touching work blocks. Rest is implicit.
 */
function mergeBlocks(blocks: WorkRestBlock[]): WorkRestBlock[] {
  const work = blocks
    .filter((b) => b.block_type === 'work')
    .sort((a, b) => a.start_minute - b.start_minute);
  const out: WorkRestBlock[] = [];
  for (const b of work) {
    const last = out[out.length - 1];
    if (last && b.start_minute <= last.end_minute) {
      last.end_minute = Math.max(last.end_minute, b.end_minute);
      // Preserve any notes/category from the larger block, but concatenate
      // distinct notes for traceability.
      if (b.notes && b.notes !== last.notes) {
        last.notes = last.notes ? `${last.notes}; ${b.notes}` : b.notes;
      }
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

export { mergeBlocks };

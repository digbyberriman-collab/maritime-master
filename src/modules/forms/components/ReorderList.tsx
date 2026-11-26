/**
 * The order of an area's templates on one vessel (gap/02 FC2 "order on
 * vessels", FC4; `form_template_reorder`): every published template of
 * the area offered on the vessel, hidden ones included, in the order
 * crews see them.
 *
 * Three ways to move a template, all to the same list:
 * - drag a row by its handle (mouse and pen);
 * - keyboard: focus a handle and press the arrow keys (Home and End move
 *   to the top and the bottom); the new position is announced;
 * - the Move up / Move down buttons (touch, and anyone who prefers them).
 * "Save order" sends the whole list once; "Cancel" drops the changes.
 * Nothing is sent while the order is unchanged.
 */
import React from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/shared/components/status';
import { moveItem, reorderKeyTarget, sameOrder } from '../lib/catalogueModel';
import { COARSE, COARSE_ICON } from './FormsParts';

export interface ReorderEntry {
  id: string;
  name: string;
  hidden: boolean;
}

export interface ReorderListProps {
  entries: readonly ReorderEntry[];
  vesselName: string;
  saving: boolean;
  onSave: (ids: string[]) => void;
  onCancel: () => void;
}

export function ReorderList({ entries, vesselName, saving, onSave, onCancel }: ReorderListProps) {
  const initial = React.useMemo(() => entries.map((e) => e.id), [entries]);
  const [order, setOrder] = React.useState<string[]>(initial);
  const [announcement, setAnnouncement] = React.useState('');
  const [dragging, setDragging] = React.useState<string | null>(null);
  const handles = React.useRef(new Map<string, HTMLButtonElement | null>());
  const byId = React.useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  // A new list from the server (another save, a refresh) starts again from it; a re-render with the same list keeps the changes.
  const initialKey = initial.join('|');
  React.useEffect(() => setOrder(initialKey ? initialKey.split('|') : []), [initialKey]);

  const move = (from: number, to: number, focus: boolean) => {
    if (to === from || to < 0 || to >= order.length) return;
    const id = order[from];
    const next = moveItem(order, from, to);
    setOrder(next);
    setAnnouncement(`${byId.get(id)?.name ?? 'Template'} moved to position ${to + 1} of ${next.length}.`);
    if (focus) requestAnimationFrame(() => handles.current.get(id)?.focus());
  };

  const onHandleKey = (event: React.KeyboardEvent, index: number) => {
    const target = reorderKeyTarget(event.key, index, order.length);
    if (target === null) return;
    event.preventDefault();
    move(index, target, true);
  };

  const onDrop = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain') || dragging;
    setDragging(null);
    if (!id) return;
    const from = order.indexOf(id);
    if (from >= 0) move(from, index, false);
  };

  const changed = !sameOrder(order, initial);

  return (
    <div className="space-y-3">
      <p id="reorder-help" className="type-body-sm text-muted-foreground">
        Drag a template by its handle, or focus the handle and use the arrow keys, to set the order crews on {vesselName} see. Hidden templates keep
        their place for when they are shown again.
      </p>
      <ol aria-label={`Order on ${vesselName}`} className="flex flex-col gap-2">
        {order.map((id, index) => {
          const entry = byId.get(id);
          if (!entry) return null;
          return (
            <li
              key={id}
              data-reorder-id={id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, index)}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-2 py-2',
                dragging === id && 'opacity-60',
              )}
            >
              <button
                type="button"
                ref={(el) => handles.current.set(id, el)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDragging(id);
                }}
                onDragEnd={() => setDragging(null)}
                onKeyDown={(e) => onHandleKey(e, index)}
                aria-describedby="reorder-help"
                aria-label={`Move ${entry.name}, position ${index + 1} of ${order.length}`}
                className={cn(
                  'flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 active:cursor-grabbing',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  COARSE_ICON,
                )}
              >
                <GripVertical aria-hidden="true" className="h-4 w-4" />
              </button>
              <span aria-hidden="true" className="w-6 shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{entry.name}</span>
              {entry.hidden ? <StatusPill domain="form_template" status="hidden" label="Hidden" className="shrink-0" /> : null}
              <span className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn('h-8 w-8', COARSE_ICON)}
                  aria-label={`Move ${entry.name} up`}
                  disabled={index === 0 || saving}
                  onClick={() => move(index, index - 1, false)}
                >
                  <ArrowUp aria-hidden="true" className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn('h-8 w-8', COARSE_ICON)}
                  aria-label={`Move ${entry.name} down`}
                  disabled={index === order.length - 1 || saving}
                  onClick={() => move(index, index + 1, false)}
                >
                  <ArrowDown aria-hidden="true" className="h-4 w-4" />
                </Button>
              </span>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="sr-only" data-testid="reorder-announcement">
        {announcement}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" className={COARSE} onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" size="sm" className={COARSE} onClick={() => onSave(order)} disabled={!changed || saving}>
          {saving ? 'Saving order…' : 'Save order'}
        </Button>
      </div>
    </div>
  );
}

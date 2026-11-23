/**
 * Manage favourites (/me/shortcuts; gap/10 top bar element 6, IA13; D-68,
 * D-107): the pins the user made with the star in the top bar, each one
 * opened or removed here. Real pins only: no default or suggested targets,
 * no list of pages to add (a page is pinned from its own star), no reorder.
 *
 * The list follows the favourites menu, row for row (`usePinRowState`): a
 * link when the viewer can open the page, a muted row while access loads,
 * "Could not check access" with Check again when the check failed (no
 * Remove: the page may well open), and "No longer available" or "Not a page
 * in STORM" with Remove. Fail closed (D-04): a loader while the pins load,
 * and after a load error an alert with Retry, never the empty copy. Remove
 * waits for the delete (no optimistic removal) and is a named, always
 * visible button at the control height (44 px on touch, D-35).
 *
 * D-79: the section keeps its own visible h2; Settings renders the sr-only h1.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RotateCw, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePinnedShortcuts, type PinnedShortcut } from '@/shared/hooks/usePinnedShortcuts';
import { usePinRowState } from '@/shared/components/layout/topbar/pinRowState';

const rowClass = 'flex min-h-[var(--control-h)] items-center gap-3 px-3 py-1.5';

/** Remove, once the delete has gone through; disabled while it runs. */
const RemoveButton: React.FC<{ pin: PinnedShortcut; onRemove: (target: string) => Promise<void> }> = ({ pin, onRemove }) => {
  const [removing, setRemoving] = React.useState(false);
  const mounted = React.useRef(true);
  React.useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const remove = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await onRemove(pin.shortcut_target);
    } finally {
      if (mounted.current) setRemoving(false);
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Remove ${pin.shortcut_label} from favourites`}
      disabled={removing}
      onClick={() => void remove()}
      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      {removing ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
    </Button>
  );
};

const PinRow: React.FC<{ pin: PinnedShortcut; onRemove: (target: string) => Promise<void> }> = ({ pin, onRemove }) => {
  const row = usePinRowState(pin);
  const label = <span className="type-body block truncate font-medium">{pin.shortcut_label}</span>;

  if (row.kind === 'link') {
    return (
      <li className={rowClass} data-pin-state="link">
        <Link
          to={pin.shortcut_target}
          className="-mx-1 flex min-h-[var(--control-h)] min-w-0 flex-1 items-center gap-3 rounded-md px-1 text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <Star className="h-4 w-4 shrink-0 fill-primary text-primary" strokeWidth={1.75} aria-hidden="true" />
          <span className="min-w-0 flex-1">{label}</span>
        </Link>
        <span className="type-mono hidden max-w-[45%] shrink truncate text-muted-foreground sm:block" title={pin.shortcut_target}>
          {pin.shortcut_target}
        </span>
        <RemoveButton pin={pin} onRemove={onRemove} />
      </li>
    );
  }

  if (row.kind === 'waiting') {
    return (
      <li className={cn(rowClass, 'text-muted-foreground')} data-pin-state="waiting" aria-busy="true">
        <Star className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 flex-1">{label}</span>
      </li>
    );
  }

  if (row.kind === 'error') {
    return (
      <li className={cn(rowClass, 'text-muted-foreground')} data-pin-state="error">
        <Star className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          {label}
          <span className="type-caption block">Could not check access</span>
        </span>
        <Button type="button" variant="ghost" onClick={row.retry} aria-label={`Check again for ${pin.shortcut_label}`} className="shrink-0">
          <RotateCw aria-hidden="true" />
          Check again
        </Button>
      </li>
    );
  }

  return (
    <li className={cn(rowClass, 'text-muted-foreground')} data-pin-state="remove">
      <Star className="h-4 w-4 shrink-0 opacity-60" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {label}
        <span className="type-caption block">{row.reason}</span>
      </span>
      <RemoveButton pin={pin} onRemove={onRemove} />
    </li>
  );
};

const ShortcutsSection: React.FC = () => {
  const { pins, status, retry, removePin } = usePinnedShortcuts();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="type-display text-foreground">Favourites</h2>
        <p className="type-body mt-1 text-muted-foreground">Pages you starred with the star in the top bar. Open one, or remove it.</p>
      </div>

      {status === 'loading' && (
        <div role="status" className="type-body flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          Loading favourites…
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p role="alert" className="type-body flex-1 text-foreground">
            Favourites could not load.
          </p>
          <Button type="button" variant="outline" onClick={() => void retry()}>
            <RotateCw aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      {status === 'ready' && pins.length === 0 && (
        <p className="type-body rounded-lg border border-dashed bg-card px-4 py-6 text-center text-muted-foreground">
          Star a page to keep it here.
        </p>
      )}

      {status === 'ready' && pins.length > 0 && (
        <ul aria-label="Favourites" className="divide-y divide-border overflow-hidden rounded-lg border bg-card shadow-sm">
          {pins.map((pin) => (
            <PinRow key={pin.id} pin={pin} onRemove={removePin} />
          ))}
        </ul>
      )}
    </div>
  );
};

export default ShortcutsSection;

/**
 * The command palette's dialog body (gap/10 IA12, BUILD-PLAN S5), loaded
 * lazily by ./CommandPalette.tsx. One search field over:
 *
 *   Records   only while the query looks like a reference (C21); Phase 1 has
 *             no provider, so it says "No record matches …", never a guess
 *   Recent    this user's last picks on this device, only while still offered,
 *             and only once Pages and Vessels have loaded
 *   Pages     the nav leaves the user can see (useVisibleNavLeaves)
 *   Vessels   the vessels in reach; "All vessels" with fleet reach
 *   Actions   theme, density, shell surfaces, report, sign out
 *
 * Matching is fuzzy (./fuzzy.ts) and ranked here, not by cmdk's filter
 * (whose group ordering does not follow the scores): the group holding the
 * best match comes first, so the top result is the first option.
 *
 * Keyboard: ↑ ↓ Home End move, Enter opens, Esc closes (cmdk + Radix).
 * Selecting closes the palette first; focus goes back to the element that
 * opened it, except when the action opens another surface.
 *
 * The highlighted option is held here (cmdk's controlled `value`): cmdk
 * selects the first row to mount, which on a first open is a vessel while
 * Pages still loads, and keeps it when Pages arrive above. So each open
 * starts with nothing chosen, and with an empty query the top row is chosen
 * once the sources settle, without undoing a row the user moved to.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, FileSearch, SearchX, X } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PALETTE_TEST_IDS } from '@/app/shell/testIds';
import { useVesselSwitch } from '@/app/nav/useVesselSwitch';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { notify } from '@/shared/lib/notify';
import { useScope } from '@/app/router/scopeContext';
import { indexItems, paletteGroups, RECENT_VALUE_PREFIX, type PaletteGroupView, type PaletteItem } from './model';
import { availableRecent, usePaletteRecent } from './recent';
import { looksLikeRecordReference } from './recordReferences';
import { usePaletteActions, usePalettePages, usePaletteVessels } from './sources';
import { useRecordSearch } from './useRecordSearch';
import type { PaletteDialogProps } from './paletteDialogProps';

const nextFrame = (fn: () => void) => {
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(() => fn());
  else window.setTimeout(fn, 0);
};

const kbd =
  'type-mono inline-flex min-w-5 items-center justify-center rounded-sm border border-border bg-muted px-1 text-[0.6875rem] leading-4 text-muted-foreground';

const SkeletonRow: React.FC<{ label: string }> = ({ label }) => (
  <div role="status" aria-busy="true" className="flex items-center gap-3 px-2 py-2">
    <Skeleton className="h-7 w-7 shrink-0 motion-reduce:animate-none" />
    <div className="flex-1 space-y-1.5">
      <Skeleton className="h-3 w-2/5 motion-reduce:animate-none" />
      <Skeleton className="h-2.5 w-1/4 motion-reduce:animate-none" />
    </div>
    <span className="sr-only">{label}</span>
  </div>
);

const PaletteRow: React.FC<{ item: PaletteItem; value: string; onPick: (item: PaletteItem) => void }> = ({
  item,
  value,
  onPick,
}) => {
  const Icon = item.icon;
  return (
    <CommandItem
      value={value}
      onSelect={() => onPick(item)}
      className="group gap-3 rounded-md px-2 py-2"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition-colors duration-quick ease-tide group-data-[selected=true]:border-primary/40 group-data-[selected=true]:text-primary"
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate type-body', item.tone === 'destructive' ? 'text-destructive' : 'text-foreground')}>
          {item.label}
        </span>
        {item.subtitle ? <span className="block truncate type-caption text-muted-foreground">{item.subtitle}</span> : null}
      </span>
      {item.chip ? (
        <span className="type-mono shrink-0 rounded-sm border border-input px-1 text-[0.6875rem] uppercase text-muted-foreground">
          {item.chip}
        </span>
      ) : null}
      {item.marker === 'current' ? <span className="shrink-0 type-caption text-primary">Current</span> : null}
      {item.marker === 'active' ? (
        <span className="flex shrink-0 items-center text-primary">
          <Check className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">(in use)</span>
        </span>
      ) : null}
    </CommandItem>
  );
};

const SourceGroup: React.FC<{ group: PaletteGroupView; onPick: (item: PaletteItem) => void }> = ({ group, onPick }) => {
  if (group.status === 'loading') {
    return (
      <CommandGroup heading={group.heading}>
        <SkeletonRow label={`Loading ${group.heading.toLowerCase()}`} />
      </CommandGroup>
    );
  }
  return (
    <CommandGroup heading={group.heading}>
      {group.items.map((item) => (
        <PaletteRow key={item.id} item={item} value={item.id} onPick={onPick} />
      ))}
      {group.more > 0 ? (
        <p className="px-2 pb-1 pt-1.5 type-caption text-muted-foreground">
          {group.more} more {group.more === 1 ? 'page' : 'pages'}: type to search them
        </p>
      ) : null}
    </CommandGroup>
  );
};

const RecordsGroup: React.FC<{ query: string; onClose: () => void }> = ({ query, onClose }) => {
  const search = useRecordSearch(query);
  const navigate = useNavigate();
  if (search.status === 'idle') return null;
  return (
    <CommandGroup heading="Records">
      {search.status === 'searching' ? <SkeletonRow label={`Looking up ${search.query}`} /> : null}
      {search.status === 'done' && search.matches.length > 0
        ? search.matches.map((match) => (
            <CommandItem
              key={`${match.kind}:${match.reference}`}
              value={`record:${match.reference}`}
              onSelect={() => {
                onClose();
                navigate(match.path);
              }}
              className="group gap-3 rounded-md px-2 py-2"
            >
              <span className="type-mono shrink-0 rounded-sm border border-input px-1 text-muted-foreground">{match.reference}</span>
              <span className="min-w-0 flex-1 truncate type-body">{match.label}</span>
            </CommandItem>
          ))
        : null}
      {search.status === 'done' && search.matches.length === 0 ? (
        <div className="flex items-center gap-3 px-2 py-2 type-body text-muted-foreground" role="status">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted" aria-hidden="true">
            <FileSearch className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            No record matches <span className="type-mono text-foreground">{search.query.toUpperCase()}</span>
          </span>
        </div>
      ) : null}
    </CommandGroup>
  );
};

interface ContentProps {
  initialQuery: string;
  onClose: () => void;
  /** Close, skip the focus return, then call `open` on the next frame. */
  onCloseThen: (open: () => void) => void;
  /** Choose the highlighted option (cmdk's controlled value). */
  setSelected: (value: string) => void;
}

const PaletteContent: React.FC<ContentProps> = ({ initialQuery, onClose, onCloseThen, setSelected }) => {
  const navigate = useNavigate();
  const switchVessel = useVesselSwitch();
  const { user } = useAuth();
  const { scope } = useScope();
  const pages = usePalettePages();
  const vessels = usePaletteVessels();
  const actions = usePaletteActions({ navigate });
  const { ids: recentIds, record: recordRecent } = usePaletteRecent(user?.id ?? null);
  const [query, setQuery] = useState(initialQuery);
  useEffect(() => setQuery(initialQuery), [initialQuery]);

  const trimmed = query.trim();
  const isReference = looksLikeRecordReference(trimmed);
  const sourcesReady = pages.status === 'ready' && vessels.status === 'ready';
  const recentItems = useMemo(
    () => (sourcesReady ? availableRecent(recentIds, indexItems([pages, vessels, actions])) : []),
    [sourcesReady, recentIds, pages, vessels, actions],
  );
  const showRecent = sourcesReady && !trimmed && recentItems.length > 0;
  const anyLoading = !sourcesReady;
  // Ranked here (not by cmdk's filter): the best match is the first option, whatever its group.
  const groups = useMemo(() => paletteGroups(trimmed, { pages, vessels, actions }, scope), [trimmed, pages, vessels, actions, scope]);

  // With an empty query, the top row is chosen whenever the rows above it
  // settle (Pages and Vessels loaded, Recent shown), not on every render, so
  // an arrow-key choice stays. A typed query needs nothing: cmdk chooses the
  // first match whenever the search changes.
  const firstValue = showRecent
    ? `${RECENT_VALUE_PREFIX}${recentItems[0].id}`
    : groups.find((g) => g.status === 'ready' && g.items.length > 0)?.items[0]?.id ?? '';
  const top = useRef({ firstValue, trimmed });
  top.current = { firstValue, trimmed };
  useLayoutEffect(() => {
    if (!top.current.trimmed && top.current.firstValue) setSelected(top.current.firstValue);
  }, [sourcesReady, showRecent, setSelected]);

  const pick = useCallback(
    (item: PaletteItem) => {
      if (item.recordable) recordRecent(item.id);
      const effect = item.perform;
      switch (effect.kind) {
        case 'navigate':
          onClose();
          navigate(effect.to);
          return;
        case 'switch-vessel':
          onClose();
          switchVessel(effect.vessel);
          return;
        case 'open-surface':
          onCloseThen(effect.open);
          return;
        case 'run':
          onClose();
          Promise.resolve()
            .then(effect.run)
            .catch((error: unknown) => notify.error(error, { title: `${item.label} did not complete` }));
      }
    },
    [recordRecent, onClose, onCloseThen, navigate, switchVessel],
  );

  return (
    <>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search pages, vessels and actions…"
        data-testid={PALETTE_TEST_IDS.input}
        wrapperClassName="h-14 shrink-0 gap-3 px-4 sm:h-12"
        className="h-full py-0 text-base sm:text-[0.9375rem]"
        trailing={
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="focus-ring -mr-1 inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-quick ease-tide hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            <kbd className={cn(kbd, 'px-1.5 [@media(pointer:coarse)]:hidden')}>Esc</kbd>
            <X className="hidden [@media(pointer:coarse)]:block" aria-hidden="true" />
          </button>
        }
      />
      <CommandList
        data-testid={PALETTE_TEST_IDS.list}
        label="Search results"
        className="max-h-[min(28rem,70dvh)] scroll-py-2 py-1"
      >
        {isReference ? null : (
          <CommandEmpty className="flex flex-col items-center gap-2 px-6 py-10">
            {anyLoading ? (
              <span>Still loading pages and vessels…</span>
            ) : (
              <>
                <SearchX className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <span className="text-foreground">No results for “{trimmed}”</span>
                <span className="type-caption">Try a page, a vessel name or code, or an action.</span>
              </>
            )}
          </CommandEmpty>
        )}
        {isReference ? <RecordsGroup query={trimmed} onClose={onClose} /> : null}
        {showRecent ? (
          <CommandGroup heading="Recent">
            {recentItems.map((item) => (
              <PaletteRow key={item.id} item={item} value={`${RECENT_VALUE_PREFIX}${item.id}`} onPick={pick} />
            ))}
          </CommandGroup>
        ) : null}
        {groups.map((group) => (
          <SourceGroup key={group.id} group={group} onPick={pick} />
        ))}
      </CommandList>
      <div
        className="flex shrink-0 items-center gap-4 border-t border-border px-4 py-2 type-caption text-muted-foreground [@media(pointer:coarse)]:hidden"
        aria-hidden="true"
      >
        <span className="flex items-center gap-1.5">
          <kbd className={kbd}>↑</kbd>
          <kbd className={kbd}>↓</kbd>
          to move
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className={kbd}>↵</kbd>
          to open
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className={kbd}>Esc</kbd>
          to close
        </span>
      </div>
    </>
  );
};

const PaletteDialog: React.FC<PaletteDialogProps> = ({ open, onOpenChange, initialQuery, openerRef }) => {
  const skipFocusReturn = useRef(false);
  useEffect(() => {
    if (open) skipFocusReturn.current = false;
  }, [open]);

  // The highlighted option, cleared as the palette opens (before its rows
  // mount, so the first open and every later one start the same way).
  const [selected, setSelected] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSelected('');
  }

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const closeThen = useCallback(
    (next: () => void) => {
      skipFocusReturn.current = true;
      onOpenChange(false);
      nextFrame(next);
    },
    [onOpenChange],
  );
  const onCloseAutoFocus = useCallback(
    (event: Event) => {
      if (skipFocusReturn.current) {
        skipFocusReturn.current = false;
        event.preventDefault();
        return;
      }
      const opener = openerRef.current;
      if (opener && opener.isConnected) {
        event.preventDefault();
        opener.focus();
      }
    },
    [openerRef],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search STORM"
      description="Search pages, vessels and actions. Use the arrow keys to move through the results and Enter to open one."
      showCloseButton={false}
      contentProps={{ 'data-testid': PALETTE_TEST_IDS.dialog, onCloseAutoFocus }}
      commandProps={{ label: 'Search STORM', shouldFilter: false, loop: true, vimBindings: false, value: selected, onValueChange: setSelected }}
    >
      <PaletteContent initialQuery={initialQuery} onClose={close} onCloseThen={closeThen} setSelected={setSelected} />
    </CommandDialog>
  );
};

export default PaletteDialog;

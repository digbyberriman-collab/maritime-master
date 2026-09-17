import React from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { LogbookBook } from '../lib/catalog';
import type { BookCount } from '../hooks/useBookCounts';

interface Props {
  books: LogbookBook[];
  counts: Record<string, BookCount>;
  selectedId: string;
  onSelect: (book: LogbookBook) => void;
  query: string;
  onQueryChange: (value: string) => void;
}

/**
 * Horizontal strip of every book. Search by title or code (Ctrl/⌘+K), arrows,
 * native scrolling, Left/Right, Home/End and Enter. Scroll position is retained
 * across renders; the selected book is brought into view on change.
 */
const BookStrip: React.FC<Props> = ({ books, counts, selectedId, onSelect, query, onQueryChange }) => {
  const railRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [atStart, setAtStart] = React.useState(true);
  const [atEnd, setAtEnd] = React.useState(false);
  const lastSelected = React.useRef<string>('');

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? books.filter((b) => `${b.title} ${b.code}`.toLowerCase().includes(q)) : books;
  }, [books, query]);

  const updateArrows = React.useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    setAtStart(rail.scrollLeft <= 4);
    setAtEnd(rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 1);
  }, []);

  React.useEffect(() => {
    updateArrows();
    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateArrows);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [updateArrows, matches.length]);

  React.useEffect(() => {
    if (lastSelected.current === selectedId) return;
    lastSelected.current = selectedId;
    const rail = railRef.current;
    const active = rail?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!rail || !active) return;
    const r = rail.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    if (a.left < r.left || a.right > r.right) {
      rail.scrollTo({ left: rail.scrollLeft + a.left - r.left - (rail.clientWidth - a.width) / 2, behavior: 'instant' as ScrollBehavior });
    }
  }, [selectedId]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const scrollBy = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    rail.scrollBy({ left: direction * rail.clientWidth * 0.8, behavior: reduced ? ('instant' as ScrollBehavior) : 'smooth' });
  };

  const onCardKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(railRef.current?.querySelectorAll<HTMLButtonElement>('[data-book-card]') ?? []);
    const at = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
    buttons[at]?.focus({ preventScroll: true });
    buttons[at]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
  };

  return (
    <section aria-labelledby="logbook-strip-title" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 id="logbook-strip-title" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Logbooks</h2>
          <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">{books.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Find a logbook…"
              aria-label="Find a logbook"
              autoComplete="off"
              className="h-9 pl-8 pr-14"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 text-[10px] text-muted-foreground">Ctrl K</kbd>
          </div>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label="Previous logbooks" aria-controls="logbook-rail" disabled={atStart} onClick={() => scrollBy(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label="Next logbooks" aria-controls="logbook-rail" disabled={atEnd} onClick={() => scrollBy(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <nav
        id="logbook-rail"
        ref={railRef}
        onScroll={updateArrows}
        aria-label="Choose a logbook"
        className="flex snap-x gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]"
      >
        {matches.map((book, index) => {
          const Icon = book.icon;
          const count = counts[book.id];
          const active = book.id === selectedId;
          const caption = count?.drafts ? `${count.drafts} draft${count.drafts === 1 ? '' : 's'}` : count?.records ? `${count.records} record${count.records === 1 ? '' : 's'}` : 'No entries yet';
          return (
            <button
              key={book.id}
              type="button"
              data-book-card
              aria-pressed={active}
              aria-label={`Open ${book.title}`}
              onClick={() => onSelect(book)}
              onKeyDown={(e) => onCardKey(e, index)}
              className={cn(
                'flex min-w-[13.5rem] max-w-[13.5rem] snap-start items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'border-primary bg-primary/10 shadow-[inset_0_-3px_0_hsl(var(--primary))]' : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30',
              )}
            >
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-semibold text-foreground">{book.title}</strong>
                <small className="block truncate text-xs text-muted-foreground">{caption}</small>
              </span>
              <span className="shrink-0 rounded border border-border px-1.5 text-[10px] font-semibold text-muted-foreground">{book.code}</span>
            </button>
          );
        })}
        {matches.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            No logbooks match “{query}”.{' '}
            <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => { onQueryChange(''); searchRef.current?.focus(); }}>
              Clear search
            </button>
          </div>
        )}
      </nav>
    </section>
  );
};

export default BookStrip;

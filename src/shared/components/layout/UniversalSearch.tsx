import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  FileText,
  Users,
  Award,
  Wrench,
  AlertTriangle,
  Map,
  BookOpen,
  Layers,
  HardHat,
  ClipboardList,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';

export type SearchableKind =
  | 'cert'
  | 'crew'
  | 'defect'
  | 'manual'
  | 'port'
  | 'incident'
  | 'drawing'
  | 'contractor'
  | 'audit';

export interface SearchableEntity {
  kind: SearchableKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

interface SearchContext {
  vesselIds: string[];
}

/**
 * TODO(universal-search): wire to Supabase. Should query across crew,
 * certificates, defects, manuals, ports, incidents, drawings, contractors,
 * and audits, scoped to the user's vessel/fleet context. For now this
 * returns an empty array so the UI ships without a backend dependency.
 */
async function searchUniversal(
  _query: string,
  _ctx: SearchContext,
): Promise<SearchableEntity[]> {
  return [];
}

const KIND_LABEL: Record<SearchableKind, string> = {
  cert: 'Certificates',
  crew: 'Crew',
  defect: 'Defects',
  manual: 'Manuals',
  port: 'Ports',
  incident: 'Incidents',
  drawing: 'Drawings',
  contractor: 'Contractors',
  audit: 'Audits',
};

const KIND_ICON: Record<SearchableKind, React.ElementType> = {
  cert: Award,
  crew: Users,
  defect: Wrench,
  manual: BookOpen,
  port: Map,
  incident: AlertTriangle,
  drawing: Layers,
  contractor: HardHat,
  audit: ClipboardList,
};

const RECENT_SEARCHES_KEY = 'storm:universal-search:recents';
const MAX_RECENTS = 8;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecents(values: string[]) {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(values.slice(0, MAX_RECENTS)));
  } catch {
    /* ignore quota errors */
  }
}

interface UniversalSearchProps {
  className?: string;
}

const UniversalSearch: React.FC<UniversalSearchProps> = ({ className }) => {
  const navigate = useNavigate();
  const { selectedVesselId, vessels, isAllVessels } = useVessel();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchableEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<string[]>(() => loadRecents());

  // ⌘K / Ctrl+K opens the palette.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const ctx = useMemo<SearchContext>(
    () => ({
      vesselIds: isAllVessels
        ? vessels.map((v) => v.id)
        : selectedVesselId
          ? [selectedVesselId]
          : [],
    }),
    [isAllVessels, vessels, selectedVesselId],
  );

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(async () => {
      const r = await searchUniversal(trimmed, ctx);
      if (!cancelled) {
        setResults(r);
        setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      setLoading(false);
    };
  }, [query, ctx, open]);

  const grouped = useMemo(() => {
    const map = new Map<SearchableKind, SearchableEntity[]>();
    for (const r of results) {
      const list = map.get(r.kind) ?? [];
      list.push(r);
      map.set(r.kind, list);
    }
    return Array.from(map.entries());
  }, [results]);

  const handleSelect = useCallback(
    (entity: SearchableEntity) => {
      const next = [entity.title, ...recents.filter((r) => r !== entity.title)].slice(0, MAX_RECENTS);
      setRecents(next);
      saveRecents(next);
      setOpen(false);
      setQuery('');
      navigate(entity.href);
    },
    [navigate, recents],
  );

  const handleRecentSelect = useCallback((value: string) => {
    setQuery(value);
  }, []);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(
          'h-9 w-full max-w-xs justify-start gap-2 text-muted-foreground bg-muted/40 hover:bg-muted',
          className,
        )}
        aria-label="Open universal search (Ctrl+K)"
      >
        <Search className="w-4 h-4" />
        <span className="hidden md:inline">Search…</span>
        <CommandShortcut className="hidden md:inline">⌘K</CommandShortcut>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search crew, certificates, defects, manuals, incidents…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {loading
              ? 'Searching…'
              : query.trim()
                ? 'No results. Universal search is being wired up.'
                : 'Start typing to search across the fleet.'}
          </CommandEmpty>

          {!query.trim() && recents.length > 0 && (
            <CommandGroup heading="Recent searches">
              {recents.map((r) => (
                <CommandItem key={r} value={`recent:${r}`} onSelect={() => handleRecentSelect(r)}>
                  <Search className="w-4 h-4 mr-2 text-muted-foreground" />
                  {r}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {grouped.map(([kind, items], idx) => {
            const Icon = KIND_ICON[kind] ?? FileText;
            return (
              <React.Fragment key={kind}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={KIND_LABEL[kind]}>
                  {items.map((entity) => (
                    <CommandItem
                      key={`${entity.kind}:${entity.id}`}
                      value={`${entity.kind} ${entity.title} ${entity.subtitle ?? ''}`}
                      onSelect={() => handleSelect(entity)}
                    >
                      <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span>{entity.title}</span>
                        {entity.subtitle && (
                          <span className="text-xs text-muted-foreground">{entity.subtitle}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </React.Fragment>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
};

export default UniversalSearch;

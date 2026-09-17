import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen, ChevronRight, Clock, Ship,
} from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import {
  LOGBOOK_DEFINITIONS,
  getLogbookByType,
} from '@/modules/logbooks/lib/logbookDefinitions';
import type { LogbookRecord, LogbookEntry } from '@/modules/logbooks/hooks/useLogbook';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  submitted: 'outline',
  signed: 'default',
  amended: 'outline',
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

const LogbookList: React.FC = () => {
  const navigate = useNavigate();
  const { selectedVessel } = useVessel();
  const [query, setQuery] = React.useState('');

  const vesselId = selectedVessel?.id ?? null;
  const vesselName =
    (selectedVessel as { name?: string } | null)?.name ?? 'the selected vessel';

  // All logbooks opened for this vessel, keyed by type.
  const logbooksQuery = useQuery({
    queryKey: ['vessel-logbooks', vesselId],
    enabled: !!vesselId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logbooks')
        .select('*')
        .eq('vessel_id', vesselId!)
        .eq('is_active', true);
      if (error) throw error;
      return (data ?? []) as LogbookRecord[];
    },
  });

  const logbookIds = (logbooksQuery.data ?? []).map((b) => b.id);

  // Recent entries across this vessel's logbooks.
  const recentQuery = useQuery({
    queryKey: ['vessel-logbook-recent', vesselId],
    enabled: !!vesselId && logbookIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logbook_entries')
        .select('*')
        .eq('vessel_id', vesselId!)
        .order('entry_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as LogbookEntry[];
    },
  });

  // Per-type stats derived from the vessel's logbooks.
  const stats = React.useMemo(() => {
    const map = new Map<string, { lastEntry: string | null }>();
    for (const book of logbooksQuery.data ?? []) {
      map.set(book.logbook_type, { lastEntry: book.last_entry_at });
    }
    return map;
  }, [logbooksQuery.data]);

  const filtered = LOGBOOK_DEFINITIONS.filter((book) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return book.label.toLowerCase().includes(q) || book.description.toLowerCase().includes(q);
  });

  const recent = recentQuery.data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-1">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Electronic Logbooks</h1>
            </div>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Ship className="h-4 w-4" />
              {vesselId
                ? <>Showing logbooks for <span className="font-medium text-foreground">{vesselName}</span>.</>
                : 'Select a vessel to view its logbooks and recent entries.'}
            </p>
          </div>
          <div className="w-full md:w-72">
            <Input
              placeholder="Search logbooks..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search logbooks"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((book) => {
            const Icon = book.icon;
            const stat = stats.get(book.type);
            const opened = !!stat;
            return (
              <Card
                key={book.slug}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/vessel/logbooks/${book.slug}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/vessel/logbooks/${book.slug}`);
                  }
                }}
                className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </span>
                      <CardTitle className="text-base">{book.label}</CardTitle>
                    </div>
                    <ChevronRight className="mt-2 h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CardDescription>{book.description}</CardDescription>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={book.statutory ? 'default' : 'secondary'}>
                      {book.statutory ? 'Statutory' : 'Operational'}
                    </Badge>
                    {vesselId && (
                      opened && stat.lastEntry ? (
                        <span className="text-xs text-muted-foreground">
                          Last entry {formatWhen(stat.lastEntry)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No entries yet</span>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No logbooks match “{query}”.</p>
        )}

        {vesselId && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Recent entries — {vesselName}</CardTitle>
              </div>
              <CardDescription>The ten latest entries across all of this vessel's logbooks.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading recent entries…</p>
              ) : recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No entries recorded for this vessel yet. Open a logbook to add the first one.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {recent.map((entry) => {
                    const def = getLogbookByType(
                      (logbooksQuery.data ?? []).find((b) => b.id === entry.logbook_id)?.logbook_type ?? '',
                    );
                    const Icon = def?.icon ?? BookOpen;
                    return (
                      <li
                        key={entry.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => def && navigate(`/vessel/logbooks/${def.slug}`)}
                        onKeyDown={(event) => {
                          if ((event.key === 'Enter' || event.key === ' ') && def) {
                            event.preventDefault();
                            navigate(`/vessel/logbooks/${def.slug}`);
                          }
                        }}
                        className="flex items-center gap-3 py-3 cursor-pointer hover:bg-accent/40 rounded-md px-2 -mx-2"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                          <Icon className="h-4 w-4 text-primary" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {entry.summary || def?.label || 'Logbook entry'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {def?.label ?? 'Logbook'} · {formatWhen(entry.entry_at)}
                            {entry.recorded_by_name ? ` · ${entry.recorded_by_name}` : ''}
                          </p>
                        </div>
                        <Badge variant={STATUS_VARIANT[entry.status] ?? 'secondary'} className="capitalize">
                          {entry.status}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default LogbookList;

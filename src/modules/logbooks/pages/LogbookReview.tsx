import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useLogbookActor } from '../hooks/useLogbookActor';
import { fetchLogbooks, fetchVesselEntries } from '../lib/logbookApi';
import { getBookByDbType, type LogbookBook } from '../lib/catalog';
import { canAcknowledge, canAttestWitness, canCountersign, missingSigners } from '../lib/formRules';
import type { EntryView } from '../lib/types';
import { stamp } from '../lib/format';

interface Item { entry: EntryView; book: LogbookBook | undefined; note: string; }

const Queue: React.FC<{ title: string; description: string; items: Item[] }> = ({ title, description, items }) => (
  <section className="rounded-lg border border-border bg-card">
    <header className="flex items-center justify-between border-b border-border px-4 py-3">
      <div><h2 className="font-semibold">{title}</h2><p className="text-xs text-muted-foreground">{description}</p></div>
      <Badge variant={items.length ? 'default' : 'secondary'}>{items.length}</Badge>
    </header>
    {items.length === 0 ? (
      <p className="px-4 py-4 text-sm text-muted-foreground">Nothing waiting.</p>
    ) : (
      <ul className="divide-y divide-border">
        {items.map(({ entry, book, note }) => (
          <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <div className="min-w-0">
              <span className="font-medium">{book?.title ?? 'Logbook'}</span> · {entry.schema_snapshot?.title ?? entry.section_id ?? 'record'} · line {entry.line_number ?? '—'}
              <span className="block text-xs text-muted-foreground">{stamp(entry.entry_at)} · {entry.recorded_by_name ?? '—'} · {note}</span>
            </div>
            {book && <Button asChild size="sm" variant="outline"><Link to={`/vessel/logbooks/${book.slug}?entry=${entry.id}`}>Open line</Link></Button>}
          </li>
        ))}
      </ul>
    )}
  </section>
);

/** Review & sign-off queues for the signed-in crew member, resolved from the same signature policies as the sheet. */
const LogbookReview: React.FC = () => {
  const actor = useLogbookActor();
  const logbooks = useQuery({ queryKey: ['logbooks', actor.vesselId], enabled: !!actor.vesselId, queryFn: () => fetchLogbooks(actor.vesselId!) });
  const entries = useQuery({ queryKey: ['logbook-vessel-entries', actor.vesselId], enabled: !!actor.vesselId, queryFn: () => fetchVesselEntries(actor.vesselId!) });

  const bookFor = React.useCallback((entry: EntryView) => {
    const row = (logbooks.data ?? []).find((l) => l.id === entry.logbook_id);
    return row ? getBookByDbType(row.logbook_type) : undefined;
  }, [logbooks.data]);

  const all = React.useMemo(() => (entries.data ?? []).filter((e) => !e.superseded_by_id), [entries.data]);
  const mine = all.filter((e) => e.status === 'draft' && e.recorded_by === actor.userId).map((e) => ({ entry: e, book: bookFor(e), note: 'Your draft · complete, save and sign' }));
  const countersign = all.filter((e) => canCountersign(e, e.signatures, actor.capacity, actor.userId)).map((e) => ({ entry: e, book: bookFor(e), note: `Needs ${missingSigners(e.schema_snapshot?.signing, e.signatures, true).join(', ') || 'your countersignature'}` }));
  const attest = all.filter((e) => canAttestWitness(e, e.signatures, actor.capacity)).map((e) => ({ entry: e, book: bookFor(e), note: 'External witness signature to attest' }));
  const verify = actor.isMaster ? all.filter((e) => e.status === 'signed').map((e) => ({ entry: e, book: bookFor(e), note: missingSigners(e.schema_snapshot?.signing, e.signatures, true).length ? `Awaiting ${missingSigners(e.schema_snapshot?.signing, e.signatures, true).join(', ')}` : 'Ready for Master review' })) : [];
  const unpaged = actor.isMaster ? all.filter((e) => e.status !== 'draft' && !e.page_id && e.volume_id).map((e) => ({ entry: e, book: bookFor(e), note: 'Signed line awaiting page review' })) : [];
  const orders = all.filter((e) => canAcknowledge(e, e.signatures, actor.capacity, actor.userId)).map((e) => ({ entry: e, book: bookFor(e), note: 'Order to read and acknowledge' }));
  const loading = logbooks.isLoading || entries.isLoading;

  return (
    <DashboardLayout>
      <div className="space-y-5 p-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2"><Link to="/vessel/logbooks"><ArrowLeft className="mr-1 h-4 w-4" /> Back to logbooks</Link></Button>
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Review &amp; sign-off</h1>
            <p className="text-sm text-muted-foreground">What waits on you as {actor.capacity ? actor.capacity : 'a reader'}. Each item opens at its line in the book.</p>
          </div>
        </div>
        {!actor.vesselId ? (
          <p className="text-sm text-muted-foreground">Select a vessel to see its review queues.</p>
        ) : loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Queue title="My drafts" description="Incomplete or unsigned lines you started." items={mine} />
            <Queue title="Countersignatures" description="Signed lines whose policy needs your capacity." items={countersign} />
            {actor.isMaster && <Queue title="Master review" description="Signed lines awaiting verification." items={verify} />}
            {actor.isMaster && <Queue title="Page review" description="Signed lines not yet fixed on a page." items={unpaged} />}
            {actor.isMaster && <Queue title="Witness attestations" description="External witness signatures to attest." items={attest} />}
            <Queue title="Orders to acknowledge" description="Signed standing or night orders you have not acknowledged." items={orders} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default LogbookReview;

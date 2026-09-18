import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useLogbookActor } from '../hooks/useLogbookActor';
import { fetchAudit, fetchLogbooks, fetchPages, fetchRegistries, fetchSamples, fetchVesselEntries, fetchVolumes } from '../lib/logbookApi';
import { CATALOG_TOTALS, LOGBOOK_BOOKS, getBookByDbType } from '../lib/catalog';
import { templateRevision } from '../lib/templates';
import type { EntryView } from '../lib/types';
import { stamp } from '../lib/format';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = { draft: 'secondary', signed: 'default', verified: 'default', submitted: 'outline', amended: 'outline' };

/** All records with search and filters, the audit trail, and the JSON audit export. */
const LogbookRecords: React.FC = () => {
  const actor = useLogbookActor();
  const { selectedVessel } = useVessel();
  const vesselId = actor.vesselId;
  const logbooks = useQuery({ queryKey: ['logbooks', vesselId], enabled: !!vesselId, queryFn: () => fetchLogbooks(vesselId!) });
  const entries = useQuery({ queryKey: ['logbook-vessel-entries', vesselId], enabled: !!vesselId, queryFn: () => fetchVesselEntries(vesselId!) });
  const audit = useQuery({ queryKey: ['logbook-audit', vesselId], enabled: !!vesselId, queryFn: () => fetchAudit(vesselId!) });
  const [query, setQuery] = React.useState('');
  const [bookFilter, setBookFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [exporting, setExporting] = React.useState(false);

  const bookFor = React.useCallback((entry: EntryView) => {
    const row = (logbooks.data ?? []).find((l) => l.id === entry.logbook_id);
    return row ? getBookByDbType(row.logbook_type) : undefined;
  }, [logbooks.data]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries.data ?? []).filter((e) => {
      const book = bookFor(e);
      if (bookFilter && book?.id !== bookFilter) return false;
      if (statusFilter === 'superseded' ? !e.superseded_by_id : statusFilter && e.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${book?.title ?? ''} ${e.schema_snapshot?.title ?? ''} ${e.remarks ?? ''} ${e.recorded_by_name ?? ''} ${JSON.stringify(e.data)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries.data, bookFor, query, bookFilter, statusFilter]);

  const exportJson = async () => {
    if (!vesselId) return;
    setExporting(true);
    try {
      const [volumes, registries, samples] = await Promise.all([fetchVolumes(vesselId), fetchRegistries(vesselId), fetchSamples(vesselId, 500)]);
      const pages = (await Promise.all(volumes.map((v) => fetchPages(v.id)))).flat();
      const bundle = {
        format: 'logbook-audit-package', version: 1, exportedAt: new Date().toISOString(), exportedBy: actor.name,
        status: {
          prototype: true,
          approval: 'No class, MCA or Cayman approval is held for this electronic logbook.',
          signatures: 'Reviewed electronic attestations recorded by authenticated platform users; not advanced electronic signatures.',
          templates: `${templateRevision} · ${CATALOG_TOTALS.books} books · ${CATALOG_TOTALS.sections} sections · ${CATALOG_TOTALS.fields} fields`,
          integrity: 'Each signed entry carries a database-computed SHA-256 digest; page digests fix ordered groups of entry digests. No external anchor.',
        },
        vessel: selectedVessel ? { id: selectedVessel.id, name: selectedVessel.name, imo: selectedVessel.imo_number, flag: selectedVessel.flag_state } : null,
        logbooks: logbooks.data ?? [], volumes, pages, registries, samples,
        entries: entries.data ?? [], audit: audit.data ?? [],
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `logbook-audit-${selectedVessel?.name?.replace(/\W+/g, '-') ?? 'vessel'}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 p-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2"><Link to="/vessel/logbooks"><ArrowLeft className="mr-1 h-4 w-4" /> Back to logbooks</Link></Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileText className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Records &amp; exports</h1>
              <p className="text-sm text-muted-foreground">Every line across all books, the audit trail and the full JSON audit package.</p>
            </div>
          </div>
          <Button type="button" onClick={exportJson} disabled={!vesselId || exporting}><Download className="mr-1 h-4 w-4" /> {exporting ? 'Preparing…' : 'Export JSON audit package'}</Button>
        </div>
        <Tabs defaultValue="records">
          <TabsList><TabsTrigger value="records">All records</TabsTrigger><TabsTrigger value="audit">Audit trail</TabsTrigger></TabsList>
          <TabsContent value="records" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search records…" aria-label="Search records" className="w-64" />
              <select value={bookFilter} onChange={(e) => setBookFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm" aria-label="Filter by book">
                <option value="">All books</option>
                {LOGBOOK_BOOKS.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm" aria-label="Filter by status">
                <option value="">All statuses</option>
                {['draft', 'signed', 'verified', 'superseded'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {entries.isLoading ? <Skeleton className="h-48 w-full" /> : (
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date / time UTC</TableHead><TableHead>Book · section</TableHead><TableHead>Line</TableHead><TableHead>Author</TableHead><TableHead>Signatures</TableHead><TableHead>Status</TableHead><TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((e) => {
                      const book = bookFor(e);
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap">{stamp(e.entry_at)}</TableCell>
                          <TableCell><span className="block font-medium">{book?.title ?? '—'}</span><span className="text-xs text-muted-foreground">{e.schema_snapshot?.title ?? e.section_id ?? 'earlier record'}</span></TableCell>
                          <TableCell>{e.line_number ?? '—'}{e.page_number ? ` · p.${e.page_number}` : ''}</TableCell>
                          <TableCell>{e.recorded_by_name ?? '—'}</TableCell>
                          <TableCell className="text-xs">{e.signatures.filter((s) => s.kind !== 'acknowledge').map((s) => `${s.kind}: ${s.kind === 'attested' ? s.witness_name : s.actor_name}`).join(', ') || 'Unsigned'}</TableCell>
                          <TableCell><Badge variant={STATUS_VARIANT[e.status] ?? 'secondary'}>{e.superseded_by_id ? 'superseded' : e.status}</Badge></TableCell>
                          <TableCell className="text-right">{book && <Button asChild size="sm" variant="ghost"><Link to={`/vessel/logbooks/${book.slug}?entry=${e.id}`}>Open</Link></Button>}</TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No records match.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
          <TabsContent value="audit">
            {audit.isLoading ? <Skeleton className="h-48 w-full" /> : (
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead>Entry</TableHead><TableHead>Changed</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(audit.data ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap">{stamp(row.created_at, true)}</TableCell>
                        <TableCell><Badge variant="outline">{row.action}</Badge></TableCell>
                        <TableCell>{row.actor_name ?? 'System'}</TableCell>
                        <TableCell className="font-mono text-xs">{row.entry_id.slice(0, 8)}…</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.changed_fields?.join(', ') ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                    {(audit.data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No audit events yet.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default LogbookRecords;

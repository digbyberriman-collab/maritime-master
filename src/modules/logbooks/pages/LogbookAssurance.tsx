import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { APPROVAL_ROUTES, CATALOG_TOTALS, LOGBOOK_BOOKS, getBook, referenceFor } from '../lib/catalog';
import { profiles, templateRevision } from '../lib/templates';

/** CISR / MCA comparison, source coverage and the sourced approval register. */
const LogbookAssurance: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const book = getBook(params.get('book')) ?? LOGBOOK_BOOKS[0];
  const tab = params.get('tab') ?? 'comparison';
  const setBook = (id: string) => { params.set('book', id); setParams(params, { replace: true }); };
  const setTab = (t: string) => { params.set('tab', t); setParams(params, { replace: true }); };
  const reference = referenceFor(book);
  return (
    <DashboardLayout>
      <div className="space-y-5 p-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2"><Link to={`/vessel/logbooks/${book.slug}`}><ArrowLeft className="mr-1 h-4 w-4" /> Back to {book.title}</Link></Button>
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Assurance</h1>
            <p className="text-sm text-muted-foreground">Flag comparison, source coverage and the approval register. No flag or class approval has been issued for this electronic logbook.</p>
          </div>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList><TabsTrigger value="comparison">CISR / MCA comparison</TabsTrigger><TabsTrigger value="coverage">Source coverage</TabsTrigger><TabsTrigger value="approval">Approval register</TabsTrigger></TabsList>
          <TabsContent value="comparison" className="space-y-4">
            <label className="flex items-center gap-2 text-sm">Compare book
              <select value={book.id} onChange={(e) => setBook(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                {LOGBOOK_BOOKS.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
            </label>
            <section className="rounded-lg border border-border bg-card">
              <header className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="font-semibold">{book.title} · flag comparison</h2><Badge variant="secondary">{book.basis}</Badge></header>
              <Table>
                <TableHeader><TableRow><TableHead>Aspect</TableHead>{profiles.map((p) => <TableHead key={p.id}>{p.title}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {book.differences.map((d) => (
                    <TableRow key={d.topic} className={d.shared ? '' : 'bg-warning-muted/40'}>
                      <TableCell><span className="font-medium">{d.topic}</span><span className="block text-xs text-muted-foreground">{d.shared ? 'Shared basis' : 'Difference / separate route'}</span></TableCell>
                      <TableCell>{d.cisr}</TableCell><TableCell>{d.mca}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
            <section className="rounded-lg border border-border bg-card">
              <header className="border-b border-border px-4 py-3"><h2 className="font-semibold">Section and field coverage</h2><p className="text-xs text-muted-foreground">Original electronic forms mapped to the source below. Source-page numbers identify the reference book; signed pages here have their own sequence.</p></header>
              <Table>
                <TableHeader><TableRow><TableHead>Section</TableHead><TableHead>Reference pages / code</TableHead><TableHead>Fields</TableHead><TableHead>Signing</TableHead><TableHead>Coverage</TableHead></TableRow></TableHeader>
                <TableBody>{book.sections.map((s) => <TableRow key={s.id}><TableCell>{s.title}</TableCell><TableCell>{s.operationCode ?? s.referencePages}</TableCell><TableCell>{s.fields.length}</TableCell><TableCell className="text-xs">{s.signing}</TableCell><TableCell className="text-xs">{s.coverage}</TableCell></TableRow>)}</TableBody>
              </Table>
              <p className="px-4 py-3 text-sm"><a href={reference.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{reference.title} ↗</a><span className="block text-xs text-muted-foreground">{reference.note}</span></p>
            </section>
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Application: {book.application}. Shared IMO requirements do not imply identical publisher editions or automatic electronic acceptance.</p>
          </TabsContent>
          <TabsContent value="coverage" className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[[CATALOG_TOTALS.books, 'Book types'], [CATALOG_TOTALS.sections, 'Sections / operations'], [CATALOG_TOTALS.fields, 'Section field definitions'], [profiles.length, 'Flag profiles']].map(([v, l]) => (
                <div key={String(l)} className="rounded-lg border border-border bg-card p-3 text-center"><dd className="text-2xl font-bold">{v}</dd><dt className="text-xs text-muted-foreground">{l}</dt></div>
              ))}
            </dl>
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Coverage counts describe implemented forms ({templateRevision}), not regulatory completeness. Exact current publisher editions, amended statutory schedules and vessel applicability remain release requirements.</p>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader><TableRow><TableHead>Book</TableHead><TableHead>Basis / limitation</TableHead><TableHead>Sections</TableHead><TableHead>Authors</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
                <TableBody>
                  {LOGBOOK_BOOKS.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell><Link to={`/vessel/logbooks/${b.slug}`} className="font-medium text-primary hover:underline">{b.title}</Link><span className="block text-xs text-muted-foreground">{b.code} · {b.statutory ? 'Statutory' : 'Operational'}</span></TableCell>
                      <TableCell><strong>{b.basis}</strong><span className="block text-xs text-muted-foreground">{referenceFor(b).note}</span></TableCell>
                      <TableCell>{b.sections.length}</TableCell>
                      <TableCell className="text-xs">{b.roles.join(', ')} · master</TableCell>
                      <TableCell><a href={referenceFor(b).url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{referenceFor(b).title} ↗</a></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="approval" className="space-y-4">
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader><TableRow><TableHead>Book</TableHead><TableHead>Flag</TableHead><TableHead>Route</TableHead><TableHead>Reference</TableHead><TableHead>Outstanding</TableHead></TableRow></TableHeader>
                <TableBody>
                  {APPROVAL_ROUTES.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.book}</TableCell><TableCell>{r.flag}</TableCell><TableCell>{r.route}</TableCell>
                      <TableCell><a href={r.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{r.reference} ↗</a></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.gap}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <section className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
              <h2 className="font-semibold">Outstanding requirements before statutory use</h2>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Exact current publisher facsimiles and complete amended statutory schedules for each book and flag.</li>
                <li>Advanced electronic signatures with identity assurance; the attestations recorded here are reviewed statements by authenticated platform users.</li>
                <li>Onboard operation during loss of connectivity, tested backups and restore drills, and retention enforcement (10 years for the official log).</li>
                <li>Live AMCS / NMEA gateway with a read-only equipment interface and installation verification on the vessel.</li>
                <li>System assessment by the flag or its recognised organisation, plus the vessel-specific declaration or acceptance letter.</li>
              </ul>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default LogbookAssurance;

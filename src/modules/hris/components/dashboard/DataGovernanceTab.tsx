import React, { useMemo, useState } from 'react';
import { Archive, Download, Shield, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useGDPRRequests } from '@/modules/compliance/hooks/useGDPRRequests';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useHrCrewDirectory, type HrCrewDirectoryEntry } from '@/modules/hris/hooks/useHrCrewDirectory';
import { useHrGovernance } from '@/modules/hris/hooks/useHrDashboard';
import { expiryTone, formatDate, humanise, toneClass } from '@/modules/hris/lib/format';

const BASIS_CLASS: Record<string, string> = {
  contractual: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  legal_obligation: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  legitimate_interest: 'bg-green-500/10 text-green-600 border-green-500/20',
  consent: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  vital_interests: 'bg-destructive/10 text-destructive border-destructive/20',
  public_task: 'bg-muted text-muted-foreground border-border',
};

const REQUEST_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  in_progress: 'bg-primary/10 text-primary border-primary/20',
  completed: 'bg-green-500/10 text-green-600 border-green-500/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
};

/** Retention policies next to live record counts, GDPR requests, and the DPA actions. */
export const DataGovernanceTab: React.FC = () => {
  const governance = useHrGovernance();
  const gdpr = useGDPRRequests();
  const directory = useHrCrewDirectory({ includeInactive: true });
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportEntry, setExportEntry] = useState<HrCrewDirectoryEntry | null>(null);

  const canAdmin = !governance.access.loading && governance.access.canAdmin;
  const dueTotal = governance.summary.reduce((s, g) => s + g.dueForArchive, 0);
  const nameByUser = useMemo(() => new Map(directory.all.filter((e) => e.user_id).map((e) => [e.user_id as string, e.displayName])), [directory.all]);

  const runExport = async () => {
    if (!exportEntry) return;
    await governance.exportCrew.mutateAsync(exportEntry);
    setExportOpen(false);
    setExportEntry(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">
          Retention periods and lawful bases come from the company&apos;s retention policies; counts are live from the HR record register.
          Records are archived, never deleted, and only a DPA can anonymise.
        </p>
        {canAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
              <Download className="mr-2 h-4 w-4" /> Export crew data (GDPR)
            </Button>
            <Button size="sm" variant={dueTotal > 0 ? 'default' : 'outline'} disabled={dueTotal === 0 || governance.archiveDue.isPending} onClick={() => setConfirmArchive(true)}>
              <Archive className="mr-2 h-4 w-4" /> Archive due records{dueTotal > 0 ? ` (${dueTotal})` : ''}
            </Button>
          </div>
        )}
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Retention by record type
          </CardTitle>
          <CardDescription>Policy on the left, what the register currently holds on the right.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {governance.isLoading ? (
            <div className="space-y-2 px-6 pb-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : governance.error ? (
            <p className="px-6 pb-6 text-sm text-destructive">{governance.error instanceof Error ? governance.error.message : 'Could not load retention data.'}</p>
          ) : governance.summary.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No retention policies or registered HR records for this company yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Record type</TableHead>
                    <TableHead>Retention</TableHead>
                    <TableHead className="hidden md:table-cell">Trigger</TableHead>
                    <TableHead>Lawful basis</TableHead>
                    <TableHead className="hidden lg:table-cell">Purpose</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                    <TableHead className="text-right">Archived</TableHead>
                    <TableHead className="text-right">Anonymised</TableHead>
                    <TableHead className="text-right">Due for archive</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {governance.summary.map((g) => (
                    <TableRow key={g.record_type}>
                      <TableCell className="font-medium">{humanise(g.record_type)}</TableCell>
                      <TableCell>{g.policy ? `${g.policy.retention_years} yr${g.policy.retention_years === 1 ? '' : 's'}` : <span className="text-muted-foreground">No policy (7 yrs default)</span>}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{g.policy ? humanise(g.policy.retention_trigger) : '—'}</TableCell>
                      <TableCell>
                        {g.policy ? (
                          <Badge variant="outline" className={cn('text-[10px]', BASIS_CLASS[g.policy.gdpr_lawful_basis] ?? 'bg-muted')}>
                            <Shield className="mr-1 h-3 w-3" /> {humanise(g.policy.gdpr_lawful_basis)}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-[260px] truncate text-muted-foreground lg:table-cell" title={g.policy?.gdpr_purpose}>
                        {g.policy?.gdpr_purpose ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{g.active}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.archived}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.anonymized}</TableCell>
                      <TableCell className="text-right">
                        {g.dueForArchive > 0 ? (
                          <Badge variant="outline" className={cn('text-[10px]', toneClass.critical)}>
                            {g.dueForArchive}
                          </Badge>
                        ) : (
                          <span className="tabular-nums text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">GDPR data subject requests</CardTitle>
          <CardDescription>Access, portability, rectification and erasure requests with their 30-day deadline.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {gdpr.isLoading ? (
            <div className="space-y-2 px-6 pb-6">
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !gdpr.gdprRequests || gdpr.gdprRequests.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No GDPR requests recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead className="hidden md:table-cell">Processed</TableHead>
                    <TableHead className="hidden lg:table-cell">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gdpr.gdprRequests.map((r) => {
                    const openReq = r.status === 'pending' || r.status === 'in_progress';
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium capitalize">{humanise(r.request_type)}</TableCell>
                        <TableCell>{nameByUser.get(r.subject_user_id) ?? <span className="font-mono text-xs text-muted-foreground">{r.subject_user_id.slice(0, 8)}…</span>}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px]', REQUEST_STATUS_CLASS[r.status] ?? 'bg-muted')}>
                            {humanise(r.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(r.requested_at)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {openReq ? (
                            <Badge variant="outline" className={cn('text-[10px]', toneClass[expiryTone(r.deadline_date)])}>
                              {formatDate(r.deadline_date)}
                            </Badge>
                          ) : (
                            formatDate(r.deadline_date)
                          )}
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap md:table-cell">{formatDate(r.processed_at)}</TableCell>
                        <TableCell className="hidden max-w-[280px] truncate text-muted-foreground lg:table-cell" title={r.response_notes ?? undefined}>
                          {r.response_notes ?? '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {dueTotal} record{dueTotal === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every HR record whose retention end date has passed will be marked archived (with the time and your user recorded). The underlying data is kept; anonymisation is a separate step.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void governance.archiveDue.mutateAsync()}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={exportOpen}
        onOpenChange={(o) => {
          setExportOpen(o);
          if (!o) setExportEntry(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export crew data (GDPR)</DialogTitle>
            <DialogDescription>
              Collects the crew member&apos;s profile, contracts, next of kin, assignments, certificates, attachment metadata, reviews, objectives, disciplinary records, compensation, paid payslips and gratuities into one JSON file, and logs a completed portability request.
            </DialogDescription>
          </DialogHeader>
          <CrewPicker value={exportEntry?.id ?? null} onChange={(_, entry) => setExportEntry(entry)} includeInactive />
          {exportEntry && !exportEntry.user_id && (
            <p className="text-xs text-muted-foreground">This is an imported profile without a login, so the export cannot be recorded in the GDPR request log.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)} disabled={governance.exportCrew.isPending}>
              Cancel
            </Button>
            <Button onClick={() => void runExport()} disabled={!exportEntry || governance.exportCrew.isPending}>
              <Download className="mr-2 h-4 w-4" /> {governance.exportCrew.isPending ? 'Exporting…' : 'Export JSON'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DataGovernanceTab;

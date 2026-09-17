import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addMonths, endOfMonth, format, isSameDay, isSameMonth, startOfMonth, startOfWeek,
} from 'date-fns';
import {
  ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, FileDown, List, Lock, PenLine, Plus, Trash2,
} from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { getLogbookBySlug } from '@/modules/logbooks/lib/logbookDefinitions';
import { useLogbook, type LogbookEntry } from '@/modules/logbooks/hooks/useLogbook';
import LogbookEntryForm from '@/modules/logbooks/components/LogbookEntryForm';
import LogbookExportDialog from '@/modules/logbooks/components/LogbookExportDialog';
import { getSheetTemplate } from '@/modules/logbooks/lib/dagonEngineLog';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  submitted: 'outline',
  signed: 'default',
  amended: 'outline',
  finalized: 'default',
};

const statusLabel = (entry: LogbookEntry) => {
  if (entry.status === 'finalized') {
    return entry.finalized_by_name ? `Finalised — ${entry.finalized_by_name}` : 'Finalised';
  }
  if (entry.status === 'signed' && entry.signed_by_name) {
    return `Signed — ${entry.signed_by_name}`;
  }
  return entry.status;
};

const LogbookDetail: React.FC = () => {
  const { logbookSlug } = useParams<{ logbookSlug: string }>();
  const navigate = useNavigate();
  const definition = getLogbookBySlug(logbookSlug);
  const { selectedVessel, vessels, setSelectedVesselById } = useVessel();
  const sheet = getSheetTemplate(logbookSlug, selectedVessel?.name);

  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const [view, setView] = React.useState<'month' | 'records'>('month');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LogbookEntry | null>(null);
  const [dayForNew, setDayForNew] = React.useState<Date | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<LogbookEntry | null>(null);
  const [exportOpen, setExportOpen] = React.useState(false);

  const {
    logbook, entries, isLoading, canSign, currentUserId, hasVessel,
    createEntry, updateEntry, signEntry, finalizeEntry, deleteEntry,
  } = useLogbook(definition, month);

  const entriesByDay = React.useMemo(() => {
    const map = new Map<string, LogbookEntry[]>();
    entries.forEach((entry) => {
      const key = format(new Date(entry.entry_at), 'yyyy-MM-dd');
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    });
    return map;
  }, [entries]);

  const calendarDays = React.useMemo(() => {
    const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const last = endOfMonth(month);
    const days: Date[] = [];
    const cursor = new Date(first);
    while (cursor <= last || days.length % 7 !== 0) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [month]);

  if (!definition) {
    return (
      <DashboardLayout>
        <div className="space-y-4 p-1">
          <h1 className="text-2xl font-bold text-foreground">Logbook not found</h1>
          <Button asChild variant="outline">
            <Link to="/vessel/logbooks/list">Back to all logbooks</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const Icon = definition.icon;

  const openNew = (day?: Date) => {
    setEditing(null);
    setDayForNew(day ?? null);
    setFormOpen(true);
  };

  const openEdit = (entry: LogbookEntry) => {
    setEditing(entry);
    setDayForNew(null);
    setFormOpen(true);
  };

  const canEditEntry = (entry: LogbookEntry) =>
    entry.status !== 'finalized'
    && (canSign || (entry.recorded_by === currentUserId && entry.status === 'draft'));

  return (
    <DashboardLayout>
      <div className="space-y-6 p-1">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/vessel/logbooks/list')}>
              <ArrowLeft className="mr-1 h-4 w-4" /> All logbooks
            </Button>
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{definition.label}</h1>
                <p className="text-sm text-muted-foreground">
                  {selectedVessel?.name ?? 'No vessel selected'} · {definition.statutory ? 'Statutory record' : 'Operational record'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {vessels.length > 0 && (
              <Select
                value={selectedVessel?.id ?? ''}
                onValueChange={(value) => setSelectedVesselById(value)}
              >
                <SelectTrigger className="w-[13rem]" aria-label="Select vessel">
                  <SelectValue placeholder="Select vessel" />
                </SelectTrigger>
                <SelectContent>
                  {vessels.map((vessel) => (
                    <SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Tabs value={view} onValueChange={(value) => setView(value as 'month' | 'records')}>
              <TabsList>
                <TabsTrigger value="month"><CalendarDays className="mr-1 h-4 w-4" /> Month</TabsTrigger>
                <TabsTrigger value="records"><List className="mr-1 h-4 w-4" /> Records</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-1 rounded-md border border-border px-1">
              <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[8.5rem] text-center text-sm font-semibold">
                {format(month, 'MMMM yyyy')}
              </span>
              <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" onClick={() => setExportOpen(true)} disabled={!hasVessel}>
              <FileDown className="mr-1 h-4 w-4" /> Export PDF
            </Button>
            <Button onClick={() => openNew()} disabled={!hasVessel}>
              <Plus className="mr-1 h-4 w-4" /> New entry
            </Button>
          </div>
        </div>

        {!hasVessel && (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Select a vessel from the menu in the lower left to view or add logbook entries.
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : view === 'month' ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'} in {format(month, 'MMMM yyyy')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px border-b border-border pb-2 text-center text-xs font-semibold uppercase text-muted-foreground">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {calendarDays.map((day) => {
                  const key = format(day, 'yyyy-MM-dd');
                  const dayEntries = entriesByDay.get(key) ?? [];
                  const outside = !isSameMonth(day, month);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => openNew(day)}
                      className={`min-h-[6.5rem] rounded-md border p-2 text-left align-top transition-colors hover:border-primary/50 hover:bg-accent/40 ${
                        outside ? 'border-border/50 bg-muted/30 text-muted-foreground' : 'border-border bg-card'
                      } ${isSameDay(day, new Date()) ? 'ring-1 ring-primary' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{format(day, 'd')}</span>
                        {dayEntries.length > 0 && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                            {dayEntries.length}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 space-y-1">
                        {dayEntries.slice(0, 3).map((entry) => (
                          <span
                            key={entry.id}
                            role="link"
                            tabIndex={0}
                            onClick={(event) => { event.stopPropagation(); openEdit(entry); }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') { event.stopPropagation(); openEdit(entry); }
                            }}
                            className={`block truncate rounded px-1 py-0.5 text-[11px] ${
                              entry.status === 'signed'
                                ? 'bg-primary/15 text-primary'
                                : 'bg-muted text-foreground'
                            }`}
                            title={entry.summary ?? ''}
                          >
                            {format(new Date(entry.entry_at), 'HH:mm')} {entry.summary}
                          </span>
                        ))}
                        {dayEntries.length > 3 && (
                          <span className="block text-[11px] text-muted-foreground">
                            +{dayEntries.length - 3} more
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Records — {format(month, 'MMMM yyyy')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date &amp; time</TableHead>
                    <TableHead>Watch</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Recorded by</TableHead>
                    <TableHead>Last updated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(entry.entry_at), 'dd MMM yyyy HH:mm')}
                      </TableCell>
                      <TableCell>{entry.watch_period ?? '—'}</TableCell>
                      <TableCell className="max-w-[22rem]">
                        <span className="block font-medium">{entry.summary}</span>
                        {entry.remarks && (
                          <span className="block truncate text-xs text-muted-foreground">{entry.remarks}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="block">{entry.recorded_by_name ?? '—'}</span>
                        <span className="block text-xs text-muted-foreground">
                          {format(new Date(entry.created_at), 'dd MMM yyyy HH:mm')}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(entry.updated_at), 'dd MMM yyyy HH:mm')}
                        {entry.updated_by_name ? ` — ${entry.updated_by_name}` : ''}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[entry.status] ?? 'secondary'}>
                          {statusLabel(entry)}
                        </Badge>
                        {entry.signed_at && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Signed off {format(new Date(entry.signed_at), 'dd MMM yyyy HH:mm')}
                          </span>
                        )}
                        {entry.finalized_at && (
                          <span className="block text-xs text-muted-foreground">
                            Finalised {format(new Date(entry.finalized_at), 'dd MMM yyyy HH:mm')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canEditEntry(entry) && (
                            <Button variant="ghost" size="icon" aria-label="Edit entry" onClick={() => openEdit(entry)}>
                              <PenLine className="h-4 w-4" />
                            </Button>
                          )}
                          {canSign && entry.status !== 'signed' && entry.status !== 'finalized' && (
                            <Button variant="outline" size="sm" onClick={() => signEntry.mutate(entry.id)}>
                              Sign off
                            </Button>
                          )}
                          {canSign && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={entry.status !== 'signed' || finalizeEntry.isPending}
                              title={
                                entry.status === 'finalized'
                                  ? 'Already finalised'
                                  : entry.status === 'signed'
                                    ? 'Lock this entry'
                                    : 'Sign off the entry before finalising it'
                              }
                              onClick={() => finalizeEntry.mutate(entry)}
                            >
                              <Lock className="mr-1 h-3.5 w-3.5" />
                              {entry.status === 'finalized' ? 'Finalised' : 'Finalise'}
                            </Button>
                          )}
                          {canEditEntry(entry) && (
                            <Button
                              variant="ghost" size="icon" aria-label="Delete entry"
                              onClick={() => setPendingDelete(entry)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        No entries recorded in {format(month, 'MMMM yyyy')}.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <LogbookEntryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        definition={definition}
        sheet={sheet}
        entry={editing}
        defaultDate={dayForNew}
        saving={createEntry.isPending || updateEntry.isPending}
        logbookId={logbook?.id ?? null}
        companyId={logbook?.company_id ?? null}
        vesselId={logbook?.vessel_id ?? selectedVessel?.id ?? null}
        canManageAttachments={
          canSign || !editing || editing.recorded_by === currentUserId
        }
        onSubmit={(input) => {
          if (editing) {
            updateEntry.mutate({ id: editing.id, input }, { onSuccess: () => setFormOpen(false) });
          } else {
            createEntry.mutate(input, {
              // Keep the dialog open on the saved entry so files can be attached straight away.
              onSuccess: (created) => setEditing(created as unknown as LogbookEntry),
            });
          }
        }}
        onDelete={editing && canEditEntry(editing) ? (entry) => setPendingDelete(entry) : undefined}
      />

      <LogbookExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        definition={definition}
        sheet={sheet}
        logbookId={logbook?.id ?? null}
        vesselName={selectedVessel?.name ?? null}
        month={month}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this logbook entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${format(new Date(pendingDelete.entry_at), 'dd MMM yyyy HH:mm')} — ${pendingDelete.summary ?? 'No summary'}. `
                : ''}
              The entry, its attachments and its history will be removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep entry</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const target = pendingDelete;
                if (!target) return;
                deleteEntry.mutate(target.id, {
                  onSuccess: () => {
                    setPendingDelete(null);
                    // Close the editor too when the deleted entry was open in it.
                    if (editing?.id === target.id) {
                      setEditing(null);
                      setFormOpen(false);
                    }
                  },
                });
              }}
            >
              Delete entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default LogbookDetail;

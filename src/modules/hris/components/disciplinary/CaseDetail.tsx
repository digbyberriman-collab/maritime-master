import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Link2,
  Loader2,
  Lock,
  MapPin,
  Pencil,
  RotateCcw,
  Scale,
  Ship,
  StepForward,
  Trash2,
  Upload,
  UserRound,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useToast } from '@/shared/hooks/use-toast';
import { downloadCrewDocument, getCrewDocumentSignedUrl } from '@/lib/storage/crewDocuments';
import { formatDate, formatDateTime, humanise } from '@/modules/hris/lib/format';
import { DEFAULT_DISCIPLINARY_FILTERS, daysToExpiry, isLiveWarning, lifecycleState, retentionYears } from '@/modules/hris/lib/disciplinary';
import { useDisciplinaryMutations, useDisciplinaryRecord, useDisciplinaryRecords, type DisciplinaryRecord } from '@/modules/hris/hooks/useDisciplinary';
import { AppealBadge, LifecycleBadge, SeverityBadge, StageBadge } from './DisciplinaryBadges';
import { StageChangeDialog } from './StageChangeDialog';
import { AppealDialog } from './AppealDialog';

const ACCEPTED_DOCUMENTS = '.pdf,.doc,.docx,.png,.jpg,.jpeg';

interface CaseDetailProps {
  recordId: string | null;
  onOpenChange: (open: boolean) => void;
  canAdmin: boolean;
  onEdit: (record: DisciplinaryRecord) => void;
  /** Called after a delete so the parent can drop any stale selection. */
  onDeleted?: () => void;
}

const Meta: React.FC<{ icon: React.ElementType; label: string; children: React.ReactNode }> = ({ icon: Icon, label, children }) => (
  <div className="flex items-start gap-2 text-sm">
    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-foreground">{children}</div>
    </div>
  </div>
);

const Block: React.FC<{ title: string; children: React.ReactNode; restricted?: boolean }> = ({ title, children, restricted }) => (
  <div className={cn('space-y-1', restricted && 'rounded-md border border-destructive/30 bg-destructive/5 p-3')}>
    <p className={cn('flex items-center gap-1 text-xs font-semibold uppercase tracking-wide', restricted ? 'text-destructive' : 'text-muted-foreground')}>
      {restricted && <Lock className="h-3 w-3" />} {title}
    </p>
    <div className="whitespace-pre-wrap text-sm text-foreground">{children}</div>
  </div>
);

/**
 * Full case file for HR editors. Opening it writes a VIEW entry to the
 * audit log, once per opening.
 */
export const CaseDetail: React.FC<CaseDetailProps> = ({ recordId, onOpenChange, canAdmin, onEdit, onDeleted }) => {
  const { toast } = useToast();
  const detail = useDisciplinaryRecord(recordId);
  const record = detail.data ?? null;
  const mutations = useDisciplinaryMutations();
  const siblingFilters = useMemo(() => ({ ...DEFAULT_DISCIPLINARY_FILTERS, crewId: record?.profile_id ?? 'all' }), [record?.profile_id]);
  const siblings = useDisciplinaryRecords(siblingFilters, { enabled: Boolean(record?.profile_id) });

  const [stageOpen, setStageOpen] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const loggedFor = useRef<string | null>(null);
  const { logView } = mutations;

  useEffect(() => {
    if (recordId && loggedFor.current !== recordId) {
      loggedFor.current = recordId;
      logView(recordId);
    }
    if (!recordId) loggedFor.current = null;
  }, [recordId, logView]);

  const busy =
    mutations.update.isPending ||
    mutations.setStage.isPending ||
    mutations.lodgeAppeal.isPending ||
    mutations.resolveAppeal.isPending ||
    mutations.close.isPending ||
    mutations.reopen.isPending ||
    mutations.uploadDocument.isPending ||
    mutations.remove.isPending;

  const state = record ? lifecycleState(record) : null;
  const live = record ? isLiveWarning(record) : false;
  const days = record ? daysToExpiry(record) : null;

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !record) return;
    await mutations.uploadDocument.mutateAsync({ record, file, crewUserId: record.crew_user_id ?? record.profile_id });
  };

  const preview = async () => {
    if (!record) return;
    try {
      const url = await getCrewDocumentSignedUrl(record.document_path);
      if (!url) throw new Error('Document has no storage path');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({ title: 'Preview failed', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
    }
  };

  const download = async () => {
    if (!record) return;
    try {
      await downloadCrewDocument(record.document_path, record.document_name ?? `disciplinary-${record.id}.pdf`);
    } catch (err) {
      toast({ title: 'Download failed', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!record) return;
    await mutations.remove.mutateAsync(record);
    setConfirmDelete(false);
    onOpenChange(false);
    onDeleted?.();
  };

  return (
    <Sheet open={Boolean(recordId)} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {detail.isLoading || !record ? (
          <div className="space-y-4 p-6">
            <SheetHeader>
              <SheetTitle className="sr-only">Case</SheetTitle>
              <SheetDescription className="sr-only">Loading case</SheetDescription>
            </SheetHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <>
            <div className="space-y-4 border-b p-6">
              <SheetHeader className="space-y-2 text-left">
                <div className="flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={record.severity} />
                  <StageBadge stage={record.stage} />
                  <LifecycleBadge record={record} />
                  <AppealBadge appeal={record.appeal_status} />
                </div>
                <SheetTitle className="pr-6 text-lg leading-snug">
                  {humanise(record.category)} · {formatDate(record.incident_date)}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-destructive" /> Restricted case file for {record.crew_name}
                  {record.crew_rank ? ` · ${record.crew_rank}` : ''}. This view has been logged.
                </SheetDescription>
              </SheetHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <Meta icon={CalendarDays} label="Incident date">{formatDate(record.incident_date)}</Meta>
                <Meta icon={Ship} label="Vessel">{record.vessel_name ?? '—'}</Meta>
                <Meta icon={UserRound} label="Issued by">{record.issued_by_name ?? '—'}</Meta>
                <Meta icon={Clock} label="Live until">
                  {record.expiry_date ? (
                    <span className={cn(live && days !== null && days <= 30 && 'text-yellow-500')}>
                      {formatDate(record.expiry_date)}
                      {live && days !== null && ` · ${days < 0 ? 'lapsed' : days === 0 ? 'today' : `${days}d left`}`}
                    </span>
                  ) : (
                    'Does not lapse'
                  )}
                </Meta>
                {record.incident_number && (
                  <Meta icon={Link2} label="Linked incident">
                    {record.incident_number}
                    {record.incident_type && <span className="text-muted-foreground"> · {humanise(record.incident_type)}</span>}
                  </Meta>
                )}
                {record.incident_location && <Meta icon={MapPin} label="Incident location">{record.incident_location}</Meta>}
                <Meta icon={CheckCircle2} label="Crew acknowledgement">
                  {record.acknowledged_by_crew_at ? (
                    <span className="text-green-500">Acknowledged {formatDateTime(record.acknowledged_by_crew_at)}</span>
                  ) : record.stage === 'investigation' ? (
                    <span className="text-muted-foreground">Not visible to crew while under investigation</span>
                  ) : (
                    <span className="text-muted-foreground">Awaiting acknowledgement</span>
                  )}
                </Meta>
                <Meta icon={Scale} label="Retention">
                  {retentionYears(record.severity)} years from incident date
                </Meta>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(record)} disabled={busy}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => setStageOpen(true)} disabled={busy || record.status === 'overturned'}>
                  <StepForward className="mr-2 h-3.5 w-3.5" /> Change stage
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAppealOpen(true)} disabled={busy || record.appeal_status === 'overturned'}>
                  <Scale className="mr-2 h-3.5 w-3.5" /> {record.appeal_status === 'lodged' ? 'Resolve appeal' : 'Appeal'}
                </Button>
                {record.status === 'open' ? (
                  <Button size="sm" variant="outline" onClick={() => mutations.close.mutate(record)} disabled={busy}>
                    <XCircle className="mr-2 h-3.5 w-3.5" /> Close case
                  </Button>
                ) : record.status !== 'overturned' ? (
                  <Button size="sm" variant="outline" onClick={() => mutations.reopen.mutate(record)} disabled={busy}>
                    <RotateCcw className="mr-2 h-3.5 w-3.5" /> Reopen
                  </Button>
                ) : null}
                {canAdmin && (
                  <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-4 border-b p-6">
              <Block title="Description">{record.description}</Block>
              {record.outcome || record.outcome_date ? (
                <Block title={`Outcome${record.outcome_date ? ` · ${formatDate(record.outcome_date)}` : ''}`}>{record.outcome ?? '—'}</Block>
              ) : null}
              {record.appeal_status !== 'none' && (
                <Block title={`Appeal · ${humanise(record.appeal_status)}`}>{record.appeal_notes ?? 'No notes recorded.'}</Block>
              )}
              {state === 'overturned' && (
                <p className="text-xs text-muted-foreground">This record was overturned on appeal and no longer counts towards progressive discipline.</p>
              )}
            </div>

            <div className="space-y-3 border-b p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document</p>
                <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
                  {mutations.uploadDocument.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
                  {record.document_path ? 'Replace' : 'Upload'}
                </Button>
              </div>
              {record.document_path ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{record.document_name ?? 'Attached document'}</span>
                  <Button size="sm" variant="ghost" onClick={() => void preview()}><Eye className="mr-1.5 h-3.5 w-3.5" /> Preview</Button>
                  <Button size="sm" variant="ghost" onClick={() => void download()}><Download className="mr-1.5 h-3.5 w-3.5" /> Download</Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No signed letter or supporting document attached.</p>
              )}
              <input ref={fileInput} type="file" accept={ACCEPTED_DOCUMENTS} className="hidden" onChange={(e) => void handleFileChosen(e)} />
            </div>

            <div className="space-y-4 p-6">
              <Block title="Investigation notes" restricted>{record.investigation_notes ?? <span className="text-muted-foreground">None recorded.</span>}</Block>
              <Block title="Witness statements" restricted>{record.witness_statements ?? <span className="text-muted-foreground">None recorded.</span>}</Block>
              <Separator />
              <p className="text-[11px] text-muted-foreground">
                Created {formatDateTime(record.created_at)} · Last updated {formatDateTime(record.updated_at)}
              </p>
            </div>
          </>
        )}
      </SheetContent>

      <StageChangeDialog
        open={stageOpen}
        onOpenChange={setStageOpen}
        record={record}
        existingRecords={siblings.all}
        isPending={mutations.setStage.isPending}
        onConfirm={async (values) => {
          if (!record) return;
          await mutations.setStage.mutateAsync({ record, ...values });
          setStageOpen(false);
        }}
      />

      <AppealDialog
        open={appealOpen}
        onOpenChange={setAppealOpen}
        record={record}
        isPending={mutations.lodgeAppeal.isPending || mutations.resolveAppeal.isPending}
        onLodge={async (notes) => {
          if (!record) return;
          await mutations.lodgeAppeal.mutateAsync({ record, notes });
          setAppealOpen(false);
        }}
        onResolve={async (result, notes) => {
          if (!record) return;
          await mutations.resolveAppeal.mutateAsync({ record, result, notes });
          setAppealOpen(false);
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              Disciplinary records are normally retained for {record ? retentionYears(record.severity) : 7} years. Delete only if it was created in error;
              otherwise close or overturn it so the history stays complete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutations.remove.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutations.remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
};

export default CaseDetail;

/**
 * ISM › Form archive (`/ism/forms/archive`): signed and archived form
 * submissions.
 *
 * - A failed read is an error with Retry, never an empty archive.
 * - Export (gap/08 EX1, EX4, EX7): the list on screen through the export
 *   engine (`@/lib/export`, PR-13): logged before the file is made, with
 *   the filters as ids only; it names the people who submitted the forms,
 *   so it is personal data and is refused, in words, while the export log
 *   is not set up (D-X5-12). Never a success toast without a file.
 * - A PDF of one signed form is the record PDF (EX2), which does not exist
 *   yet: the per-row button is disabled and says so. (It used to report
 *   "PDF downloaded" after a second without making a file.)
 * - Reads only; template statuses are not written here.
 */
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Archive, Calendar, CheckCircle2, Download, Eye, FileText, Filter, Search, Ship, User } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import PageHeader from '@/shared/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { KpiTile, type KpiTileState } from '@/shared/components/data';
import { ExportMenu } from '@/shared/components/data/ExportMenu';
import { StatusPill } from '@/shared/components/status';
import { EmptyState, PageError, PageLoading } from '@/shared/components/states';
import { runExport, type ExportColumn, type ExportFormat } from '@/lib/export';

const COARSE = '[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11';
const DAY_MS = 24 * 60 * 60 * 1000;

const ARCHIVE_EXPORT_SOURCE = 'ism.forms_archive';
const SINGLE_PDF_REASON = 'A PDF of one signed form is not available yet. Open the form to view it, or export the list.';

type DateRange = 'all' | 'week' | 'month' | 'quarter' | 'year';

interface ArchivedSubmission {
  id: string;
  submissionNumber: string | null;
  templateId: string | null;
  templateName: string;
  status: string;
  submittedAt: string | null;
  submittedBy: string | null;
  vesselName: string | null;
  signatureCount: number;
}

type Named = { template_name?: string | null } | null;
type VesselRef = { name?: string | null } | null;
type PersonRef = { first_name?: string | null; last_name?: string | null } | null;
type SignatureRef = { id: string; status: string | null };
interface ArchiveRow {
  id: string;
  submission_number: string | null;
  template_id: string | null;
  status: string | null;
  submitted_at: string | null;
  template: Named | Named[];
  vessel: VesselRef | VesselRef[];
  submitter: PersonRef | PersonRef[];
  signatures: SignatureRef[] | null;
}

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

function toArchived(row: ArchiveRow): ArchivedSubmission {
  const submitter = one(row.submitter);
  return {
    id: row.id,
    submissionNumber: row.submission_number,
    templateId: row.template_id,
    templateName: one(row.template)?.template_name ?? 'Template not available',
    status: row.status ?? 'SIGNED',
    submittedAt: row.submitted_at,
    submittedBy: [submitter?.first_name, submitter?.last_name].filter(Boolean).join(' ') || null,
    vesselName: one(row.vessel)?.name ?? null,
    signatureCount: (row.signatures ?? []).filter((s) => s.status === 'SIGNED').length,
  };
}

function rangeStart(range: DateRange, now = new Date()): Date | null {
  const start = new Date(now);
  switch (range) {
    case 'week':
      start.setDate(start.getDate() - 7);
      return start;
    case 'month':
      start.setMonth(start.getMonth() - 1);
      return start;
    case 'quarter':
      start.setMonth(start.getMonth() - 3);
      return start;
    case 'year':
      start.setFullYear(start.getFullYear() - 1);
      return start;
    default:
      return null;
  }
}

/** The archive register's columns (EX1): what is on screen, nothing more. */
const ARCHIVE_EXPORT_COLUMNS: readonly ExportColumn<ArchivedSubmission>[] = [
  { key: 'submission_number', header: 'Number', value: (r) => r.submissionNumber },
  { key: 'template', header: 'Form', value: (r) => r.templateName },
  { key: 'vessel', header: 'Vessel', value: (r) => r.vesselName },
  { key: 'submitted_by', header: 'Submitted by', value: (r) => r.submittedBy },
  { key: 'submitted_at', header: 'Submitted', value: (r) => r.submittedAt, kind: 'datetime' },
  { key: 'status', header: 'Status', value: (r) => r.status },
  { key: 'signatures', header: 'Signatures', value: (r) => r.signatureCount, kind: 'number' },
];

export default function FormsArchive() {
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [templateFilter, setTemplateFilter] = useState('all');
  const pdfReasonId = useId();

  const templates = useQuery({
    queryKey: ['form-templates', 'archive-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_templates')
        .select('id, template_name')
        .in('status', ['PUBLISHED', 'ARCHIVED'])
        .order('template_name');
      if (error) throw error;
      return (data ?? []).map((t) => ({ id: t.id, name: t.template_name }));
    },
  });

  const submissions = useQuery({
    queryKey: ['form-submissions', 'archive', templateFilter, dateRange],
    queryFn: async (): Promise<ArchivedSubmission[]> => {
      let query = supabase
        .from('form_submissions')
        .select(`
          id,
          submission_number,
          template_id,
          status,
          submitted_at,
          template:form_templates(template_name),
          vessel:vessels(name),
          submitter:profiles!form_submissions_submitted_by_fkey(first_name, last_name),
          signatures:form_signatures(id, status)
        `)
        .in('status', ['SIGNED', 'ARCHIVED'])
        .order('submitted_at', { ascending: false });
      if (templateFilter !== 'all') query = query.eq('template_id', templateFilter);
      const start = rangeStart(dateRange);
      if (start) query = query.gte('submitted_at', start.toISOString());
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as ArchiveRow[]).map(toArchived);
    },
  });

  const rows = useMemo(() => submissions.data ?? [], [submissions.data]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((s) => [s.templateName, s.submittedBy ?? '', s.vesselName ?? ''].some((v) => v.toLowerCase().includes(term)));
  }, [rows, search]);

  const tileState: KpiTileState = submissions.isError ? 'error' : submissions.isSuccess ? 'ready' : 'loading';
  const thisMonth = rows.filter((s) => s.submittedAt && Date.now() - new Date(s.submittedAt).getTime() < 30 * DAY_MS).length;

  const exportList = (fmt: ExportFormat) =>
    runExport({
      format: fmt,
      kind: 'Signed forms',
      sourceKey: ARCHIVE_EXPORT_SOURCE,
      personalData: true,
      columns: ARCHIVE_EXPORT_COLUMNS,
      rows: filtered,
      params: { template_id: templateFilter === 'all' ? null : templateFilter, range: dateRange, searched: search.trim() !== '' },
    });

  const exportReason = submissions.isLoading
    ? 'Available once the list has loaded'
    : submissions.isError
      ? 'The list could not be loaded'
      : filtered.length === 0
        ? 'Nothing to export'
        : null;

  const renderList = () => {
    if (submissions.isLoading) return <PageLoading variant="list" rows={4} label="Loading the archive" />;
    if (submissions.isError) return <PageError error={submissions.error} title="The archive could not be loaded" onRetry={() => void submissions.refetch()} />;
    if (filtered.length === 0) {
      const narrowed = rows.length > 0 || search.trim() !== '' || templateFilter !== 'all' || dateRange !== 'all';
      return (
        <EmptyState
          kind={narrowed ? 'filtered' : 'first-use'}
          bordered
          icon={Archive}
          title={narrowed ? 'No forms match these filters' : 'No signed forms yet'}
          body={narrowed ? 'Change the search, the form or the dates to see more.' : 'Forms appear here once every signature is in.'}
        />
      );
    }
    return (
      <TooltipProvider>
        <span id={pdfReasonId} className="sr-only">
          {SINGLE_PDF_REASON}
        </span>
        <ul className="space-y-3" aria-label="Signed forms">
          {filtered.map((submission) => (
            <li key={submission.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="type-title break-words">{submission.templateName}</p>
                      <StatusPill domain="form_submission" status={submission.status} />
                      {submission.submissionNumber ? <span className="type-mono text-muted-foreground">{submission.submissionNumber}</span> : null}
                    </div>
                    <p className="type-caption flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                      {submission.submittedBy ? (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" aria-hidden="true" />
                          {submission.submittedBy}
                        </span>
                      ) : null}
                      {submission.vesselName ? (
                        <span className="flex items-center gap-1">
                          <Ship className="h-3 w-3" aria-hidden="true" />
                          {submission.vesselName}
                        </span>
                      ) : null}
                      {submission.submittedAt ? (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" aria-hidden="true" />
                          {format(new Date(submission.submittedAt), 'd MMM yyyy')}
                        </span>
                      ) : null}
                      <span>
                        {submission.signatureCount} {submission.signatureCount === 1 ? 'signature' : 'signatures'}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className={COARSE} asChild>
                      <Link to={`/ism/forms/submission/${submission.id}`}>
                        <Eye className="mr-1 h-4 w-4" aria-hidden="true" />
                        View
                      </Link>
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-disabled="true"
                          aria-describedby={pdfReasonId}
                          data-single-pdf=""
                          className={`${COARSE} aria-disabled:cursor-not-allowed aria-disabled:opacity-60`}
                          onClick={(event) => event.preventDefault()}
                        >
                          <Download className="mr-1 h-4 w-4" aria-hidden="true" />
                          PDF
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{SINGLE_PDF_REASON}</TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </TooltipProvider>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Form archive"
          description="Signed and archived forms. Each one keeps the version of the template it was filled in on."
          actions={
            <ExportMenu onExport={exportList} disabledReason={exportReason} label="Export list" className={COARSE} />
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {/* Counts, not alerts: a zero is just "0", never "All clear". */}
          <KpiTile label="Signed forms" icon={CheckCircle2} state={tileState} value={submissions.isSuccess ? rows.length : null} />
          <KpiTile label="Forms used" icon={FileText} state={tileState} value={submissions.isSuccess ? new Set(rows.map((s) => s.templateId)).size : null} />
          <KpiTile
            label="Vessels"
            icon={Ship}
            state={tileState}
            value={submissions.isSuccess ? new Set(rows.filter((s) => s.vesselName).map((s) => s.vesselName)).size : null}
          />
          <KpiTile label="Last 30 days" icon={Calendar} state={tileState} value={submissions.isSuccess ? thisMonth : null} />
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  placeholder="Search by form, person or vessel"
                  aria-label="Search the archive"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={templateFilter} onValueChange={setTemplateFilter}>
                <SelectTrigger className="w-full sm:w-[220px]" aria-label="Form">
                  <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
                  <SelectValue placeholder="Form" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All forms</SelectItem>
                  {(templates.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRange)}>
                <SelectTrigger className="w-full sm:w-[170px]" aria-label="Dates">
                  <Calendar className="mr-2 h-4 w-4" aria-hidden="true" />
                  <SelectValue placeholder="Dates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="week">Past week</SelectItem>
                  <SelectItem value="month">Past month</SelectItem>
                  <SelectItem value="quarter">Past quarter</SelectItem>
                  <SelectItem value="year">Past year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {templates.isError ? (
              <p role="alert" className="type-caption mt-2 text-critical">
                The list of forms could not be loaded, so the form filter shows all forms only.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {renderList()}
      </div>
    </DashboardLayout>
  );
}

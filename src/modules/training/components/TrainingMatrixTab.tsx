import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TONE_SURFACE, type Tone } from '@/components/ui/tones';
import { cn } from '@/lib/utils';
import { useTraining } from '@/modules/training/hooks/useTraining';
import { useCrew } from '@/modules/crew/hooks/useCrew';
import { useScopedPath } from '@/app/router/scopes';
import { MatrixGrid, type MatrixColumn, type ChipFilter } from '@/shared/components/data';
import { PageLoading } from '@/shared/components/states';
import { humanizeStatus, statusMeta } from '@/shared/components/status';
import { notifyExportResult, runExport, type ExportColumn } from '@/lib/export';
import { format } from 'date-fns';
import { Grid3X3, Check, X, AlertTriangle, Download, Minus, type LucideIcon } from 'lucide-react';

type CellRecord = { status: string; expiry: string | null };

/** How a matrix cell reads: tone from the training status registry, an icon so it never relies on colour. */
const CELL_LOOK: Record<string, { icon: LucideIcon; tone: Tone }> = {
  Valid: { icon: Check, tone: statusMeta('training', 'Valid').tone },
  Expiring_Soon: { icon: AlertTriangle, tone: statusMeta('training', 'Expiring_Soon').tone },
  Expired: { icon: X, tone: statusMeta('training', 'Expired').tone },
};
const NO_RECORD_LOOK = { icon: Minus, tone: 'neutral' as Tone };

/** A course nobody recorded for the person: a fact about the records, not a compliance gap (that is Crew Compliance's). */
export const NO_RECORD = 'No record';

function StatusDot({ status }: { status: string | null }) {
  const look = (status && CELL_LOOK[status]) || NO_RECORD_LOOK;
  const Icon = look.icon;
  return (
    <span
      aria-hidden="true"
      className={cn('flex h-6 w-6 items-center justify-center rounded-full border', TONE_SURFACE[look.tone])}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

const cellText = (record: CellRecord | null) => (record ? statusMeta('training', record.status).label : NO_RECORD);

const LEGEND: Array<{ status: string | null; label: string }> = [
  { status: 'Valid', label: 'Valid' },
  { status: 'Expiring_Soon', label: 'Expiring soon (within 90 days)' },
  { status: 'Expired', label: 'Expired' },
  { status: null, label: NO_RECORD },
];

/**
 * Course records (Training › Course records): the crew's training records
 * for the catalogue's core courses, as a MatrixGrid (crew × courses, a
 * sticky crew column, course categories as column groups, each cell an
 * icon, the status word and the expiry month), with counts and a CSV.
 *
 * X1-06B: this is no longer a compliance source. It used to call every
 * core course "required" for everyone and score an "overall compliance"
 * from it; what each position must hold is set per vessel in Crew
 * Compliance (the requirement engine, gap/04 C33 / C35), which the tab
 * links to. A course without a record reads "No record", never "Missing".
 * The non-working vessel filter is gone.
 */
const TrainingMatrixTab: React.FC = () => {
  const { trainingRecords, courses, isLoading } = useTraining();
  const { crew } = useCrew();
  const scopedPath = useScopedPath();
  const [exporting, setExporting] = useState(false);

  const crewWithTraining = useMemo(
    () =>
      crew.map(member => {
        const recordsByCourse: Record<string, CellRecord> = {};
        for (const record of trainingRecords) {
          if (record.user_id === member.user_id && record.course) {
            recordsByCourse[record.course.id] = { status: record.status, expiry: record.expiry_date };
          }
        }
        return { ...member, trainingRecords: recordsByCourse };
      }),
    [crew, trainingRecords],
  );

  type MatrixRow = (typeof crewWithTraining)[number];

  // The catalogue's core courses (is_mandatory), grouped by category so each group sits under one header.
  const coreCourses = useMemo(() => {
    const core = courses.filter(c => c.is_mandatory);
    const order = Array.from(new Set(core.map(c => c.course_category)));
    return core
      .map((course, index) => ({ course, index }))
      .sort((a, b) => order.indexOf(a.course.course_category) - order.indexOf(b.course.course_category) || a.index - b.index)
      .map(({ course }) => course);
  }, [courses]);

  const columns = useMemo<MatrixColumn[]>(
    () =>
      coreCourses.map(course => ({
        id: course.id,
        label: course.course_code,
        sublabel: course.course_name,
        title: `${course.course_code} · ${course.course_name}`,
        group: course.course_category || undefined,
        width: 100,
      })),
    [coreCourses],
  );

  const groups = useMemo(
    () =>
      Array.from(new Set(coreCourses.map(c => c.course_category).filter(Boolean))).map(category => ({
        id: category,
        label: humanizeStatus(category),
      })),
    [coreCourses],
  );

  const filters = useMemo<ChipFilter<MatrixRow>[]>(
    () => [
      {
        id: 'expired',
        label: 'Expired',
        predicate: member => coreCourses.some(course => member.trainingRecords[course.id]?.status === 'Expired'),
      },
      {
        id: 'expiring',
        label: 'Expiring soon',
        predicate: member => coreCourses.some(course => member.trainingRecords[course.id]?.status === 'Expiring_Soon'),
      },
    ],
    [coreCourses],
  );

  // Counts of the cells: records by status, and the courses without one.
  const counts = useMemo(() => {
    const summary = { valid: 0, expiring: 0, expired: 0, none: 0 };
    for (const member of crewWithTraining) {
      for (const course of coreCourses) {
        const record = member.trainingRecords[course.id];
        if (!record) summary.none++;
        else if (record.status === 'Valid') summary.valid++;
        else if (record.status === 'Expiring_Soon') summary.expiring++;
        else if (record.status === 'Expired') summary.expired++;
      }
    }
    return summary;
  }, [crewWithTraining, coreCourses]);

  const exportCsv = async () => {
    const cellOf = (member: MatrixRow, courseId: string) => {
      const record = member.trainingRecords[courseId];
      if (!record) return NO_RECORD;
      const label = statusMeta('training', record.status).label;
      return record.expiry ? `${label} (${format(new Date(record.expiry), 'MMM yy')})` : label;
    };
    const exportColumns: ExportColumn<MatrixRow>[] = [
      { key: 'name', header: 'Name', value: member => `${member.first_name} ${member.last_name}` },
      { key: 'rank', header: 'Rank', value: member => member.rank || 'Crew' },
      ...coreCourses.map(course => ({ key: course.id, header: course.course_code, value: (member: MatrixRow) => cellOf(member, course.id) })),
    ];
    setExporting(true);
    try {
      const result = await runExport({
        format: 'csv',
        kind: 'Course records',
        sourceKey: 'training.training_matrix',
        legacyUnlogged: true,
        personalData: true,
        columns: exportColumns,
        rows: crewWithTraining,
        params: { courses: coreCourses.length, rows: crewWithTraining.length },
      });
      notifyExportResult(result);
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return <PageLoading variant="tiles" rows={4} label="Loading course records" />;
  }

  const summaryTiles: Array<{ label: string; value: React.ReactNode; className?: string }> = [
    { label: 'Valid', value: counts.valid, className: 'text-success' },
    { label: 'Expiring soon', value: counts.expiring, className: 'text-warning' },
    { label: 'Expired', value: counts.expired, className: 'text-critical' },
    { label: NO_RECORD, value: counts.none, className: 'text-muted-foreground' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold">Course records</h2>
          <p className="text-muted-foreground">
            The crew's training records for the catalogue's core courses. What each position must hold is set in{' '}
            <Link to={`${scopedPath('crew/compliance/status')}?view=stcw`} className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-ring">
              Crew Compliance
            </Link>
            .
          </p>
        </div>
        <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting || crewWithTraining.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Record counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryTiles.map(tile => (
          <Card key={tile.label}>
            <CardContent className="pt-4 text-center">
              <p className={cn('text-2xl font-bold tabular-nums', tile.className)}>{tile.value}</p>
              <p className="text-sm text-muted-foreground">{tile.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Matrix */}
      <MatrixGrid<MatrixRow, CellRecord | null>
        label="Course records"
        noun={{ one: 'crew member', other: 'crew members' }}
        rows={crewWithTraining}
        getRowId={member => member.id}
        rowLabel={member => `${member.first_name} ${member.last_name}`}
        rowHeader="Crew Member"
        rowColumns={[
          {
            id: 'rank',
            header: 'Rank',
            value: member => member.rank || 'Crew',
            cell: member => <Badge variant="outline">{member.rank || 'Crew'}</Badge>,
            minWidth: 100,
          },
        ]}
        columns={columns}
        groups={groups}
        getValue={(member, column) => member.trainingRecords[column.id] ?? null}
        renderCell={({ value, label }) => (
          <div className="flex flex-col items-center gap-1" title={`${label}: ${cellText(value)}`}>
            <StatusDot status={value?.status ?? null} />
            <span className="sr-only">{cellText(value)}</span>
            {value?.expiry ? (
              <span className="text-xs text-muted-foreground tabular-nums">{format(new Date(value.expiry), 'MMM yy')}</span>
            ) : null}
          </div>
        )}
        filters={filters}
        searchPlaceholder="Search crew or rank"
        empty={{ title: 'No crew members found', icon: Grid3X3 }}
        legend={LEGEND.map(item => (
          <span key={item.label} className="flex items-center gap-2">
            <StatusDot status={item.status} />
            <span className="text-sm text-foreground">{item.label}</span>
          </span>
        ))}
      />
    </div>
  );
};

export default TrainingMatrixTab;

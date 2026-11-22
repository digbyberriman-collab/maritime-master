import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TONE_SURFACE, type Tone } from '@/components/ui/tones';
import { cn } from '@/lib/utils';
import { useTraining } from '@/modules/training/hooks/useTraining';
import { useCrew } from '@/modules/crew/hooks/useCrew';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { MatrixGrid, type MatrixColumn, type ChipFilter } from '@/shared/components/data';
import { PageLoading } from '@/shared/components/states';
import { humanizeStatus, statusMeta } from '@/shared/components/status';
import { format } from 'date-fns';
import { Grid3X3, Check, X, AlertTriangle, Download, type LucideIcon } from 'lucide-react';

type CellRecord = { status: string; expiry: string | null };

/** How a matrix cell reads: tone from the training status registry, an icon so it never relies on colour. */
const CELL_LOOK: Record<string, { icon: LucideIcon; tone: Tone }> = {
  Valid: { icon: Check, tone: statusMeta('training', 'Valid').tone },
  Expiring_Soon: { icon: AlertTriangle, tone: statusMeta('training', 'Expiring_Soon').tone },
  Expired: { icon: X, tone: statusMeta('training', 'Expired').tone },
};
const MISSING_LOOK = { icon: X, tone: 'neutral' as Tone };

function StatusDot({ status }: { status: string | null }) {
  const look = (status && CELL_LOOK[status]) || MISSING_LOOK;
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

const cellText = (record: CellRecord | null) =>
  record ? statusMeta('training', record.status).label : 'Missing or not required';

const LEGEND: Array<{ status: string | null; label: string }> = [
  { status: 'Valid', label: 'Valid' },
  { status: 'Expiring_Soon', label: 'Expiring Soon (<90 days)' },
  { status: 'Expired', label: 'Expired' },
  { status: null, label: 'Missing/Not Required' },
];

const TrainingMatrixTab: React.FC = () => {
  const { trainingRecords, courses, isLoading } = useTraining();
  const { crew } = useCrew();
  const { vessels } = useVessels();
  const [selectedVessel, setSelectedVessel] = useState<string>('all');

  // Get unique crew with their training records
  const crewWithTraining = useMemo(() => {
    // Filter crew if vessel selected (would need crew assignment data)
    const filtered = crew;

    return filtered.map(member => {
      const memberRecords = trainingRecords.filter(r => r.user_id === member.user_id);
      const recordsByCourse: Record<string, CellRecord> = {};

      memberRecords.forEach(record => {
        if (record.course) {
          recordsByCourse[record.course.id] = {
            status: record.status,
            expiry: record.expiry_date,
          };
        }
      });

      return {
        ...member,
        trainingRecords: recordsByCourse,
      };
    });
  }, [crew, trainingRecords]);

  type MatrixRow = (typeof crewWithTraining)[number];

  // Mandatory courses, grouped by category so each group sits under one header.
  const mandatoryCourses = useMemo(() => {
    const mandatory = courses.filter(c => c.is_mandatory);
    const order = Array.from(new Set(mandatory.map(c => c.course_category)));
    return mandatory
      .map((course, index) => ({ course, index }))
      .sort((a, b) => order.indexOf(a.course.course_category) - order.indexOf(b.course.course_category) || a.index - b.index)
      .map(({ course }) => course);
  }, [courses]);

  const columns = useMemo<MatrixColumn[]>(
    () =>
      mandatoryCourses.map(course => ({
        id: course.id,
        label: course.course_code,
        sublabel: course.course_name,
        title: `${course.course_code} · ${course.course_name}`,
        group: course.course_category || undefined,
        width: 100,
      })),
    [mandatoryCourses],
  );

  const groups = useMemo(
    () =>
      Array.from(new Set(mandatoryCourses.map(c => c.course_category).filter(Boolean))).map(category => ({
        id: category,
        label: humanizeStatus(category),
      })),
    [mandatoryCourses],
  );

  const filters = useMemo<ChipFilter<MatrixRow>[]>(
    () => [
      {
        id: 'gaps',
        label: 'Missing or expired',
        predicate: member =>
          mandatoryCourses.some(course => {
            const record = member.trainingRecords[course.id];
            return !record || record.status === 'Expired';
          }),
      },
      {
        id: 'expiring',
        label: 'Expiring soon',
        predicate: member => mandatoryCourses.some(course => member.trainingRecords[course.id]?.status === 'Expiring_Soon'),
      },
    ],
    [mandatoryCourses],
  );

  // Calculate compliance summary
  const complianceSummary = useMemo(() => {
    const summary = {
      total: crewWithTraining.length * mandatoryCourses.length,
      valid: 0,
      expiring: 0,
      expired: 0,
      missing: 0,
    };

    crewWithTraining.forEach(member => {
      mandatoryCourses.forEach(course => {
        const record = member.trainingRecords[course.id];
        if (!record) {
          summary.missing++;
        } else if (record.status === 'Valid') {
          summary.valid++;
        } else if (record.status === 'Expiring_Soon') {
          summary.expiring++;
        } else if (record.status === 'Expired') {
          summary.expired++;
        }
      });
    });

    return summary;
  }, [crewWithTraining, mandatoryCourses]);

  const exportToExcel = () => {
    // Create CSV content
    const headers = ['Name', 'Rank', ...mandatoryCourses.map(c => c.course_code)];
    const rows = crewWithTraining.map(member => {
      const row = [
        `${member.first_name} ${member.last_name}`,
        member.rank || 'Crew',
      ];
      mandatoryCourses.forEach(course => {
        const record = member.trainingRecords[course.id];
        if (!record) {
          row.push('Missing');
        } else if (record.expiry) {
          row.push(`${record.status} (${format(new Date(record.expiry), 'MMM yy')})`);
        } else {
          row.push(record.status);
        }
      });
      return row;
    });

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-matrix-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <PageLoading variant="tiles" rows={5} label="Loading training matrix" />;
  }

  const summaryTiles: Array<{ label: string; value: React.ReactNode; className?: string }> = [
    {
      label: 'Overall Compliance',
      value: `${complianceSummary.total > 0 ? Math.round((complianceSummary.valid / complianceSummary.total) * 100) : 0}%`,
    },
    { label: 'Valid', value: complianceSummary.valid, className: 'text-success' },
    { label: 'Expiring Soon', value: complianceSummary.expiring, className: 'text-warning' },
    { label: 'Expired', value: complianceSummary.expired, className: 'text-critical' },
    { label: 'Missing', value: complianceSummary.missing, className: 'text-muted-foreground' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold">Training Matrix</h2>
          <p className="text-muted-foreground">Required vs actual training compliance grid</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedVessel} onValueChange={setSelectedVessel}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by vessel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vessels</SelectItem>
              {vessels.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Compliance Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
        label="Training matrix"
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

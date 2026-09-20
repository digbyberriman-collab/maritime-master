import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Pause, Play, Search, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import {
  AdherenceMeter,
  Fact,
  ProgramStatusBadge,
  StaffOnlyNotice,
} from '@/modules/health/components/pt/PtCommon';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import { useProgramTemplates } from '@/modules/health/hooks/usePtLibrary';
import { usePtPrograms } from '@/modules/health/hooks/usePtPrograms';
import { HEALTH_PATHS, healthLink } from '@/modules/health/paths';
import { formatDate } from '@/modules/health/lib/format';

/** Every programme currently running, and the controls to steer them. */
const ActiveProgramsPage: React.FC = () => {
  const access = useWellnessAccess();
  const canEdit = access.canEdit;
  const trainers = usePractitioners('pt');
  const templates = useProgramTemplates({ includeInactive: true });

  const [search, setSearch] = useState('');
  const [trainerId, setTrainerId] = useState('all');
  const [templateId, setTemplateId] = useState('all');

  const programs = usePtPrograms({
    statuses: ['active', 'paused'],
    trainerId: trainerId === 'all' ? null : trainerId,
    templateId: templateId === 'all' ? null : templateId,
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return programs.programs;
    return programs.programs.filter((p) =>
      `${p.person_name ?? ''} ${p.name} ${p.template_name ?? ''}`.toLowerCase().includes(term),
    );
  }, [programs.programs, search]);

  if (!access.loading && !access.canView) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={ClipboardList} title="Active programmes" description="Programmes running now." />
        <StaffOnlyNotice what="list" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={ClipboardList}
        title="Active programmes"
        description="Everything running or paused, with completion and adherence for each athlete."
        toolbar={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search athlete or programme"
                className="pl-9"
              />
            </div>
            <Select value={trainerId} onValueChange={setTrainerId}>
              <SelectTrigger className="sm:w-52">
                <SelectValue placeholder="All trainers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All trainers</SelectItem>
                {trainers.active.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="sm:w-56">
                <SelectValue placeholder="All templates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All templates</SelectItem>
                {templates.templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <StatGrid>
        <StatTile
          icon={ClipboardList}
          label="Active"
          value={programs.isLoading ? null : programs.summary.active}
          tone="good"
        />
        <StatTile
          icon={Pause}
          label="Paused"
          value={programs.isLoading ? null : programs.summary.paused}
          tone={programs.summary.paused > 0 ? 'warning' : 'default'}
        />
        <StatTile
          icon={CheckCircle2}
          label="Ending within 14 days"
          value={programs.isLoading ? null : programs.summary.endingSoon}
          tone={programs.summary.endingSoon > 0 ? 'warning' : 'default'}
        />
        <StatTile
          icon={ClipboardList}
          label="Average adherence"
          value={
            programs.isLoading
              ? null
              : programs.summary.averageAdherence === null
                ? 'No data'
                : `${programs.summary.averageAdherence}%`
          }
          hint="Last 4 weeks"
          tone={
            programs.summary.averageAdherence === null
              ? 'default'
              : programs.summary.averageAdherence >= 80
                ? 'good'
                : programs.summary.averageAdherence >= 50
                  ? 'warning'
                  : 'critical'
          }
        />
      </StatGrid>

      {programs.isLoading ? (
        <HealthLoading rows={4} />
      ) : programs.isError ? (
        <HealthError error={programs.error} title="Could not load the programmes" />
      ) : rows.length === 0 ? (
        <HealthEmpty
          icon={ClipboardList}
          title={programs.programs.length ? 'Nothing matches those filters' : 'No programmes running'}
          description={
            programs.programs.length
              ? 'Clear the search or widen the filters.'
              : 'Assign a published template to an athlete from their workspace or the template library.'
          }
          action={
            !programs.programs.length ? (
              <Button asChild size="sm">
                <Link to={HEALTH_PATHS.programmingTemplates}>Open the template library</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((program) => (
            <Card key={program.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={healthLink(HEALTH_PATHS.athleteWorkspace, program.person_id)}
                      className="truncate text-base font-semibold text-foreground hover:underline"
                    >
                      {program.person_name ?? 'Unnamed athlete'}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">
                      {program.name}
                      {program.template_name ? ` · from ${program.template_name}` : ''}
                    </p>
                  </div>
                  <ProgramStatusBadge status={program.status} />
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Fact label="Trainer" value={program.trainer_name ?? 'Unassigned'} />
                  <Fact
                    label="Runs"
                    value={`${formatDate(program.start_date)} to ${formatDate(program.end_date)}`}
                  />
                  <Fact
                    label="Next session"
                    value={
                      program.nextSession
                        ? `W${program.nextSession.week_number} D${program.nextSession.day_number}${
                            program.nextSession.scheduled_on
                              ? ` · ${formatDate(program.nextSession.scheduled_on)}`
                              : ''
                          }`
                        : 'None left'
                    }
                  />
                  <AdherenceMeter value={program.adherencePct} label="Last 4 weeks" />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Completion</span>
                    <span className="font-medium text-foreground">
                      {program.completedSessions} of {program.totalSessions} sessions ·{' '}
                      {program.completionPct}%
                    </span>
                  </div>
                  <Progress value={program.completionPct} className="h-1.5" />
                </div>

                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    {program.status === 'active' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={programs.isMutating}
                        onClick={() => programs.setStatus.mutate({ id: program.id, status: 'paused' })}
                      >
                        <Pause className="mr-1.5 h-4 w-4" />
                        Pause
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={programs.isMutating}
                        onClick={() => programs.setStatus.mutate({ id: program.id, status: 'active' })}
                      >
                        <Play className="mr-1.5 h-4 w-4" />
                        Resume
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={programs.isMutating}
                      onClick={() => programs.setStatus.mutate({ id: program.id, status: 'completed' })}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      Complete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={programs.isMutating}
                      onClick={() => programs.setStatus.mutate({ id: program.id, status: 'cancelled' })}
                    >
                      <XCircle className="mr-1.5 h-4 w-4" />
                      Cancel
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link to={healthLink(HEALTH_PATHS.athleteWorkspace, program.person_id)}>
                        Open workspace
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActiveProgramsPage;

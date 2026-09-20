import React, { useMemo, useState } from 'react';
import { Activity, Award, LineChart, Ruler, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  NoSubjectRecord,
} from '@/modules/health/components/HealthStates';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import { MeasurementDialog } from '@/modules/health/components/pt/MeasurementDialog';
import { PtBarChart, PtTrendChart } from '@/modules/health/components/pt/PtCharts';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import {
  useMeasurements,
  usePersonSetLogs,
  usePtPrograms,
  weekStartIso,
} from '@/modules/health/hooks/usePtPrograms';
import { formatDate, todayIso } from '@/modules/health/lib/format';

/** Charts and personal bests, so progress is visible rather than remembered. */
const MyProgressPage: React.FC = () => {
  const { personId, myPerson, selfOnly, directoryLoading } = useSelectedPerson('wellness');
  const athleteId = selfOnly ? personId : personId ?? myPerson?.id ?? null;

  const setLogs = usePersonSetLogs(athleteId);
  const measurements = useMeasurements(athleteId);
  const programs = usePtPrograms({ personId: athleteId });
  const [measurementOpen, setMeasurementOpen] = useState(false);

  const volumeChart = useMemo(
    () =>
      setLogs.volumeByWeek.slice(-16).map((row) => ({
        label: formatDate(row.week, 'd MMM'),
        volume: row.volume,
      })),
    [setLogs.volumeByWeek],
  );

  // Adherence is a record of what happened, so only sessions whose date has
  // passed can be counted as missed. Bucketing future weeks too filled the
  // chart with red bars for sessions nobody had had the chance to do yet, and
  // pushed the weeks that actually happened off the end of the 16-week window.
  const adherenceChart = useMemo(() => {
    const today = todayIso();
    const buckets = new Map<string, { due: number; done: number }>();
    for (const program of programs.programs) {
      for (const session of program.sessions) {
        if (!session.scheduled_on) continue;
        if (session.scheduled_on > today && session.status !== 'completed') continue;
        const week = weekStartIso(session.scheduled_on);
        const bucket = buckets.get(week) ?? { due: 0, done: 0 };
        bucket.due += 1;
        if (session.status === 'completed') bucket.done += 1;
        buckets.set(week, bucket);
      }
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-16)
      .map(([week, bucket]) => ({
        label: formatDate(week, 'd MMM'),
        done: bucket.done,
        missed: bucket.due - bucket.done,
      }));
  }, [programs.programs]);

  const measurementChart = useMemo(
    () =>
      measurements.chronological.map((m) => ({
        label: formatDate(m.measured_on, 'd MMM'),
        weight: m.weight_kg,
        bodyFat: m.body_fat_pct,
        waist: m.waist_cm,
        chest: m.chest_cm,
        arm: m.arm_cm,
      })),
    [measurements.chronological],
  );

  const totalVolume = useMemo(
    () => setLogs.logs.reduce((sum, log) => sum + log.volume, 0),
    [setLogs.logs],
  );

  const completedSessions = useMemo(
    () =>
      programs.programs.reduce(
        (sum, program) => sum + program.sessions.filter((s) => s.status === 'completed').length,
        0,
      ),
    [programs.programs],
  );

  if (!athleteId) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={TrendingUp} title="My progress" description="Volume, adherence and measurements." />
        {directoryLoading ? <HealthLoading rows={2} /> : <NoSubjectRecord />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={TrendingUp}
        title="My progress"
        description="Training load, how many sessions you have kept to, your measurements and your best lifts."
        actions={
          <Button size="sm" onClick={() => setMeasurementOpen(true)}>
            <Ruler className="mr-2 h-4 w-4" />
            Add a measurement
          </Button>
        }
      />

      <StatGrid>
        <StatTile
          icon={Activity}
          label="Sessions completed"
          value={programs.isLoading ? null : completedSessions}
        />
        <StatTile
          icon={TrendingUp}
          label="Total volume"
          value={setLogs.isLoading ? null : `${Math.round(totalVolume).toLocaleString('en-GB')} kg`}
          hint="Reps multiplied by load"
        />
        <StatTile icon={Award} label="Sets logged" value={setLogs.isLoading ? null : setLogs.logs.length} />
        <StatTile
          icon={Ruler}
          label="Last measured"
          value={
            measurements.isLoading
              ? null
              : measurements.latest
                ? formatDate(measurements.latest.measured_on)
                : 'Never'
          }
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Training load</CardTitle>
            <CardDescription>Volume lifted each week.</CardDescription>
          </CardHeader>
          <CardContent>
            {setLogs.isError ? (
              <HealthError error={setLogs.error} title="Could not load your training load" />
            ) : (
              <PtBarChart
                data={volumeChart}
                xKey="label"
                series={[{ key: 'volume', label: 'Volume (kg)' }]}
                emptyMessage="Log a few sets in My training and your load will build up here."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sessions each week</CardTitle>
            <CardDescription>Completed against everything that was due.</CardDescription>
          </CardHeader>
          <CardContent>
            <PtBarChart
              data={adherenceChart}
              xKey="label"
              stacked
              series={[
                { key: 'done', label: 'Completed' },
                { key: 'missed', label: 'Not done' },
              ]}
              emptyMessage="Nothing scheduled yet. Your programme fills this in."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Weight and body fat</CardTitle>
            <CardDescription>Every measurement you or your trainer has recorded.</CardDescription>
          </CardHeader>
          <CardContent>
            <PtTrendChart
              data={measurementChart}
              xKey="label"
              series={[
                { key: 'weight', label: 'Weight (kg)' },
                { key: 'bodyFat', label: 'Body fat (%)' },
              ]}
              emptyMessage="No measurements yet. Add one to start the trend."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Girths</CardTitle>
            <CardDescription>Waist, chest and arm in centimetres.</CardDescription>
          </CardHeader>
          <CardContent>
            <PtTrendChart
              data={measurementChart}
              xKey="label"
              series={[
                { key: 'waist', label: 'Waist' },
                { key: 'chest', label: 'Chest' },
                { key: 'arm', label: 'Arm' },
              ]}
              emptyMessage="No girths recorded yet."
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Personal bests</CardTitle>
          <CardDescription>
            Heaviest set, best estimated one rep maximum using Epley, and the most volume in a single
            session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {setLogs.isLoading ? (
            <HealthLoading rows={3} />
          ) : setLogs.bests.length === 0 ? (
            <HealthEmpty
              icon={Award}
              title="No bests yet"
              description="Log the weight on your sets and your bests will appear here to beat."
              className="border-0 p-6"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-2 text-left font-medium">Exercise</th>
                    <th className="p-2 text-right font-medium">Heaviest set</th>
                    <th className="p-2 text-right font-medium">Best 1RM</th>
                    <th className="p-2 text-right font-medium">Best session volume</th>
                    <th className="p-2 text-right font-medium">Last trained</th>
                  </tr>
                </thead>
                <tbody>
                  {setLogs.bests.slice(0, 25).map((best) => (
                    <tr key={best.exercise_name} className="border-b border-border last:border-0">
                      <td className="p-2 text-foreground">{best.exercise_name}</td>
                      <td className="p-2 text-right text-muted-foreground">
                        {best.heaviestKg !== null
                          ? `${best.heaviestKg} kg${best.heaviestReps ? ` x ${best.heaviestReps}` : ''}`
                          : '—'}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {best.best1RM !== null ? `${best.best1RM} kg` : '—'}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {best.bestSessionVolume ? `${best.bestSessionVolume.toLocaleString('en-GB')} kg` : '—'}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">
                        {best.lastLoggedAt ? formatDate(best.lastLoggedAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Measurement history</CardTitle>
          <CardDescription>Most recent first.</CardDescription>
        </CardHeader>
        <CardContent>
          {measurements.isLoading ? (
            <HealthLoading rows={2} />
          ) : measurements.isError ? (
            <HealthError error={measurements.error} title="Could not load your measurements" />
          ) : measurements.measurements.length === 0 ? (
            <HealthEmpty
              icon={LineChart}
              title="Nothing measured yet"
              description="Add your weight and a couple of girths to give the charts something to show."
              className="border-0 p-6"
              action={
                <Button size="sm" onClick={() => setMeasurementOpen(true)}>
                  Add a measurement
                </Button>
              }
            />
          ) : (
            <ul className="divide-y">
              {measurements.measurements.slice(0, 20).map((measurement) => (
                <li key={measurement.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {formatDate(measurement.measured_on)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        measurement.weight_kg !== null ? `${measurement.weight_kg} kg` : null,
                        measurement.body_fat_pct !== null ? `${measurement.body_fat_pct}% fat` : null,
                        measurement.waist_cm !== null ? `waist ${measurement.waist_cm} cm` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'No values recorded'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <MeasurementDialog
        open={measurementOpen}
        onOpenChange={setMeasurementOpen}
        measurement={null}
        saving={measurements.isMutating}
        defaultSource="self"
        onSave={(values) =>
          measurements.save.mutate(values, { onSuccess: () => setMeasurementOpen(false) })
        }
      />
    </div>
  );
};

export default MyProgressPage;

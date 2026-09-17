import React, { useMemo, useState } from 'react';
import { BarChart3, CalendarClock, ClipboardCheck, Download, FileSignature, FileWarning, Globe2, Layers, LifeBuoy, Palmtree, Printer, TrendingUp, UserPlus, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { ReportCard } from '@/modules/hris/components/reporting/ReportCard';
import { ReportFilters } from '@/modules/hris/components/reporting/ReportFilters';
import { SimpleBarChart, SimpleLineChart, seriesColor } from '@/modules/hris/components/reporting/charts';
import { defaultReportFilters, useHrReports, type ReportFilters as Filters } from '@/modules/hris/hooks/useHrReports';
import { humanise } from '@/modules/hris/lib/format';
import { downloadTextFile, forecastTypes, sectionsToCsv, type ForecastPoint } from '@/modules/hris/lib/reports';
import { buildHrSummaryPdf, buildReportSections } from '@/modules/hris/lib/reportExports';

const forecastRows = (points: ForecastPoint[]) => points.map((p) => ({ label: p.label, total: p.total, ...p.counts }));

const ReportingPage: React.FC = () => {
  const [filters, setFilters] = useState<Filters>(() => defaultReportFilters());
  const { clientDisplayName, clientLogoUrl } = useBrandingContext();
  const reports = useHrReports(filters);
  const { data, isLoading, error, vessels, vesselName, departments } = reports;

  const scopeLabel = useMemo(() => {
    const vessel = filters.vesselId ? vesselName(filters.vesselId) ?? 'Vessel' : 'All vessels';
    const dept = filters.department ?? 'All departments';
    return `${vessel} · ${dept} · ${format(parseISO(filters.from), 'MMM yy')} – ${format(parseISO(filters.to), 'MMM yy')}`;
  }, [filters, vesselName]);

  const sections = useMemo(() => (data ? buildReportSections(data) : []), [data]);
  const stamp = format(new Date(), 'yyyyMMdd');

  const downloadAll = () => {
    if (!data) return;
    const csv = sectionsToCsv([
      { title: `HR reports — ${scopeLabel}`, headers: ['Key figure', 'Value'], rows: data.kpis.map((k) => [k.label, k.value]) },
      ...sections,
    ]);
    downloadTextFile(`﻿${csv}`, `hr-reports-${stamp}.csv`);
  };

  const printSummary = () => {
    if (!data) return;
    const doc = buildHrSummaryPdf({ branding: { clientDisplayName, clientLogoUrl }, scopeLabel, kpis: data.kpis, sections });
    doc.save(`hr-summary-${stamp}.pdf`);
  };

  const contractTypes = data ? forecastTypes(data.contractForecast) : [];
  const documentTypes = data ? forecastTypes(data.documentForecast) : [];

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={BarChart3}
        title="Reporting & Analytics"
        description="Headcount, movement, expiry forecasts, reviews, leave and onboarding across the fleet. Every report exports the rows behind its chart."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={downloadAll} disabled={!data}>
              <Download className="mr-2 h-4 w-4" /> Download all (CSV)
            </Button>
            <Button size="sm" onClick={printSummary} disabled={!data}>
              <Printer className="mr-2 h-4 w-4" /> Printable summary (PDF)
            </Button>
          </>
        }
        toolbar={<ReportFilters value={filters} onChange={setFilters} vessels={vessels} departments={departments} />}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error instanceof Error ? error.message : 'Could not load report data.'}</AlertDescription>
        </Alert>
      )}

      {data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {data.kpis.slice(0, 5).map((k) => (
            <div key={k.label} className="rounded-lg border bg-card p-3">
              <p className="text-xl font-semibold leading-none text-foreground">{k.value}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground" title={k.label}>
                {k.label}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportCard icon={Users} title="Headcount trend" description="Crew onboard on the 1st of each month, from assignment join and leave dates." csv={sections[0] ?? { title: '', headers: [], rows: [] }} isLoading={isLoading}>
          <SimpleLineChart data={data?.headcount.map((p) => ({ label: p.label, headcount: p.headcount })) ?? []} xKey="label" series={[{ key: 'headcount', label: 'Onboard' }]} />
        </ReportCard>

        <ReportCard icon={UserPlus} title="Joiners vs leavers" description="Assignments starting and ending per month." csv={sections[1] ?? { title: '', headers: [], rows: [] }} isLoading={isLoading}>
          <SimpleBarChart
            data={data?.movement.map((p) => ({ label: p.label, joiners: p.joiners, leavers: p.leavers })) ?? []}
            xKey="label"
            series={[
              { key: 'joiners', label: 'Joiners', color: seriesColor(1) },
              { key: 'leavers', label: 'Leavers', color: seriesColor(5) },
            ]}
          />
        </ReportCard>

        <ReportCard icon={TrendingUp} title="Turnover rate" description="Leavers in the trailing 12 months as a percentage of average monthly headcount." csv={sections[2] ?? { title: '', headers: [], rows: [] }} isLoading={isLoading}>
          <SimpleLineChart data={data?.turnover.map((p) => ({ label: p.label, ratePct: p.ratePct })) ?? []} xKey="label" series={[{ key: 'ratePct', label: 'Turnover', color: seriesColor(2) }]} unit="%" />
        </ReportCard>

        <ReportCard icon={Layers} title="Tenure distribution" description="Crew currently onboard, by time since their earliest join date." csv={sections[3] ?? { title: '', headers: [], rows: [] }} isLoading={isLoading}>
          <SimpleBarChart data={data?.tenure.map((p) => ({ label: p.bucket, count: p.count })) ?? []} xKey="label" series={[{ key: 'count', label: 'Crew' }]} />
        </ReportCard>

        <ReportCard icon={FileSignature} title="Contract expiry forecast" description="Active contracts and probation periods ending in the next 6 months." csv={sections[4] ?? { title: '', headers: [], rows: [] }} isLoading={isLoading}>
          <SimpleBarChart
            data={data ? forecastRows(data.contractForecast) : []}
            xKey="label"
            stacked
            series={contractTypes.length ? contractTypes.map((t, i) => ({ key: t, label: humanise(t), color: seriesColor(i) })) : [{ key: 'total', label: 'Total' }]}
            emptyMessage="No contracts or probations end in the next 6 months"
          />
        </ReportCard>

        <ReportCard icon={FileWarning} title="Document & certificate expiry forecast" description="Passports, visas, medicals and certificates expiring in the next 6 months, by type." csv={sections[5] ?? { title: '', headers: [], rows: [] }} isLoading={isLoading}>
          <SimpleBarChart
            data={data ? forecastRows(data.documentForecast) : []}
            xKey="label"
            stacked
            series={documentTypes.length ? documentTypes.map((t, i) => ({ key: t, label: humanise(t), color: seriesColor(i) })) : [{ key: 'total', label: 'Total' }]}
            emptyMessage="No documents expire in the next 6 months"
          />
        </ReportCard>

        <ReportCard icon={Globe2} title="Nationality mix" description="Active crew profiles by nationality (top 10)." csv={sections[6] ?? { title: '', headers: [], rows: [] }} isLoading={isLoading}>
          <SimpleBarChart data={data?.nationality.map((p) => ({ label: p.name, count: p.count })) ?? []} xKey="label" layout="vertical" series={[{ key: 'count', label: 'Crew' }]} height={Math.max(200, 26 * (data?.nationality.length ?? 0) + 40)} />
        </ReportCard>

        <ReportCard icon={Users} title="Department mix" description="Active crew profiles by department." csv={sections[7] ?? { title: '', headers: [], rows: [] }} isLoading={isLoading}>
          <SimpleBarChart data={data?.departments.map((p) => ({ label: p.name, count: p.count })) ?? []} xKey="label" layout="vertical" series={[{ key: 'count', label: 'Crew', color: seriesColor(3) }]} height={Math.max(200, 26 * (data?.departments.length ?? 0) + 40)} />
        </ReportCard>

        <ReportCard icon={ClipboardCheck} title="Review completion" description={`Reviews completed versus still due in ${new Date().getFullYear()}, by type.`} csv={sections[8] ?? { title: '', headers: [], rows: [] }} isLoading={isLoading}>
          <SimpleBarChart
            data={data?.reviews.map((p) => ({ label: humanise(p.type), completed: p.completed, outstanding: p.outstanding - p.overdue, overdue: p.overdue })) ?? []}
            xKey="label"
            stacked
            series={[
              { key: 'completed', label: 'Completed', color: seriesColor(1) },
              { key: 'outstanding', label: 'Due', color: seriesColor(2) },
              { key: 'overdue', label: 'Overdue', color: seriesColor(5) },
            ]}
            emptyMessage="No reviews scheduled this year"
          />
        </ReportCard>

        <ReportCard icon={Palmtree} title="Leave requests" description="Requests by start month and status." csv={sections[9] ?? { title: '', headers: [], rows: [] }} isLoading={isLoading}>
          <SimpleBarChart
            data={data?.leave.map((p) => ({ label: p.label, approved: p.approved, pending: p.pending, declined: p.declined })) ?? []}
            xKey="label"
            stacked
            series={[
              { key: 'approved', label: 'Approved', color: seriesColor(1) },
              { key: 'pending', label: 'Pending', color: seriesColor(2) },
              { key: 'declined', label: 'Declined', color: seriesColor(5) },
            ]}
            emptyMessage="No leave requests in this range"
          />
        </ReportCard>

        <ReportCard icon={LifeBuoy} title="Onboarding" description="Familiarisation records by status." csv={sections[10] ?? { title: '', headers: [], rows: [] }} isLoading={isLoading}>
          <SimpleBarChart data={data?.onboarding.map((p) => ({ label: humanise(p.name), count: p.count })) ?? []} xKey="label" series={[{ key: 'count', label: 'Records', color: seriesColor(4) }]} emptyMessage="No familiarisation records" />
        </ReportCard>

        <div className="hidden xl:block">
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            <div>
              <CalendarClock className="mx-auto mb-2 h-5 w-5" />
              Scope: {scopeLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportingPage;

/**
 * Fleet › Reports (`/fleet/reports`): the reports overview (gap/02 target
 * IA, "Fleet Reports … (overview)"). Until the report hub with its period
 * tiles and catalogue registry lands (gap/02 R1), this is the grouped list
 * of the fleet reports that exist, so each one, the risk overview included,
 * is reachable from the Fleet tree.
 *
 * Static content: nothing loads, so there is no loading, error or empty
 * state. Links are relative to this route, so they stay in the Fleet scope.
 * Tokens only (gap/10 §A).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ClipboardCheck, ShieldAlert, Siren, type LucideIcon } from 'lucide-react';

interface ReportLink {
  /** Relative to /fleet/reports. */
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

interface ReportGroup {
  title: string;
  reports: ReportLink[];
}

const REPORT_GROUPS: readonly ReportGroup[] = [
  {
    title: 'Safety',
    reports: [
      {
        to: 'incident-analytics',
        title: 'Incident analytics',
        description: 'Incident trends, insights and performance across the fleet.',
        icon: AlertTriangle,
      },
      {
        to: 'capa-tracker',
        title: 'CAPA tracker',
        description: 'Corrective and preventive actions and their progress.',
        icon: ClipboardCheck,
      },
      {
        to: 'drill-analytics',
        title: 'Drill analytics',
        description: 'Drill performance and compliance across the fleet.',
        icon: Siren,
      },
    ],
  },
  {
    title: 'Risk',
    reports: [
      {
        to: 'risk-overview',
        title: 'Risk overview',
        description: 'The fleet risk posture and safety performance.',
        icon: ShieldAlert,
      },
    ],
  },
];

/** Every report the index links to, relative to /fleet/reports (for the reachability test). */
export const FLEET_REPORT_PATHS: readonly string[] = REPORT_GROUPS.flatMap((g) => g.reports.map((r) => r.to));

const FleetReportsIndex: React.FC = () => (
  <div className="space-y-6">
    <header>
      <h1 className="text-2xl font-bold text-foreground">Fleet Reports</h1>
      <p className="text-sm text-muted-foreground">Reports across every vessel you can reach.</p>
    </header>
    {REPORT_GROUPS.map((group) => (
      <section key={group.title} aria-labelledby={`reports-${group.title}`} className="space-y-3">
        <h2 id={`reports-${group.title}`} className="type-eyebrow text-muted-foreground">
          {group.title}
        </h2>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {group.reports.map((report) => {
            const Icon = report.icon;
            return (
              <li key={report.to}>
                <Link
                  to={report.to}
                  className="group flex h-full items-start gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="type-subtitle block text-foreground">{report.title}</span>
                    <span className="type-body-sm block text-muted-foreground">{report.description}</span>
                  </span>
                  <ArrowRight
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    ))}
  </div>
);

export default FleetReportsIndex;

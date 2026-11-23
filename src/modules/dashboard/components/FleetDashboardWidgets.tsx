import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  FileCheck,
  Shield,
  Ship,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/shared/components/status';
import { EmptyState } from '@/shared/components/states';
import { cn } from '@/lib/utils';

/*
 * Widgets shared by the two fleet dashboards (Dashboard, DPADashboard).
 * Tokens only: alert banners sit on the `{tone}-muted` surfaces with `{tone}`
 * text (D-52), cards stay opaque `bg-card`.
 */

const headingIcon = 'h-4 w-4 text-muted-foreground';

/** A banner card for something the user must act on (overdue CAPAs, unread mandatory documents). */
function AttentionBanner({
  tone,
  icon: Icon,
  title,
  body,
  children,
  action,
}: {
  tone: 'danger' | 'warn';
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
  children?: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      data-tone={tone}
      className={cn(
        'flex items-start gap-4 rounded-lg border border-l-[3px] p-4 shadow-sm',
        tone === 'danger' ? 'border-critical/25 border-l-critical bg-critical-muted' : 'border-warning/25 border-l-warning bg-warning-muted',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border',
          tone === 'danger' ? 'border-critical/25 text-critical' : 'border-warning/25 text-warning',
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className={cn('type-subtitle', tone === 'danger' ? 'text-critical' : 'text-warning')}>{title}</h3>
        <p className="mt-1 text-sm text-foreground">{body}</p>
        {children}
        <div className="mt-3">{action}</div>
      </div>
    </section>
  );
}

export function OverdueCapasBanner({ count }: { count: number }) {
  return (
    <AttentionBanner
      tone="danger"
      icon={AlertTriangle}
      title="Overdue corrective actions"
      body={`${count} CAPA${count === 1 ? '' : 's'} past the due date.`}
      action={
        <Button variant="outline" size="sm" className="[@media(pointer:coarse)]:min-h-11" asChild>
          <Link to="/fleet/reports/capa-tracker">
            View CAPAs <ChevronRight aria-hidden="true" className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      }
    />
  );
}

export function PendingAcknowledgementsBanner({ documents }: { documents: ReadonlyArray<{ id: string; title: string }> }) {
  const count = documents.length;
  return (
    <AttentionBanner
      tone="warn"
      icon={AlertCircle}
      title="Documents to acknowledge"
      body={`You have ${count} mandatory document${count === 1 ? '' : 's'} waiting for your acknowledgement.`}
      action={
        <Button variant="outline" size="sm" className="[@media(pointer:coarse)]:min-h-11" asChild>
          <Link to="/fleet/documents">
            Open documents <ChevronRight aria-hidden="true" className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      }
    >
      <ul className="mt-3 flex flex-wrap gap-2">
        {documents.slice(0, 3).map((doc) => (
          <li key={doc.id} className="min-w-0 max-w-full">
            <Badge variant="outline" className="max-w-full truncate border-warning/25 bg-card font-normal text-foreground">
              {doc.title}
            </Badge>
          </li>
        ))}
        {count > 3 ? (
          <li>
            <Badge variant="outline" className="border-warning/25 bg-card font-normal text-muted-foreground">
              +{count - 3} more
            </Badge>
          </li>
        ) : null}
      </ul>
    </AttentionBanner>
  );
}

export interface CrewChangeRow {
  id: string;
  type: string;
  crewName: string;
  position?: string | null;
  vesselName?: string | null;
  createdAt: string;
}

/**
 * The latest joins and sign-offs. A failed read shows an error with Retry,
 * never the first-use empty state (D-04: no fake success).
 */
export function RecentCrewChangesCard({
  changes,
  isLoading,
  isError,
  onRetry,
}: {
  changes: readonly CrewChangeRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 type-subtitle">
          <ArrowRightLeft aria-hidden="true" className={headingIcon} />
          Recent crew changes
        </CardTitle>
        <CardDescription>Latest joins and sign-offs across the fleet</CardDescription>
      </CardHeader>
      <CardContent>
        {isError ? (
          <EmptyState
            kind="error"
            compact
            icon={ArrowRightLeft}
            headingLevel={3}
            title="Crew changes could not load"
            body="Check your connection and try again."
            action={
              <Button variant="outline" size="sm" className="[@media(pointer:coarse)]:min-h-11" onClick={onRetry}>
                Retry
              </Button>
            }
          />
        ) : isLoading ? (
          <div role="status" aria-busy="true" className="space-y-3">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-10 w-full" />
            ))}
            <span className="sr-only">Loading crew changes</span>
          </div>
        ) : changes && changes.length > 0 ? (
          <ul className="divide-y divide-border">
            {changes.map((change) => (
              <li key={change.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <StatusPill tone={change.type === 'join' ? 'ok' : 'neutral'} label={change.type === 'join' ? 'Joined' : 'Signed off'} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{change.crewName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[change.position, change.vesselName].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {format(new Date(change.createdAt), 'dd MMM yyyy')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState kind="first-use" compact icon={ArrowRightLeft} title="No recent crew changes" body="Joins and sign-offs will show here." />
        )}
      </CardContent>
    </Card>
  );
}

export interface IncidentRow {
  id: string;
  incident_type: string;
  incident_number: string;
  incident_date: string;
  vessel?: unknown;
}

const vesselNameOf = (vessel: unknown): string | null =>
  vessel && typeof vessel === 'object' && 'name' in vessel && typeof (vessel as { name: unknown }).name === 'string'
    ? (vessel as { name: string }).name
    : null;

export function RecentIncidentsCard({ incidents }: { incidents: readonly IncidentRow[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 type-subtitle">
          <AlertCircle aria-hidden="true" className={headingIcon} />
          Recent incidents
        </CardTitle>
        <CardDescription>Latest reported incidents</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {incidents.map((incident) => (
            <li key={incident.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <Badge variant="outline" className="shrink-0 font-normal">
                  {incident.incident_type}
                </Badge>
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{incident.incident_number}</p>
                  <p className="truncate text-xs text-muted-foreground">{vesselNameOf(incident.vessel) ?? 'Unknown vessel'}</p>
                </div>
              </div>
              <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {format(new Date(incident.incident_date), 'dd MMM yyyy')}
              </span>
            </li>
          ))}
        </ul>
        <Button variant="link" className="mt-2 h-auto p-0" asChild>
          <Link to="/incidents">View all incidents →</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export interface AckStatRow {
  documentId: string;
  documentTitle: string;
  documentNumber?: string | null;
  acknowledged: number;
  totalCrew: number;
  percentComplete: number;
}

export function AcknowledgementProgressCard({ stats }: { stats: readonly AckStatRow[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 type-subtitle">
          <FileCheck aria-hidden="true" className={headingIcon} />
          Document acknowledgement
        </CardTitle>
        <CardDescription>Mandatory documents read and acknowledged by crew</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {stats.slice(0, 4).map((stat) => (
            <li key={stat.documentId} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{stat.documentTitle}</p>
                  {stat.documentNumber ? <p className="font-mono text-xs text-muted-foreground">{stat.documentNumber}</p> : null}
                </div>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {stat.acknowledged}/{stat.totalCrew}
                </span>
              </div>
              <Progress value={stat.percentComplete} className="h-2" aria-label={`${stat.documentTitle}: ${Math.round(stat.percentComplete)}% acknowledged`} />
            </li>
          ))}
        </ul>
        {stats.length > 4 ? (
          <Button variant="link" className="mt-3 h-auto p-0" asChild>
            <Link to="/acknowledgments">View all {stats.length} documents →</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

const QUICK_LINKS: ReadonlyArray<{ label: string; icon: LucideIcon; path: string }> = [
  { label: 'Vessels', icon: Ship, path: '/vessels' },
  { label: 'Crew', icon: Users, path: '/crew' },
  { label: 'Certificates', icon: Shield, path: '/certificates' },
  { label: 'Incidents', icon: AlertCircle, path: '/incidents' },
  { label: 'Drills', icon: ClipboardCheck, path: '/drills' },
  { label: 'Documents', icon: BookOpen, path: '/fleet/documents' },
];

export function QuickLinks() {
  return (
    <nav aria-label="Quick links">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {QUICK_LINKS.map((link) => (
          <li key={link.label}>
            <Link
              to={link.path}
              className="flex min-h-11 flex-col items-center gap-2 rounded-lg border bg-card px-3 py-4 text-center shadow-sm transition-colors duration-quick hover:border-primary/40 hover:bg-accent focus-ring motion-reduce:transition-none"
            >
              <link.icon aria-hidden="true" className="h-5 w-5 text-primary" strokeWidth={1.75} />
              <span className="text-xs font-medium text-foreground">{link.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

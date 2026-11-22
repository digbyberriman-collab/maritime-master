import React from 'react';
import {
  AlertTriangle, Users, Anchor, Award,
  GraduationCap, Wrench, ClipboardCheck,
  FileSignature, Target, type LucideIcon,
} from 'lucide-react';
import { KpiTile } from '@/shared/components/data';
import type { Tone } from '@/components/ui/tones';
import type { DashboardSummary, WidgetKey } from '@/modules/dashboard/types';

interface KPITilesProps {
  summary: DashboardSummary | null;
  visibleWidgets: WidgetKey[];
}

interface TileConfig {
  key: WidgetKey;
  label: string;
  icon: LucideIcon;
  href: string;
  value: (s: DashboardSummary) => number | string;
  /** Alert tone when the number needs attention; `undefined` = no alert bar. */
  tone: (s: DashboardSummary) => Tone | undefined;
  sub?: (s: DashboardSummary) => string | undefined;
  /** Counts where 0 is not good news (crew on board) show a plain 0, not "All clear". */
  plainZero?: boolean;
  textValue?: boolean;
}

const certsExpiring = (s: DashboardSummary) => s.certs_expiring_90d + s.crew_certs_expiring_90d;
const openNcCapa = (s: DashboardSummary) => s.open_ncs_count + s.open_capas_count;

const TILES: TileConfig[] = [
  {
    key: 'kpi_alerts',
    label: 'Open alerts',
    icon: AlertTriangle,
    href: '/notifications/center',
    value: (s) => s.open_alerts_count,
    tone: (s) => (s.red_alerts_count > 0 ? 'danger' : s.open_alerts_count > 0 ? 'warn' : undefined),
    sub: (s) => (s.red_alerts_count > 0 ? `${s.red_alerts_count} red` : undefined),
  },
  {
    key: 'kpi_crew',
    label: 'Crew on board',
    icon: Users,
    href: '/crew',
    value: (s) => s.crew_onboard_count,
    tone: () => undefined,
    plainZero: true,
  },
  {
    key: 'kpi_captain',
    label: 'Master',
    icon: Anchor,
    href: '/crew',
    value: (s) => s.current_captain || '—',
    tone: (s) => (s.current_captain ? undefined : 'warn'),
    sub: (s) => (s.current_captain ? 'In command' : 'Not assigned'),
    textValue: true,
  },
  {
    key: 'kpi_certs',
    label: 'Certificates expiring',
    icon: Award,
    href: '/certificates/alerts',
    value: certsExpiring,
    tone: (s) => (certsExpiring(s) > 5 ? 'danger' : certsExpiring(s) > 0 ? 'warn' : undefined),
    sub: () => 'Within 90 days',
  },
  {
    key: 'kpi_drills',
    label: 'Overdue drills',
    icon: Target,
    href: '/ism/drills',
    value: (s) => s.overdue_drills_count,
    tone: (s) => (s.overdue_drills_count > 0 ? 'danger' : undefined),
  },
  {
    key: 'kpi_training',
    label: 'Training gaps',
    icon: GraduationCap,
    href: '/training',
    value: (s) => s.training_gaps_count,
    tone: (s) => (s.training_gaps_count > 0 ? 'warn' : undefined),
  },
  {
    key: 'kpi_maintenance',
    label: 'Overdue maintenance',
    icon: Wrench,
    href: '/maintenance',
    value: (s) => s.overdue_maintenance_count,
    tone: (s) => (s.critical_defects_count > 0 ? 'danger' : s.overdue_maintenance_count > 0 ? 'warn' : undefined),
    sub: (s) =>
      s.critical_defects_count > 0
        ? `${s.critical_defects_count} critical defect${s.critical_defects_count === 1 ? '' : 's'}`
        : undefined,
  },
  {
    key: 'kpi_compliance',
    label: 'Open NCs / CAPAs',
    icon: ClipboardCheck,
    href: '/ism/audits',
    value: openNcCapa,
    tone: (s) => (openNcCapa(s) > 0 ? 'warn' : undefined),
    sub: (s) => `${s.open_ncs_count} NCs · ${s.open_capas_count} CAPAs`,
  },
  {
    key: 'kpi_signatures',
    label: 'Pending signatures',
    icon: FileSignature,
    href: '/ism/forms/pending',
    value: (s) => s.pending_signatures_count,
    tone: (s) => (s.pending_signatures_count > 0 ? 'signal' : undefined),
  },
];

/**
 * Vessel dashboard KPI row (gap/10 DS13, §A.9) on the shared `KpiTile`: each
 * tile links to its filtered list, carries an alert bar in its tone when
 * there is something to do, and shows "0 · All clear" only for a real zero.
 * The caller renders it once the summary has loaded.
 */
export const KPITiles: React.FC<KPITilesProps> = ({ summary, visibleWidgets }) => {
  if (!summary) return null;

  const visibleTiles = TILES.filter((t) => visibleWidgets.includes(t.key));

  return (
    <section aria-label="Vessel indicators" className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {visibleTiles.map((tile) => (
        <KpiTile
          key={tile.key}
          label={tile.label}
          icon={tile.icon}
          href={tile.href}
          value={tile.value(summary)}
          tone={tile.tone(summary)}
          sub={tile.sub?.(summary)}
          state={tile.plainZero || tile.textValue ? 'ready' : undefined}
          textValue={tile.textValue}
        />
      ))}
    </section>
  );
};

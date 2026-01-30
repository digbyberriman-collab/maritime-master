import React from 'react';
import { Link } from 'react-router-dom';
import { 
  AlertTriangle, Users, Anchor, Award, 
  GraduationCap, Wrench, ClipboardCheck,
  FileSignature, Target
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DashboardSummary } from '@/types/dashboard';
import type { WidgetKey } from '@/types/dashboard';

interface KPITilesProps {
  summary: DashboardSummary | null;
  visibleWidgets: WidgetKey[];
}

interface TileConfig {
  key: WidgetKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  getValue: (s: DashboardSummary) => number | string;
  href: string;
  colorClass: string;
  statusClass: (s: DashboardSummary) => string;
}

const tiles: TileConfig[] = [
  {
    key: 'kpi_alerts',
    label: 'Open Alerts',
    icon: AlertTriangle,
    getValue: (s) => s.open_alerts_count,
    href: '/alerts',
    colorClass: 'text-destructive bg-destructive/10',
    statusClass: (s) => s.red_alerts_count > 0 ? 'border-l-destructive' : s.open_alerts_count > 0 ? 'border-l-warning' : 'border-l-green-500',
  },
  {
    key: 'kpi_crew',
    label: 'Crew Onboard',
    icon: Users,
    getValue: (s) => s.crew_onboard_count,
    href: '/operations/crew',
    colorClass: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50',
    statusClass: () => 'border-l-blue-500',
  },
  {
    key: 'kpi_captain',
    label: 'Captain',
    icon: Anchor,
    getValue: (s) => s.current_captain || 'Not assigned',
    href: '/operations/crew',
    colorClass: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50',
    statusClass: (s) => s.current_captain ? 'border-l-green-500' : 'border-l-warning',
  },
  {
    key: 'kpi_certs',
    label: 'Certs Expiring (90d)',
    icon: Award,
    getValue: (s) => s.certs_expiring_90d + s.crew_certs_expiring_90d,
    href: '/certificates/alerts',
    colorClass: 'text-orange-600 bg-orange-50 dark:bg-orange-950/50',
    statusClass: (s) => (s.certs_expiring_90d + s.crew_certs_expiring_90d) > 5 ? 'border-l-destructive' : (s.certs_expiring_90d + s.crew_certs_expiring_90d) > 0 ? 'border-l-warning' : 'border-l-green-500',
  },
  {
    key: 'kpi_drills',
    label: 'Overdue Drills',
    icon: Target,
    getValue: (s) => s.overdue_drills_count,
    href: '/ism/drills',
    colorClass: 'text-purple-600 bg-purple-50 dark:bg-purple-950/50',
    statusClass: (s) => s.overdue_drills_count > 0 ? 'border-l-destructive' : 'border-l-green-500',
  },
  {
    key: 'kpi_training',
    label: 'Training Gaps',
    icon: GraduationCap,
    getValue: (s) => s.training_gaps_count,
    href: '/training',
    colorClass: 'text-violet-600 bg-violet-50 dark:bg-violet-950/50',
    statusClass: (s) => s.training_gaps_count > 0 ? 'border-l-warning' : 'border-l-green-500',
  },
  {
    key: 'kpi_maintenance',
    label: 'Overdue Maintenance',
    icon: Wrench,
    getValue: (s) => s.overdue_maintenance_count,
    href: '/maintenance',
    colorClass: 'text-gray-600 bg-gray-50 dark:bg-gray-800/50',
    statusClass: (s) => s.critical_defects_count > 0 ? 'border-l-destructive' : s.overdue_maintenance_count > 0 ? 'border-l-warning' : 'border-l-green-500',
  },
  {
    key: 'kpi_compliance',
    label: 'Open NCs/CAPAs',
    icon: ClipboardCheck,
    getValue: (s) => s.open_ncs_count + s.open_capas_count,
    href: '/ism/audits',
    colorClass: 'text-amber-600 bg-amber-50 dark:bg-amber-950/50',
    statusClass: (s) => (s.open_ncs_count + s.open_capas_count) > 0 ? 'border-l-warning' : 'border-l-green-500',
  },
  {
    key: 'kpi_signatures',
    label: 'Pending Signatures',
    icon: FileSignature,
    getValue: (s) => s.pending_signatures_count,
    href: '/ism/forms/pending-signatures',
    colorClass: 'text-primary bg-primary/10',
    statusClass: (s) => s.pending_signatures_count > 0 ? 'border-l-primary' : 'border-l-green-500',
  },
];

export const KPITiles: React.FC<KPITilesProps> = ({ summary, visibleWidgets }) => {
  if (!summary) return null;

  const visibleTiles = tiles.filter(t => visibleWidgets.includes(t.key));

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {visibleTiles.map(tile => (
        <KPITile key={tile.key} tile={tile} summary={summary} />
      ))}
    </div>
  );
};

interface KPITileProps {
  tile: TileConfig;
  summary: DashboardSummary;
}

const KPITile: React.FC<KPITileProps> = ({ tile, summary }) => {
  const Icon = tile.icon;
  const value = tile.getValue(summary);
  const statusClass = tile.statusClass(summary);

  return (
    <Link to={tile.href}>
      <Card className={cn(
        'transition-all hover:shadow-md cursor-pointer border-l-4',
        statusClass
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className={cn('p-2 rounded-lg', tile.colorClass)}>
              <Icon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className={cn(
              'text-2xl font-bold',
              typeof value === 'string' && 'text-base'
            )}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{tile.label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

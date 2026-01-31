import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  Users,
  Award,
  Wrench,
  FileWarning,
  ClipboardList,
  FileSignature,
  Target,
  CalendarClock,
  GraduationCap,
} from 'lucide-react';
import { VesselDashboardData } from '@/hooks/useVesselDashboard';
import { cn } from '@/lib/utils';

interface WidgetProps {
  data: VesselDashboardData | null;
  isLoading: boolean;
  canView?: boolean;
}

// Alert severity widget
export const AlertsWidget: React.FC<WidgetProps> = ({ data, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading) return <WidgetSkeleton />;

  const hasRedAlerts = (data?.red_alerts_count || 0) > 0;
  const totalAlerts = data?.open_alerts_count || 0;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        hasRedAlerts && 'border-destructive/50 bg-destructive/5'
      )}
      onClick={() => navigate('/alerts')}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Open Alerts</CardTitle>
        <AlertTriangle className={cn('w-5 h-5', hasRedAlerts ? 'text-destructive' : 'text-muted-foreground')} />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">{totalAlerts}</span>
          {hasRedAlerts && (
            <Badge variant="destructive" className="text-xs">
              {data?.red_alerts_count} Critical
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {hasRedAlerts ? 'Immediate action required' : 'All systems normal'}
        </p>
      </CardContent>
    </Card>
  );
};

// Crew onboard widget
export const CrewWidget: React.FC<WidgetProps> = ({ data, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading) return <WidgetSkeleton />;

  return (
    <Card className="cursor-pointer transition-all hover:shadow-md" onClick={() => navigate('/crew')}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Crew Onboard</CardTitle>
        <Users className="w-5 h-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{data?.crew_onboard_count || 0}</div>
        {data?.current_captain && (
          <p className="text-xs text-muted-foreground mt-1">Captain: {data.current_captain}</p>
        )}
      </CardContent>
    </Card>
  );
};

// Certificates expiring widget
export const CertificatesWidget: React.FC<WidgetProps> = ({ data, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading) return <WidgetSkeleton />;

  const vesselCerts = data?.certs_expiring_90d || 0;
  const crewCerts = data?.crew_certs_expiring_90d || 0;
  const totalExpiring = vesselCerts + crewCerts;
  const hasExpiring = totalExpiring > 0;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        hasExpiring && 'border-warning/50 bg-warning/5'
      )}
      onClick={() => navigate('/certificates/alerts')}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Certificates (90d)</CardTitle>
        <Award className={cn('w-5 h-5', hasExpiring ? 'text-warning' : 'text-muted-foreground')} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{totalExpiring}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {vesselCerts} vessel, {crewCerts} crew expiring
        </p>
      </CardContent>
    </Card>
  );
};

// Maintenance widget
export const MaintenanceWidget: React.FC<WidgetProps> = ({ data, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading) return <WidgetSkeleton />;

  const overdue = data?.overdue_maintenance_count || 0;
  const defects = data?.critical_defects_count || 0;
  const hasIssues = overdue > 0 || defects > 0;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        defects > 0 && 'border-destructive/50 bg-destructive/5',
        overdue > 0 && defects === 0 && 'border-warning/50 bg-warning/5'
      )}
      onClick={() => navigate('/maintenance')}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Maintenance</CardTitle>
        <Wrench className={cn('w-5 h-5', hasIssues ? 'text-warning' : 'text-muted-foreground')} />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <div>
            <span className="text-2xl font-bold">{overdue}</span>
            <p className="text-xs text-muted-foreground">overdue</p>
          </div>
          {defects > 0 && (
            <div className="border-l pl-3">
              <span className="text-lg font-bold text-destructive">{defects}</span>
              <p className="text-xs text-destructive">critical defects</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Drills widget
export const DrillsWidget: React.FC<WidgetProps> = ({ data, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading) return <WidgetSkeleton />;

  const overdue = data?.overdue_drills_count || 0;
  const hasOverdue = overdue > 0;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        hasOverdue && 'border-warning/50 bg-warning/5'
      )}
      onClick={() => navigate('/ism/drills')}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Drills</CardTitle>
        <Target className={cn('w-5 h-5', hasOverdue ? 'text-warning' : 'text-muted-foreground')} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{overdue}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {hasOverdue ? 'Overdue drills' : 'All drills on schedule'}
        </p>
      </CardContent>
    </Card>
  );
};

// Training gaps widget
export const TrainingWidget: React.FC<WidgetProps> = ({ data, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading) return <WidgetSkeleton />;

  const gaps = data?.training_gaps_count || 0;
  const hasGaps = gaps > 0;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        hasGaps && 'border-warning/50 bg-warning/5'
      )}
      onClick={() => navigate('/training')}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Training Gaps</CardTitle>
        <GraduationCap className={cn('w-5 h-5', hasGaps ? 'text-warning' : 'text-muted-foreground')} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{gaps}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {hasGaps ? 'Overdue training records' : 'All training current'}
        </p>
      </CardContent>
    </Card>
  );
};

// Compliance widget (audits, NCs, CAPAs)
export const ComplianceWidget: React.FC<WidgetProps> = ({ data, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading) return <WidgetSkeleton />;

  const audits = data?.audits_due_90d || 0;
  const ncs = data?.open_ncs_count || 0;
  const capas = data?.open_capas_count || 0;

  return (
    <Card className="cursor-pointer transition-all hover:shadow-md" onClick={() => navigate('/ism/audits')}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Compliance</CardTitle>
        <ClipboardList className="w-5 h-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <span className="text-lg font-bold">{audits}</span>
            <p className="text-xs text-muted-foreground">Audits (90d)</p>
          </div>
          <div>
            <span className={cn('text-lg font-bold', ncs > 0 && 'text-warning')}>{ncs}</span>
            <p className="text-xs text-muted-foreground">Open NCs</p>
          </div>
          <div>
            <span className={cn('text-lg font-bold', capas > 0 && 'text-warning')}>{capas}</span>
            <p className="text-xs text-muted-foreground">Open CAPAs</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Pending signatures widget
export const SignaturesWidget: React.FC<WidgetProps> = ({ data, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading) return <WidgetSkeleton />;

  const pending = data?.pending_signatures_count || 0;
  const hasPending = pending > 0;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        hasPending && 'border-primary/50 bg-primary/5'
      )}
      onClick={() => navigate('/ism/forms/pending')}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Pending Signatures</CardTitle>
        <FileSignature className={cn('w-5 h-5', hasPending ? 'text-primary' : 'text-muted-foreground')} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{pending}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {hasPending ? 'Forms awaiting signature' : 'All forms signed'}
        </p>
      </CardContent>
    </Card>
  );
};

// Skeleton loader for widgets
const WidgetSkeleton: React.FC = () => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-5 w-5 rounded" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-3 w-32" />
    </CardContent>
  </Card>
);

export { WidgetSkeleton };

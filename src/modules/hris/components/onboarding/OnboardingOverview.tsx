import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, CheckCircle2, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useOnboardingRecords, useOpenOnboardingItems, useUpcomingJoiners } from '@/modules/hris/hooks/useOnboarding';
import { computeOnboardingKpis, type JoinerFilters } from '@/modules/hris/lib/onboarding';
import { JoinersTable } from './JoinersTable';
import { TemplatesPanel } from './TemplatesPanel';

interface OnboardingOverviewProps {
  canEdit: boolean;
  onSelectCrew: (profileId: string) => void;
}

interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: number | null;
  tone?: 'default' | 'warning' | 'critical' | 'success';
  active?: boolean;
  onClick: () => void;
}

const KpiTile: React.FC<KpiTileProps> = ({ icon: Icon, label, value, tone = 'default', active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active && 'border-primary ring-1 ring-primary',
    )}
  >
    <div
      className={cn(
        'rounded-md p-2',
        tone === 'critical'
          ? 'bg-destructive/10 text-destructive'
          : tone === 'warning'
            ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
            : tone === 'success'
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-primary/10 text-primary',
      )}
    >
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      {value === null ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-semibold leading-none text-foreground">{value}</p>}
      <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
    </div>
  </button>
);

type Tile = 'joiners' | 'in_progress' | 'overdue' | 'completed';

const TILE_FILTERS: Record<Tile, Partial<JoinerFilters>> = {
  joiners: { status: 'all' },
  in_progress: { status: 'in_progress' },
  overdue: { status: 'in_progress' },
  completed: { status: 'completed' },
};

/** Company-wide onboarding view: KPI tiles, joiners table and templates. */
export const OnboardingOverview: React.FC<OnboardingOverviewProps> = ({ canEdit, onSelectCrew }) => {
  const [tile, setTile] = useState<Tile>('joiners');
  const [tab, setTab] = useState<'joiners' | 'templates'>('joiners');
  const joiners = useUpcomingJoiners({ pastDays: 30, futureDays: 30 });
  const records = useOnboardingRecords();
  const openItems = useOpenOnboardingItems();

  const loading = joiners.isLoading || records.isLoading || openItems.isLoading;
  const kpis = useMemo(
    () => (loading ? null : computeOnboardingKpis({ joiners: joiners.joiners, records: records.all, openItems: openItems.items })),
    [loading, joiners.joiners, records.all, openItems.items],
  );

  const pick = (next: Tile) => {
    setTile(next);
    setTab('joiners');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile icon={CalendarPlus} label="Joiners in the next 30 days" value={kpis?.joinersNext30 ?? null} active={tile === 'joiners'} onClick={() => pick('joiners')} />
        <KpiTile icon={Loader2} label="Onboarding in progress" value={kpis?.inProgress ?? null} active={tile === 'in_progress'} onClick={() => pick('in_progress')} />
        <KpiTile icon={AlertTriangle} label="Overdue checklist items" value={kpis?.overdueItems ?? null} tone={kpis && kpis.overdueItems > 0 ? 'critical' : 'default'} active={tile === 'overdue'} onClick={() => pick('overdue')} />
        <KpiTile icon={CheckCircle2} label="Completed this quarter" value={kpis?.completedThisQuarter ?? null} tone="success" active={tile === 'completed'} onClick={() => pick('completed')} />
      </div>

      {joiners.isError && (
        <Alert variant="destructive">
          <AlertTitle>Could not load joiners</AlertTitle>
          <AlertDescription>{joiners.error instanceof Error ? joiners.error.message : 'Unknown error'}</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'joiners' | 'templates')}>
        <TabsList>
          <TabsTrigger value="joiners">Joiners</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>
        <TabsContent value="joiners" className="mt-4">
          <JoinersTable key={tile} joiners={joiners.joiners} isLoading={joiners.isLoading} onSelect={onSelectCrew} initialFilters={TILE_FILTERS[tile]} />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesPanel canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OnboardingOverview;

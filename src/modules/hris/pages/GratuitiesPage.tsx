import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, Coins, HandCoins, Plus, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import {
  useGratuityDefaults,
  useGratuityMutations,
  useGratuityPool,
  useGratuityPools,
  useMyGratuities,
  type GratuityDistributionWithProfile,
} from '@/modules/hris/hooks/useGratuities';
import { formatMinor, humanise } from '@/modules/hris/lib/format';
import {
  DEFAULT_POOL_FILTERS,
  POOL_STATUSES,
  availablePoolYears,
  computeGratuityKpis,
  csvFileName,
  gratuityCsvRows,
  isPoolEditable,
  poolFormToPayload,
  toCsv,
  type GratuityPoolFilters,
  type GratuityPoolStatus,
  type GratuitySplitMethod,
  type PoolFormValues,
} from '@/modules/hris/lib/gratuities';
import { PoolsTable } from '@/modules/hris/components/gratuities/PoolsTable';
import { PoolFormDialog } from '@/modules/hris/components/gratuities/PoolFormDialog';
import { PoolHeader } from '@/modules/hris/components/gratuities/PoolHeader';
import { SplitMethodPicker } from '@/modules/hris/components/gratuities/SplitMethodPicker';
import { DistributionsTable, type DistributionAction } from '@/modules/hris/components/gratuities/DistributionsTable';
import { DistributionAdjustDialog, type DistributionDialogResult } from '@/modules/hris/components/gratuities/DistributionAdjustDialog';
import { MyGratuitiesTable } from '@/modules/hris/components/gratuities/MyGratuitiesTable';

// ---------------------------------------------------------------------------
// KPI tile
// ---------------------------------------------------------------------------

interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  loading: boolean;
  tone?: 'default' | 'warning' | 'success';
  active?: boolean;
  onClick?: () => void;
}

const KpiTile: React.FC<KpiTileProps> = ({ icon: Icon, label, value, loading, tone = 'default', active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={cn(
      'flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      onClick && 'hover:bg-accent/50',
      active && 'border-primary ring-1 ring-primary',
    )}
  >
    <div className={cn('rounded-md p-2', tone === 'warning' ? 'bg-yellow-500/10 text-yellow-500' : tone === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-primary/10 text-primary')}>
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      {loading ? <Skeleton className="h-7 w-16" /> : <p className="truncate text-xl font-semibold leading-none text-foreground">{value}</p>}
      <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
    </div>
  </button>
);

const moneyByCurrency = (map: Record<string, number>): string => {
  const entries = Object.entries(map);
  if (entries.length === 0) return '—';
  return entries.map(([ccy, minor]) => formatMinor(minor, ccy)).join(' · ');
};

const downloadCsv = (fileName: string, csv: string) => {
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type ConfirmKind = 'approve' | 'distribute' | 'cancel' | 'delete';
type RowDialog = { open: false } | { open: true; distribution: GratuityDistributionWithProfile; action: DistributionAction };

const CONFIRM_COPY: Record<ConfirmKind, { title: string; description: string; cta: string; destructive?: boolean }> = {
  approve: {
    title: 'Approve this pool?',
    description: 'Approved shares are locked for editing and are picked up automatically by the payroll run that covers the period end.',
    cta: 'Approve',
  },
  distribute: {
    title: 'Mark as distributed?',
    description: 'Use this when the gratuity was handed out outside payroll (for example in cash). Every pending share is marked as paid today.',
    cta: 'Mark distributed',
  },
  cancel: {
    title: 'Cancel this pool?',
    description: 'Pending shares are cancelled and nothing will be paid. The pool stays visible for the record.',
    cta: 'Cancel pool',
    destructive: true,
  },
  delete: {
    title: 'Delete this draft?',
    description: 'The draft pool and any calculated shares are removed permanently.',
    cta: 'Delete',
    destructive: true,
  },
};

const GratuitiesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const access = usePayrollAccess();
  const poolId = searchParams.get('pool');
  const selfOnly = !access.loading && access.selfOnly;
  const canView = !access.loading && access.canView;
  const canEdit = !access.loading && access.canEdit;
  const canAdmin = !access.loading && access.canAdmin;

  const { vessels, vesselName } = useCompanyVessels();
  const { defaults } = useGratuityDefaults();
  const [filters, setFilters] = useState<GratuityPoolFilters>(DEFAULT_POOL_FILTERS);
  const list = useGratuityPools(filters);
  const detail = useGratuityPool(canView ? poolId : null);
  const mine = useMyGratuities({ enabled: selfOnly });
  const mutations = useGratuityMutations();

  const [formOpen, setFormOpen] = useState<'create' | 'edit' | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [rowDialog, setRowDialog] = useState<RowDialog>({ open: false });

  const openPool = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('pool', id);
          else next.delete('pool');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const years = useMemo(() => availablePoolYears(list.all), [list.all]);
  const kpiYear = filters.year === 'all' ? new Date().getFullYear() : filters.year;
  const kpis = useMemo(() => computeGratuityKpis(list.all, kpiYear), [list.all, kpiYear]);
  const patchFilters = (next: Partial<GratuityPoolFilters>) => setFilters((prev) => ({ ...prev, ...next }));

  const pool = detail.pool;
  const busy = mutations.isPending;

  // -- handlers -------------------------------------------------------------

  const handleFormSubmit = async (values: PoolFormValues) => {
    const payload = poolFormToPayload(values);
    if (formOpen === 'edit' && pool) {
      await mutations.updatePool.mutateAsync({ pool, payload });
    } else {
      const created = await mutations.createPool.mutateAsync(payload);
      openPool(created.id);
    }
    setFormOpen(null);
  };

  const handleApplyMethod = async (method: GratuitySplitMethod) => {
    if (!pool) return;
    const updated = await mutations.updatePool.mutateAsync({ pool, payload: { split_method: method } });
    await mutations.calculatePool.mutateAsync(updated);
  };

  const handleConfirm = async () => {
    if (!pool || !confirm) return;
    const kind = confirm;
    setConfirm(null);
    if (kind === 'approve') await mutations.approvePool.mutateAsync(pool);
    else if (kind === 'distribute') await mutations.markDistributed.mutateAsync(pool);
    else if (kind === 'cancel') await mutations.cancelPool.mutateAsync({ pool });
    else if (kind === 'delete') {
      await mutations.deletePool.mutateAsync(pool);
      openPool(null);
    }
  };

  const handleRowDialog = async (result: DistributionDialogResult) => {
    if (!rowDialog.open || !pool) return;
    const { distribution } = rowDialog;
    const patch =
      result.action === 'exclude'
        ? { excluded: true, exclusion_reason: result.reason }
        : result.action === 'include'
          ? { excluded: false, exclusion_reason: null }
          : { adjustment_minor: result.adjustmentMinor, adjustment_reason: result.adjustmentMinor === 0 ? null : result.reason };
    await mutations.updateDistribution.mutateAsync({ distribution, poolStatus: pool.status, patch });
    setRowDialog({ open: false });
  };

  const handleExport = () => {
    if (!pool) return;
    const rows = gratuityCsvRows(
      pool,
      pool.vessel_name ?? vesselName(pool.vessel_id),
      pool.distributions.map((d) => ({ ...d, rank: d.profile?.rank ?? null, department: d.profile?.department ?? null })),
    );
    downloadCsv(csvFileName(pool), toCsv(rows));
  };

  // -- render ---------------------------------------------------------------

  if (access.loading) {
    return (
      <div className="space-y-6">
        <HrisPageHeader icon={Coins} title="Gratuities" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (selfOnly || !canView) {
    return (
      <div className="space-y-6">
        <HrisPageHeader icon={Coins} title="Gratuities" description="Your share of gratuities received on board." />
        {selfOnly ? (
          <MyGratuitiesTable gratuities={mine.gratuities} isLoading={mine.isLoading} />
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">You do not have access to gratuities.</CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (poolId) {
    return (
      <div className="space-y-6">
        <HrisPageHeader icon={Coins} title="Gratuities" description="Pool detail: split, shares and payout status." />
        {detail.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !pool ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
              <p>This pool could not be found or you no longer have access to it.</p>
              <Button variant="outline" onClick={() => openPool(null)}>
                Back to all pools
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <PoolHeader
              pool={pool}
              canEdit={canEdit}
              canAdmin={canAdmin}
              busy={busy}
              onBack={() => openPool(null)}
              onCalculate={() => void mutations.calculatePool.mutateAsync(pool)}
              onEdit={() => setFormOpen('edit')}
              onApprove={() => setConfirm('approve')}
              onMarkDistributed={() => setConfirm('distribute')}
              onCancel={() => setConfirm('cancel')}
              onDelete={() => setConfirm('delete')}
              onExport={handleExport}
            />
            {isPoolEditable(pool.status) && <SplitMethodPicker pool={pool} canEdit={canEdit} busy={busy} onApply={handleApplyMethod} />}
            <DistributionsTable pool={pool} canEdit={canEdit} busy={busy} onAction={(distribution, action) => setRowDialog({ open: true, distribution, action })} />

            <PoolFormDialog
              open={formOpen === 'edit'}
              onOpenChange={(o) => !o && setFormOpen(null)}
              pool={pool}
              vessels={vessels}
              onSubmit={handleFormSubmit}
              isPending={mutations.updatePool.isPending}
            />
            <DistributionAdjustDialog
              open={rowDialog.open}
              onOpenChange={(o) => !o && setRowDialog({ open: false })}
              distribution={rowDialog.open ? rowDialog.distribution : null}
              action={rowDialog.open ? rowDialog.action : 'adjust'}
              currency={pool.currency}
              onConfirm={handleRowDialog}
              isPending={mutations.updateDistribution.isPending}
            />
            <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{confirm ? CONFIRM_COPY[confirm].title : ''}</AlertDialogTitle>
                  <AlertDialogDescription>{confirm ? CONFIRM_COPY[confirm].description : ''}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep as is</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void handleConfirm()}
                    className={confirm && CONFIRM_COPY[confirm].destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
                  >
                    {confirm ? CONFIRM_COPY[confirm].cta : ''}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={Coins}
        title="Gratuities"
        description="Tips and gratuities received per vessel, split across the crew onboard and paid through payroll."
        actions={
          canEdit && (
            <Button onClick={() => setFormOpen('create')} disabled={busy}>
              <Plus className="mr-2 h-4 w-4" /> New pool
            </Button>
          )
        }
        toolbar={
          <>
            <Select value={filters.vesselId} onValueChange={(v) => patchFilters({ vesselId: v })}>
              <SelectTrigger className="w-full md:w-52">
                <SelectValue placeholder="Vessel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vessels</SelectItem>
                {vessels.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.status} onValueChange={(v) => patchFilters({ status: v as GratuityPoolStatus | 'all' })}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {POOL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {humanise(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(filters.year)} onValueChange={(v) => patchFilters({ year: v === 'all' ? 'all' : Number(v) })}>
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          icon={Coins}
          label={`Pools in ${kpiYear}`}
          value={kpis.poolsThisYear}
          loading={list.isLoading}
          active={filters.status === 'all'}
          onClick={() => patchFilters({ status: 'all', year: kpiYear })}
        />
        <KpiTile icon={Wallet} label={`Net received in ${kpiYear}`} value={moneyByCurrency(kpis.receivedByCurrency)} loading={list.isLoading} />
        <KpiTile
          icon={HandCoins}
          label={`Distributed in ${kpiYear}`}
          value={moneyByCurrency(kpis.distributedByCurrency)}
          loading={list.isLoading}
          tone="success"
          active={filters.status === 'distributed'}
          onClick={() => patchFilters({ status: 'distributed', year: kpiYear })}
        />
        <KpiTile
          icon={kpis.pendingApproval ? Clock : CheckCircle2}
          label="Pending approval"
          value={kpis.pendingApproval}
          loading={list.isLoading}
          tone={kpis.pendingApproval ? 'warning' : 'success'}
          active={filters.status === 'calculated'}
          onClick={() => patchFilters({ status: 'calculated', year: 'all' })}
        />
      </div>

      <PoolsTable
        pools={list.pools}
        isLoading={list.isLoading}
        onSelect={openPool}
        emptyHint={list.all.length === 0 ? (canEdit ? 'No gratuity pools yet. Create one to split a tip across the crew.' : 'No gratuity pools have been recorded yet.') : undefined}
      />

      <PoolFormDialog
        open={formOpen === 'create'}
        onOpenChange={(o) => !o && setFormOpen(null)}
        defaults={{ currency: defaults.currency, split_method: defaults.split_method, vessel_id: filters.vesselId === 'all' ? undefined : filters.vesselId }}
        vessels={vessels}
        onSubmit={handleFormSubmit}
        isPending={mutations.createPool.isPending}
      />
    </div>
  );
};

export default GratuitiesPage;

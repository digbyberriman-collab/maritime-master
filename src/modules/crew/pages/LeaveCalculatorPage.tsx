import { useMemo, useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { useCrewLeave } from '@/modules/crew/hooks/useCrewLeave';
import { useLeavePolicy } from '@/modules/crew/hooks/useLeavePolicy';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { Calculator, ArrowLeft, Search, Loader2, Download, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LEAVE_DEPARTMENTS, type LeaveDepartment } from '@/modules/crew/leaveConstants';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const csvEscape = (v: any): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export default function LeaveCalculatorPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { selectedVessel, isAllVessels, canAccessAllVessels } = useVessel();
  const [year, setYear] = useState(new Date().getFullYear());
  const [department, setDepartment] = useState<LeaveDepartment>('All');
  const [search, setSearch] = useState('');
  const [fleetView, setFleetView] = useState(false);
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);

  const isHoD = ['master', 'chief_engineer', 'chief_officer'].includes(profile?.role || '');

  const { crewLeaveData, loading, effectiveVesselId } = useCrewLeave(year, new Date().getMonth() + 1, {
    fleetWide: fleetView && canAccessAllVessels,
    departmentScope: isHoD && department === 'All' ? null : department === 'All' ? null : department,
  });

  const { data: policyData } = useLeavePolicy(effectiveVesselId);
  const policy = policyData?.policy;
  const policyRow = policyData?.row;

  const filtered = useMemo(() => {
    let data = crewLeaveData;
    if (search) {
      const s = search.toLowerCase();
      data = data.filter((c) =>
        c.firstName.toLowerCase().includes(s) ||
        c.lastName.toLowerCase().includes(s) ||
        c.position.toLowerCase().includes(s),
      );
    }
    return data.sort((a, b) => a.lastName.localeCompare(b.lastName));
  }, [crewLeaveData, search]);

  const selectedCrew = useMemo(
    () => filtered.find((c) => c.userId === selectedCrewId) ?? filtered[0] ?? null,
    [filtered, selectedCrewId],
  );

  const exportCsv = () => {
    const header = [
      'Last Name', 'First Name', 'Vessel', 'Department', 'Rank', 'Rotation',
      'Employment Start', 'Annual Entitlement', 'Carryover', 'Adjustments',
      'Accrued', 'Taken', 'Booked', 'Pending', 'Remaining', 'Notes',
    ];
    const lines = [header.map(csvEscape).join(',')];
    filtered.forEach((c) => {
      lines.push([
        c.lastName, c.firstName, c.vesselName ?? '', c.department, c.position,
        c.rotation || '', c.employmentStart || c.contractStart || '',
        c.annualEntitlement, c.carryover, c.adjustments, c.accrued, c.taken,
        c.booked, c.pending, c.remaining, (c.accrualNotes ?? []).join(' | '),
      ].map(csvEscape).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const scope = effectiveVesselId ? selectedVessel?.name ?? 'vessel' : 'fleet';
    link.download = `leave-calculator-${scope}-${year}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const scopeLabel =
    fleetView && canAccessAllVessels
      ? 'Fleet-wide'
      : effectiveVesselId
        ? selectedVessel?.name ?? 'Vessel'
        : isAllVessels
          ? 'All Vessels'
          : 'No vessel selected';

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/crew/leave')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Calculator className="w-6 h-6" />
                Leave Calculator
              </h1>
              <p className="text-sm text-muted-foreground">
                {scopeLabel} — {year} • {filtered.length} crew • Policy: {policyRow?.scope_label ?? 'default'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {canAccessAllVessels && (
              <Button variant={fleetView ? 'default' : 'outline'} size="sm" onClick={() => setFleetView(!fleetView)}>
                Fleet View
              </Button>
            )}
            <Tabs value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
              <TabsList className="h-8">
                {[year - 1, year, year + 1].map((y) => (
                  <TabsTrigger key={y} value={String(y)} className="text-xs h-7">{y}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Policy summary */}
        {policy && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Info className="w-4 h-4" /> Active Leave Policy</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              <Stat label="Annual Entitlement" value={`${policy.defaultAnnualEntitlement} days`} />
              <Stat label="Accrual Method" value={policy.accrualMethod} />
              <Stat label="Monthly Accrual" value={`${policy.monthlyAccrualDays} days`} />
              <Stat label="Pro-rata" value={policy.proRata ? 'Yes' : 'No'} />
              <Stat label="Rounding" value={policy.rounding} />
              <Stat label="Booked deducts" value={policy.bookedDeducts ? 'Yes' : 'No'} />
              <Stat label="Sick affects balance" value={policy.sickAffectsBalance ? 'Yes' : 'No'} />
              <Stat label="Training affects balance" value={policy.trainingAffectsBalance ? 'Yes' : 'No'} />
              <Stat label="Unpaid affects balance" value={policy.unpaidAffectsBalance ? 'Yes' : 'No'} />
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap bg-card border rounded-lg p-3">
          <Select value={department} onValueChange={(v) => setDepartment(v as LeaveDepartment)}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAVE_DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search crew..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-[220px] pl-7 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Crew list */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Crew</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-y-auto divide-y">
                {filtered.length === 0 && (
                  <div className="p-4 text-xs text-muted-foreground text-center">No crew match current filters.</div>
                )}
                {filtered.map((c) => {
                  const active = (selectedCrew?.userId ?? filtered[0]?.userId) === c.userId;
                  return (
                    <button
                      key={c.userId}
                      onClick={() => setSelectedCrewId(c.userId)}
                      className={cn(
                        'w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors',
                        active && 'bg-primary/10',
                      )}
                    >
                      <div className="text-sm font-medium">{c.lastName}, {c.firstName}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                        <span>{c.position}</span>
                        {c.vesselName && <span>· {c.vesselName}</span>}
                        <span>· {c.remaining} days remaining</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Detail */}
          <Card className="lg:col-span-2">
            {selectedCrew ? (
              <>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-base">
                        {selectedCrew.lastName}, {selectedCrew.firstName}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {selectedCrew.position} • {selectedCrew.department} • {selectedCrew.vesselName ?? 'No vessel'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {selectedCrew.isImported && <Badge variant="secondary" className="text-[10px]">Imported</Badge>}
                      {selectedCrew.accrualNotes.length > 0 && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-800">
                          {selectedCrew.accrualNotes.length} note(s)
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Stat label="Annual entitlement" value={`${selectedCrew.annualEntitlement} days`} />
                    <Stat label="Employment start" value={selectedCrew.employmentStart || selectedCrew.contractStart || '—'} />
                    <Stat label="Rotation" value={selectedCrew.rotation || '—'} />
                    <Stat label="Contract end" value={selectedCrew.contractEnd || '—'} />
                    <Stat label="Monthly accrual" value={`${selectedCrew.monthlyAccrual} days`} />
                    <Stat label="Carryover" value={`${selectedCrew.carryover} days`} />
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <tbody>
                        <Row label="Carryover (previous year)" value={selectedCrew.carryover} />
                        <Row label="Manual adjustments" value={selectedCrew.adjustments} />
                        <Row label="Accrued YTD" value={selectedCrew.accrued} positive />
                        <Row label="Taken" value={`-${selectedCrew.taken}`} negative={selectedCrew.taken > 0} />
                        <Row label="Booked (approved future)" value={`-${selectedCrew.booked}`} negative={selectedCrew.booked > 0} />
                        <Row label="Pending requests" value={`(${selectedCrew.pending} days)`} muted />
                        <tr className="bg-muted/40 font-bold">
                          <td className="px-3 py-2">Remaining balance</td>
                          <td className={cn(
                            'px-3 py-2 text-right',
                            selectedCrew.remaining < 0 && 'text-red-600',
                            selectedCrew.remaining > 40 && 'text-green-600',
                          )}>
                            {selectedCrew.remaining}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {selectedCrew.accrualNotes.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1">
                      <div className="font-medium text-amber-900 flex items-center gap-1">
                        <Info className="w-3 h-3" /> Calculation notes
                      </div>
                      {selectedCrew.accrualNotes.map((n, i) => (
                        <div key={i} className="text-amber-800">• {n}</div>
                      ))}
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Upcoming leave</p>
                    {selectedCrew.nextLeaveStart ? (
                      <p className="text-sm">
                        {selectedCrew.nextLeaveStart}
                        {selectedCrew.nextLeaveEnd && selectedCrew.nextLeaveEnd !== selectedCrew.nextLeaveStart
                          ? ` → ${selectedCrew.nextLeaveEnd}`
                          : ''}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No upcoming leave scheduled.</p>
                    )}
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Select a crew member to view their leave breakdown.
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
  positive,
  negative,
  muted,
}: {
  label: string;
  value: number | string;
  positive?: boolean;
  negative?: boolean;
  muted?: boolean;
}) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-3 py-1.5 text-muted-foreground">{label}</td>
      <td className={cn(
        'px-3 py-1.5 text-right font-medium',
        positive && 'text-green-700',
        negative && 'text-red-700',
        muted && 'text-muted-foreground',
      )}>
        {value}
      </td>
    </tr>
  );
}

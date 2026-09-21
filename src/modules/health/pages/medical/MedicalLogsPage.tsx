import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Thermometer,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatTile, StatGrid } from '@/modules/health/components/StatTile';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { useSupplyLocations } from '@/modules/health/hooks/useMedicalStores';
import { useMedicalEquipment } from '@/modules/health/hooks/useMedicalEquipment';
import {
  LOG_TYPES,
  logTypeLabel,
  logTypeUnit,
  useMedicalLogs,
} from '@/modules/health/hooks/useMedicalProtocols';
import { formatDate, formatDateTime, toneClass } from '@/modules/health/lib/format';

/** A medical fridge must stay between these temperatures. */
const FRIDGE_MIN_C = 2;
const FRIDGE_MAX_C = 8;

/**
 * The ship's medical log books. Fridge temperatures, daily hospital checks,
 * oxygen pressures, sharps disposal and telemedicine calls all share one
 * shape, so they share one page with the type as a filter.
 */
const MedicalLogsPage: React.FC = () => {
  const access = useMedicalAccess();
  const { vessels, selectedVesselId } = useVessel();
  const [vesselId, setVesselId] = useState<string | null>(selectedVesselId);
  const [logType, setLogType] = useState<string>('fridge_temperature');
  const logs = useMedicalLogs({ logType, vesselId, limit: 200 });
  const [formOpen, setFormOpen] = useState(false);

  const chartData = useMemo(() => {
    if (logType !== 'fridge_temperature') return [];
    return logs.entries
      .filter((e) => e.value_numeric !== null)
      .slice(0, 60)
      .reverse()
      .map((e) => ({
        at: formatDate(e.recorded_at, 'dd MMM HH:mm'),
        value: e.value_numeric as number,
      }));
  }, [logs.entries, logType]);

  const summary = useMemo(() => {
    const rows = logs.entries;
    const outOfLimits = rows.filter((r) => r.within_limits === false).length;
    const last = rows[0] ?? null;
    return {
      total: rows.length,
      outOfLimits,
      lastRecorded: last?.recorded_at ?? null,
      lastValue: last?.value_numeric ?? null,
    };
  }, [logs.entries]);

  let body: React.ReactNode;
  if (logs.isError) {
    body = <HealthError error={logs.error} title="Could not load the log" />;
  } else if (logs.isLoading) {
    body = <HealthLoading rows={5} />;
  } else if (logs.entries.length === 0) {
    body = (
      <HealthEmpty
        icon={FileText}
        title={`No ${logTypeLabel(logType).toLowerCase()} entries`}
        description="Recording entries here builds the continuous record a port state inspection expects."
        action={
          access.canEdit && (
            <Button onClick={() => setFormOpen(true)} className="gap-1">
              <Plus className="h-4 w-4" /> Record an entry
            </Button>
          )
        }
      />
    );
  } else {
    body = (
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Reading</th>
                  <th className="px-4 py-2.5 font-medium">Where</th>
                  <th className="px-4 py-2.5 font-medium">Within limits</th>
                  <th className="px-4 py-2.5 font-medium">Notes</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-accent/40">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                      {formatDateTime(entry.recorded_at)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {entry.value_numeric !== null
                        ? `${entry.value_numeric}${entry.value_unit ? ` ${entry.value_unit}` : ''}`
                        : entry.value_text || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {[entry.location_name, entry.equipment_name, entry.vessel_name]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.within_limits === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Badge
                          variant="outline"
                          className={cn(
                            'gap-1 text-[10px]',
                            entry.within_limits ? toneClass.ok : toneClass.expired,
                          )}
                        >
                          {entry.within_limits ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          {entry.within_limits ? 'In limits' : 'Out of limits'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {entry.action_taken || entry.notes || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {access.canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete entry"
                          onClick={() => logs.remove.mutate(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={FileText}
        scope="medical"
        title="Medical logs"
        description="Fridge temperatures, daily checks, oxygen, sharps and telemedicine calls."
        actions={
          access.canEdit && (
            <Button size="sm" className="gap-1" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> Record entry
            </Button>
          )
        }
        toolbar={
          <>
            <Select value={logType} onValueChange={setLogType}>
              <SelectTrigger className="md:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOG_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={vesselId ?? 'all'} onValueChange={(v) => setVesselId(v === 'all' ? null : v)}>
              <SelectTrigger className="md:w-52">
                <SelectValue placeholder="All vessels" />
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
          </>
        }
      />

      <StatGrid>
        <StatTile icon={FileText} label="Entries held" value={logs.isLoading ? null : summary.total} />
        <StatTile
          icon={AlertTriangle}
          label="Out of limits"
          value={logs.isLoading ? null : summary.outOfLimits}
          tone={summary.outOfLimits > 0 ? 'critical' : 'good'}
        />
        <StatTile
          icon={Thermometer}
          label="Last reading"
          value={
            logs.isLoading
              ? null
              : summary.lastValue !== null
                ? `${summary.lastValue}${logTypeUnit(logType) ? ` ${logTypeUnit(logType)}` : ''}`
                : '—'
          }
        />
        <StatTile
          icon={CheckCircle2}
          label="Last recorded"
          value={logs.isLoading ? null : summary.lastRecorded ? formatDate(summary.lastRecorded) : '—'}
        />
      </StatGrid>

      {logType === 'fridge_temperature' && chartData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Medical fridge temperature</CardTitle>
            <CardDescription>
              The shaded band is the {FRIDGE_MIN_C} to {FRIDGE_MAX_C}°C range vaccines must stay in.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="at"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                  domain={[0, 12]}
                />
                <ReferenceArea y1={FRIDGE_MIN_C} y2={FRIDGE_MAX_C} fill="hsl(var(--success))" fillOpacity={0.12} />
                <RechartsTooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    color: 'hsl(var(--popover-foreground))',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  name="°C"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {body}

      <LogEntryDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        logType={logType}
        vesselId={vesselId}
        onSubmit={(values) => logs.addEntry.mutateAsync(values)}
        busy={logs.isMutating}
      />
    </div>
  );
};

const LogEntryDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logType: string;
  vesselId: string | null;
  onSubmit: (values: Record<string, unknown> & { log_type: string }) => Promise<unknown>;
  busy: boolean;
}> = ({ open, onOpenChange, logType, vesselId, onSubmit, busy }) => {
  const { vessels } = useVessel();
  const locations = useSupplyLocations(null);
  const equipment = useMedicalEquipment(null);
  const [type, setType] = useState(logType);
  const [value, setValue] = useState('');
  const [text, setText] = useState('');
  const [withinLimits, setWithinLimits] = useState(true);
  const [action, setAction] = useState('');
  const [locationId, setLocationId] = useState('none');
  const [equipmentId, setEquipmentId] = useState('none');
  const [targetVessel, setTargetVessel] = useState(vesselId ?? 'none');
  const [recordedBy, setRecordedBy] = useState('');

  React.useEffect(() => {
    if (!open) return;
    setType(logType);
    setValue('');
    setText('');
    setWithinLimits(true);
    setAction('');
    setLocationId('none');
    setEquipmentId('none');
    setTargetVessel(vesselId ?? 'none');
    setRecordedBy('');
  }, [open, logType, vesselId]);

  const unit = logTypeUnit(type);
  const numeric = Number(value);

  // A fridge reading outside 2-8°C is automatically out of limits, so the
  // medic cannot record a breach as normal by accident.
  React.useEffect(() => {
    if (type !== 'fridge_temperature' || value === '') return;
    setWithinLimits(Number.isFinite(numeric) && numeric >= FRIDGE_MIN_C && numeric <= FRIDGE_MAX_C);
  }, [type, value, numeric]);

  const submit = async () => {
    await onSubmit({
      log_type: type,
      value_numeric: value === '' ? null : numeric,
      value_unit: unit,
      value_text: text || null,
      within_limits: value === '' && !text ? null : withinLimits,
      action_taken: action || null,
      location_id: locationId === 'none' ? null : locationId,
      equipment_id: equipmentId === 'none' ? null : equipmentId,
      vessel_id: targetVessel === 'none' ? null : targetVessel,
      recorded_by_name: recordedBy || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record a log entry</DialogTitle>
          <DialogDescription>
            Entries cannot be edited once recorded, only removed, so the log reads as a continuous
            record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="log-type">Log</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="log-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOG_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="log-value">Reading {unit ? `(${unit})` : ''}</Label>
            <Input
              id="log-value"
              type="number"
              step="0.1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="log-by">Recorded by</Label>
            <Input
              id="log-by"
              value={recordedBy}
              onChange={(e) => setRecordedBy(e.target.value)}
              placeholder="Leave blank to use your account"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="log-text">Entry</Label>
          <Textarea
            id="log-text"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What was checked and what was found"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="log-vessel">Vessel</Label>
            <Select value={targetVessel} onValueChange={setTargetVessel}>
              <SelectTrigger id="log-vessel">
                <SelectValue placeholder="Not vessel specific" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not vessel specific</SelectItem>
                {vessels.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="log-location">Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="log-location">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {locations.locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="log-equipment">Equipment</Label>
            <Select value={equipmentId} onValueChange={setEquipmentId}>
              <SelectTrigger id="log-equipment">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {equipment.equipment.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="log-limits" className="text-sm">
              Within limits
            </Label>
            {type === 'fridge_temperature' && (
              <p className="text-xs text-muted-foreground">
                Set automatically from the reading against {FRIDGE_MIN_C} to {FRIDGE_MAX_C}°C.
              </p>
            )}
          </div>
          <Switch id="log-limits" checked={withinLimits} onCheckedChange={setWithinLimits} />
        </div>

        {!withinLimits && (
          <div className="space-y-1.5">
            <Label htmlFor="log-action">Action taken</Label>
            <Textarea
              id="log-action"
              rows={2}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="Stock moved, engineer called, contents assessed"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MedicalLogsPage;

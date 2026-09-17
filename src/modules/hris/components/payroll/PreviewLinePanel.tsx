import React, { useState } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { usePreviewLine } from '@/modules/hris/hooks/usePayroll';
import { formatMinor, humanise } from '@/modules/hris/lib/format';

interface PreviewLinePanelProps {
  /** Defaults from the run being viewed (or the latest period). */
  defaultStart?: string | null;
  defaultEnd?: string | null;
  vesselId?: string | null;
}

/**
 * What-if calculator: picks a crew member and a date range, fetches their
 * active compensation and hr_days_onboard(), and runs the TypeScript engine.
 * Nothing is persisted — the RPC is the source of truth for real lines.
 */
export const PreviewLinePanel: React.FC<PreviewLinePanelProps> = ({ defaultStart, defaultEnd, vesselId }) => {
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [start, setStart] = useState(defaultStart ?? '');
  const [end, setEnd] = useState(defaultEnd ?? '');
  const [submitted, setSubmitted] = useState<{ start: string; end: string } | null>(null);

  const preview = usePreviewLine({
    profileId,
    start: submitted?.start ?? null,
    end: submitted?.end ?? null,
    vesselId: vesselId ?? null,
  });

  const comp = preview.compensation;
  const ccy = comp?.currency ?? 'EUR';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4 text-muted-foreground" /> Preview a line
              </CardTitle>
              <CardDescription>What-if calculation for one crew member. Uses the same rules as the payroll engine; nothing is saved.</CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm">{open ? 'Hide' : 'Open'}</Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
              <div className="space-y-1.5">
                <Label>Crew member</Label>
                <CrewPicker value={profileId} onChange={(id) => setProfileId(id)} includeInactive />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-start">From</Label>
                <Input id="pv-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-end">To</Label>
                <Input id="pv-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <Button
                type="button"
                disabled={!profileId || !start || !end || end < start}
                onClick={() => setSubmitted({ start, end })}
              >
                Calculate
              </Button>
            </div>

            {submitted && profileId && (
              preview.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculating…</div>
              ) : preview.error ? (
                <p className="text-sm text-destructive">{preview.error instanceof Error ? preview.error.message : 'Preview failed'}</p>
              ) : !comp ? (
                <p className="text-sm text-muted-foreground">This crew member has no active compensation record, so the engine would skip them.</p>
              ) : preview.result && preview.days ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compensation</p>
                    <p className="text-foreground">{formatMinor(comp.base_salary_minor, ccy)} <span className="text-muted-foreground">/ {humanise(comp.pay_frequency)}</span></p>
                    <p className="text-xs text-muted-foreground">Effective {comp.effective_from}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{preview.result.allowanceDetail.length} recurring allowance(s)</p>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Days</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
                      <span className="text-muted-foreground">In period</span><span className="text-right">{preview.days.daysInPeriod}</span>
                      <span className="text-muted-foreground">Onboard</span><span className="text-right">{preview.days.daysOnboard}</span>
                      <span className="text-muted-foreground">Paid leave</span><span className="text-right">{preview.days.daysLeavePaid}</span>
                      <span className="text-muted-foreground">Travel</span><span className="text-right">{preview.days.daysTravel}</span>
                      <span className="text-muted-foreground">Unpaid</span><span className="text-right">{preview.days.daysUnpaid}</span>
                      <span className="text-muted-foreground">Unclassified</span><span className="text-right">{preview.days.daysUnknown ?? 0}</span>
                      <span className="font-medium text-foreground">Paid days</span>
                      <span className="text-right font-medium text-foreground">{preview.result.daysPaid} ({(preview.result.prorationRatio * 100).toFixed(1)}%)</span>
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Result ({ccy})</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
                      <span className="text-muted-foreground">Base for period</span><span className="text-right">{formatMinor(preview.result.basePeriodMinor, ccy)}</span>
                      <span className="text-muted-foreground">Prorated base</span><span className="text-right">{formatMinor(preview.result.proratedBaseMinor, ccy)}</span>
                      {preview.result.allowanceDetail.map((a, i) => (
                        <React.Fragment key={`${a.name}-${i}`}>
                          <span className="text-muted-foreground">{a.name}</span><span className="text-right">{formatMinor(a.amount_minor, ccy)}</span>
                        </React.Fragment>
                      ))}
                      <span className="font-medium text-foreground">Gross</span><span className="text-right font-medium text-foreground">{formatMinor(preview.result.grossMinor, ccy)}</span>
                      <span className="font-semibold text-foreground">Net</span><span className="text-right font-semibold text-foreground">{formatMinor(preview.result.netMinor, ccy)}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Gratuities are attached only by the real calculation.</p>
                  </div>
                </div>
              ) : null
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default PreviewLinePanel;

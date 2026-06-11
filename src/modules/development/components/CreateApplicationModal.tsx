import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, DollarSign, Calendar, MapPin, Info } from 'lucide-react';
import { useCreateApplication, useSubmitApplication } from '@/modules/development/hooks/useDevelopmentMutations';
import { type DevelopmentCourse } from '@/modules/development/hooks/useDevelopment';
import { useProgramSettings } from '@/modules/development/hooks/useProgramSettings';
import { useEligibilityContext } from '@/modules/development/hooks/useEligibility';
import { calculateCosts, checkEligibility, DEFAULT_SETTINGS } from '@/modules/development/services/rulesEngine';
import {
  CATEGORY_CONFIG,
  FORMAT_LABELS,
  APPLICATION_CURRENCIES,
  type DevCategory,
} from '@/modules/development/constants';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: DevelopmentCourse | null;
}

export default function CreateApplicationModal({ open, onOpenChange, course }: Props) {
  const createApp = useCreateApplication();
  const submitApp = useSubmitApplication();
  const { data: settings = DEFAULT_SETTINGS } = useProgramSettings();
  const { data: eligibilityCtx } = useEligibilityContext();
  const isCustom = !course;

  const [form, setForm] = useState({
    custom_course_name: '',
    custom_category: 'professional' as DevCategory,
    course_provider: '',
    course_url: '',
    course_location: '',
    course_start_date: '',
    course_end_date: '',
    course_duration_days: '',
    course_duration_hours: '',
    course_description: '',
    estimated_tuition_usd: '',
    estimated_travel_usd: '',
    estimated_travel_route: '',
    estimated_accommodation_nights: '',
    estimated_accommodation_nightly_rate: String(settings.accommodation_cap_per_night_usd),
    estimated_food_per_diem_usd: String(settings.food_per_diem_usd),
    leave_days_accrued: '0',
    neutral_days_accrued: '0',
    application_currency: 'USD',
    exchange_rate_to_usd: '1',
    tuition_local_amount: '',
    travel_local_amount: '',
    accommodation_local_amount: '',
  });

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const courseName = isCustom ? form.custom_course_name : course.name;
  const courseCategory = isCustom ? form.custom_category : course.category;

  const durationDays = parseInt(form.course_duration_days) || 0;
  const durationHours = parseFloat(form.course_duration_hours) || undefined;
  const nights = parseInt(form.estimated_accommodation_nights) || 0;
  const fx = parseFloat(form.exchange_rate_to_usd) || 1;
  const isLocal = form.application_currency !== 'USD';

  // If user entered local-currency amounts, derive USD equivalents
  const tuitionUsdInput = isLocal && form.tuition_local_amount
    ? String((parseFloat(form.tuition_local_amount) || 0) * fx)
    : form.estimated_tuition_usd;
  const travelUsdInput = isLocal && form.travel_local_amount
    ? String((parseFloat(form.travel_local_amount) || 0) * fx)
    : form.estimated_travel_usd;
  const accomNightlyUsd = isLocal && form.accommodation_local_amount && nights > 0
    ? ((parseFloat(form.accommodation_local_amount) || 0) * fx) / nights
    : (parseFloat(form.estimated_accommodation_nightly_rate) || 0);

  const breakdown = useMemo(
    () =>
      calculateCosts(
        {
          category: courseCategory,
          format: course?.format ?? null,
          durationDays,
          tuitionUsd: parseFloat(tuitionUsdInput) || 0,
          travelUsd: parseFloat(travelUsdInput) || 0,
          accommodationNights: nights,
          accommodationNightlyRateUsd: accomNightlyUsd,
          foodPerDiemUsd: parseFloat(form.estimated_food_per_diem_usd) || undefined,
          durationHours,
          over4kRule: course?.over_4k_rule,
        },
        settings,
      ),
    [courseCategory, course, durationDays, durationHours, nights, tuitionUsdInput, travelUsdInput, accomNightlyUsd, form.estimated_food_per_diem_usd, settings],
  );

  const eligibilityWarnings = useMemo(
    () =>
      checkEligibility(
        {
          contractStartDate: eligibilityCtx?.contractStartDate,
          probationEndDate: eligibilityCtx?.probationEndDate,
          lastApprovedCourseEndDate: eligibilityCtx?.lastApprovedCourseEndDate,
          courseStartDate: form.course_start_date || null,
        },
        settings,
      ),
    [eligibilityCtx, form.course_start_date, settings],
  );

  const tuition = breakdown.tuition;
  const travel = breakdown.travel;
  const accommodation = breakdown.accommodation;
  const food = breakdown.food;
  const total = breakdown.total;
  const nightlyRate = Math.min(
    parseFloat(form.estimated_accommodation_nightly_rate) || 0,
    settings.accommodation_cap_per_night_usd,
  );
  const foodPerDiem = breakdown.perDiemUsed;
  const isSplitPayment = breakdown.appliesSplitPayment;

  const handleSaveDraft = async () => {
    if (!courseName.trim()) return;
    await createApp.mutateAsync({
      course_id: isCustom ? undefined : course?.id,
      course_name: courseName,
      category: courseCategory,
      course_description: form.course_description || (course?.notes ?? undefined),
      course_provider: form.course_provider || undefined,
      course_url: form.course_url || undefined,
      course_location: form.course_location || undefined,
      course_start_date: form.course_start_date || undefined,
      course_end_date: form.course_end_date || undefined,
      course_duration_days: durationDays || undefined,
      course_duration_hours: durationHours,
      estimated_tuition_usd: tuition || undefined,
      estimated_travel_usd: travel || undefined,
      estimated_travel_route: form.estimated_travel_route || undefined,
      estimated_accommodation_usd: accommodation || undefined,
      estimated_accommodation_nights: nights || undefined,
      estimated_accommodation_nightly_rate: nightlyRate || undefined,
      estimated_food_per_diem_usd: foodPerDiem || undefined,
      is_custom_course: isCustom,
      leave_days_accrued: parseInt(form.leave_days_accrued) || 0,
      neutral_days_accrued: parseInt(form.neutral_days_accrued) || 0,
      application_currency: form.application_currency,
      exchange_rate_to_usd: fx,
      tuition_local_amount: parseFloat(form.tuition_local_amount) || undefined,
      travel_local_amount: parseFloat(form.travel_local_amount) || undefined,
      accommodation_local_amount: parseFloat(form.accommodation_local_amount) || undefined,
      is_online_short: breakdown.isOnlineShort,
    });
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!courseName.trim()) return;
    const result = await createApp.mutateAsync({
      course_id: isCustom ? undefined : course?.id,
      course_name: courseName,
      category: courseCategory,
      course_description: form.course_description || undefined,
      course_provider: form.course_provider || undefined,
      course_url: form.course_url || undefined,
      course_location: form.course_location || undefined,
      course_start_date: form.course_start_date || undefined,
      course_end_date: form.course_end_date || undefined,
      course_duration_days: durationDays || undefined,
      course_duration_hours: durationHours,
      estimated_tuition_usd: tuition || undefined,
      estimated_travel_usd: travel || undefined,
      estimated_travel_route: form.estimated_travel_route || undefined,
      estimated_accommodation_usd: accommodation || undefined,
      estimated_accommodation_nights: nights || undefined,
      estimated_accommodation_nightly_rate: nightlyRate || undefined,
      estimated_food_per_diem_usd: foodPerDiem || undefined,
      is_custom_course: isCustom,
      leave_days_accrued: parseInt(form.leave_days_accrued) || 0,
      neutral_days_accrued: parseInt(form.neutral_days_accrued) || 0,
      application_currency: form.application_currency,
      exchange_rate_to_usd: fx,
      tuition_local_amount: parseFloat(form.tuition_local_amount) || undefined,
      travel_local_amount: parseFloat(form.travel_local_amount) || undefined,
      accommodation_local_amount: parseFloat(form.accommodation_local_amount) || undefined,
      is_online_short: breakdown.isOnlineShort,
    });
    if (result?.id) {
      await submitApp.mutateAsync(result.id);
    }
    onOpenChange(false);
  };

  const catConfig = CATEGORY_CONFIG[courseCategory];
  const isPending = createApp.isPending || submitApp.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isCustom ? 'Custom Course Application' : 'New Development Application'}</DialogTitle>
        </DialogHeader>

        {/* Custom Course Fields */}
        {isCustom && (
          <div className="space-y-4 rounded-lg border border-dashed p-4">
            <div className="space-y-2">
              <Label>Course Name *</Label>
              <Input
                value={form.custom_course_name}
                onChange={(e) => update('custom_course_name', e.target.value)}
                placeholder="e.g. Advanced Wine & Spirit Education"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <select
                value={form.custom_category}
                onChange={(e) => update('custom_category', e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {(Object.entries(CATEGORY_CONFIG) as [DevCategory, typeof CATEGORY_CONFIG[DevCategory]][]).map(
                  ([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  )
                )}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              Custom courses require Captain discretionary approval and may have different reimbursement terms.
            </p>
          </div>
        )}

        {/* Catalogue Course Info */}
        {course && (
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{course.name}</h3>
              <Badge variant="outline" className={`${catConfig.bgClass} ${catConfig.textClass} border-0 text-xs`}>
                {catConfig.label}
              </Badge>
            </div>
            <div className="flex gap-3 text-sm text-muted-foreground flex-wrap">
              <span>{course.department}</span>
              {course.format && <span>• {FORMAT_LABELS[course.format]}</span>}
              {course.duration_description && <span>• {course.duration_description}</span>}
            </div>
            {course.reimbursement_summary && (
              <p className="text-sm text-muted-foreground">{course.reimbursement_summary}</p>
            )}
          </div>
        )}

        <Separator />

        {/* Course Details */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Course Provider</Label>
            <Input value={form.course_provider} onChange={(e) => update('course_provider', e.target.value)} placeholder="e.g. RYA, WSET" />
          </div>
          <div className="space-y-2">
            <Label>Course URL</Label>
            <Input value={form.course_url} onChange={(e) => update('course_url', e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={form.course_location} onChange={(e) => update('course_location', e.target.value)} placeholder="City, Country" className="pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Duration (days)</Label>
            <Input type="number" value={form.course_duration_days} onChange={(e) => update('course_duration_days', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input type="date" value={form.course_start_date} onChange={(e) => update('course_start_date', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>End Date</Label>
            <Input type="date" value={form.course_end_date} onChange={(e) => update('course_end_date', e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Additional Notes</Label>
          <Textarea value={form.course_description} onChange={(e) => update('course_description', e.target.value)} rows={2} placeholder="Reason for applying, relevance to role..." />
        </div>

        <Separator />

        {/* Cost Estimates */}
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Cost Estimates (USD)
        </h3>

        {/* Currency entry */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Application Currency</Label>
            <select
              value={form.application_currency}
              onChange={(e) => update('application_currency', e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {APPLICATION_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Exchange Rate (1 {form.application_currency} → USD)</Label>
            <Input
              type="number"
              step="0.0001"
              value={form.exchange_rate_to_usd}
              onChange={(e) => update('exchange_rate_to_usd', e.target.value)}
              disabled={form.application_currency === 'USD'}
            />
          </div>
          {isLocal && (
            <>
              <div className="space-y-2">
                <Label>Tuition ({form.application_currency})</Label>
                <Input type="number" value={form.tuition_local_amount} onChange={(e) => update('tuition_local_amount', e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Travel ({form.application_currency})</Label>
                <Input type="number" value={form.travel_local_amount} onChange={(e) => update('travel_local_amount', e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Accommodation Total ({form.application_currency})</Label>
                <Input type="number" value={form.accommodation_local_amount} onChange={(e) => update('accommodation_local_amount', e.target.value)} placeholder="0" />
                <p className="text-xs text-muted-foreground">Used when {form.application_currency} amounts are provided; USD nightly rate below is derived automatically.</p>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Tuition Fee</Label>
            <Input type="number" value={form.estimated_tuition_usd} onChange={(e) => update('estimated_tuition_usd', e.target.value)} placeholder="0" disabled={isLocal && !!form.tuition_local_amount} />
          </div>
          <div className="space-y-2">
            <Label>Travel Cost</Label>
            <Input type="number" value={form.estimated_travel_usd} onChange={(e) => update('estimated_travel_usd', e.target.value)} placeholder="0" disabled={isLocal && !!form.travel_local_amount} />
          </div>
          <div className="space-y-2">
            <Label>Travel Route</Label>
            <Input value={form.estimated_travel_route} onChange={(e) => update('estimated_travel_route', e.target.value)} placeholder="e.g. Vessel → Antibes → London" />
          </div>
          <div className="space-y-2">
            <Label>Accommodation Nights</Label>
            <Input type="number" value={form.estimated_accommodation_nights} onChange={(e) => update('estimated_accommodation_nights', e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-2">
            <Label>Nightly Rate (max ${settings.accommodation_cap_per_night_usd})</Label>
            <Input
              type="number"
              value={form.estimated_accommodation_nightly_rate}
              onChange={(e) => update('estimated_accommodation_nightly_rate', e.target.value)}
              max={settings.accommodation_cap_per_night_usd}
              disabled={isLocal && !!form.accommodation_local_amount}
            />
          </div>
          <div className="space-y-2">
            <Label>Food Per Diem</Label>
            <Input type="number" value={form.estimated_food_per_diem_usd} onChange={(e) => update('estimated_food_per_diem_usd', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Course Duration (hours, optional)</Label>
            <Input type="number" step="0.5" value={form.course_duration_hours} onChange={(e) => update('course_duration_hours', e.target.value)} placeholder="e.g. 2" />
            <p className="text-xs text-muted-foreground">Short online courses (≤{settings.online_neutral_threshold_hours}h) accrue 0 neutral days.</p>
          </div>
        </div>

        <Separator />

        {/* Eligibility warnings */}
        {eligibilityWarnings.length > 0 && (
          <div className="rounded-lg border border-amber/30 bg-amber/5 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium text-amber">
              <Info className="h-4 w-4" />
              Eligibility notes (informational — not blocking)
            </div>
            {eligibilityWarnings.map((w) => (
              <div key={w.code} className="text-xs text-muted-foreground">• {w.message}</div>
            ))}
          </div>
        )}

        {/* Leave Days */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Leave Days Accrued</Label>
            <Input type="number" value={form.leave_days_accrued} onChange={(e) => update('leave_days_accrued', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Neutral Days Accrued</Label>
            <Input type="number" value={form.neutral_days_accrued} onChange={(e) => update('neutral_days_accrued', e.target.value)} />
          </div>
        </div>

        {/* Calendar preview */}
        {(form.course_start_date || form.course_end_date) && (
          <div className="rounded-lg border border-info/30 bg-info/5 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium text-info">
              <Calendar className="h-4 w-4" />
              Leave calendar impact (preview)
            </div>
            <div className="text-xs text-muted-foreground">
              {form.course_start_date && (
                <>Course window: <span className="text-foreground">{form.course_start_date}</span></>
              )}
              {form.course_end_date && (
                <> → <span className="text-foreground">{form.course_end_date}</span></>
              )}
              {durationDays > 0 && <> ({durationDays} day{durationDays !== 1 ? 's' : ''})</>}
            </div>
            <div className="text-xs text-muted-foreground">
              On approval: <span className="text-foreground">{form.leave_days_accrued || 0}</span> leave day(s) +{' '}
              <span className="text-foreground">{breakdown.neutralDaysEligible}</span> neutral day(s) will be flagged on the crew leave calendar.
              {breakdown.isOnlineShort && ' Short online course — no neutral days.'}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Tuition</span><span>${tuition.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Travel</span><span>${travel.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Accommodation ({nights} nights)</span><span>${accommodation.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Food ({durationDays} days)</span><span>${food.toLocaleString()}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Estimated Total</span><span>${total.toLocaleString()}</span>
          </div>
          {isSplitPayment && (
            <div className="flex items-center gap-2 text-amber text-sm mt-2">
              <AlertTriangle className="h-4 w-4" />
              <span>Over ${settings.professional_split_threshold_usd.toLocaleString()} — 50/50 split payment applies (50% upfront, 50% on completion)</span>
            </div>
          )}
          {breakdown.notes.map((n, i) => (
            <div key={i} className="text-xs text-muted-foreground mt-1">• {n}</div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button variant="secondary" onClick={handleSaveDraft} disabled={isPending || !courseName.trim()}>Save Draft</Button>
          <Button onClick={handleSubmit} disabled={isPending || total === 0 || !courseName.trim()}>Submit for Approval</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

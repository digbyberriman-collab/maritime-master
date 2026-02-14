import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, DollarSign, Calendar, MapPin } from 'lucide-react';
import { useCreateApplication, useSubmitApplication } from '@/hooks/useDevelopmentMutations';
import { type DevelopmentCourse } from '@/hooks/useDevelopment';
import {
  CATEGORY_CONFIG,
  FORMAT_LABELS,
  ACCOMMODATION_CAP_PER_NIGHT,
  FOOD_PER_DIEM_FLEET_ORGANISED,
  PROFESSIONAL_THRESHOLD,
  type DevCategory,
} from '@/lib/developmentConstants';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: DevelopmentCourse | null;
}

export default function CreateApplicationModal({ open, onOpenChange, course }: Props) {
  const createApp = useCreateApplication();
  const submitApp = useSubmitApplication();

  const [form, setForm] = useState({
    course_provider: '',
    course_url: '',
    course_location: '',
    course_start_date: '',
    course_end_date: '',
    course_duration_days: '',
    course_description: '',
    estimated_tuition_usd: '',
    estimated_travel_usd: '',
    estimated_travel_route: '',
    estimated_accommodation_nights: '',
    estimated_accommodation_nightly_rate: String(ACCOMMODATION_CAP_PER_NIGHT),
    estimated_food_per_diem_usd: String(FOOD_PER_DIEM_FLEET_ORGANISED),
    leave_days_accrued: '0',
    neutral_days_accrued: '0',
  });

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const tuition = parseFloat(form.estimated_tuition_usd) || 0;
  const travel = parseFloat(form.estimated_travel_usd) || 0;
  const nights = parseInt(form.estimated_accommodation_nights) || 0;
  const nightlyRate = Math.min(parseFloat(form.estimated_accommodation_nightly_rate) || 0, ACCOMMODATION_CAP_PER_NIGHT);
  const accommodation = nights * nightlyRate;
  const durationDays = parseInt(form.course_duration_days) || 0;
  const foodPerDiem = parseFloat(form.estimated_food_per_diem_usd) || 0;
  const food = durationDays * foodPerDiem;
  const total = tuition + travel + accommodation + food;

  const isOver4k = total > PROFESSIONAL_THRESHOLD;
  const isSplitPayment = course?.over_4k_rule && isOver4k;

  const handleSaveDraft = async () => {
    if (!course) return;
    await createApp.mutateAsync({
      course_id: course.id,
      course_name: course.name,
      category: course.category,
      course_description: form.course_description || course.notes || undefined,
      course_provider: form.course_provider || undefined,
      course_url: form.course_url || undefined,
      course_location: form.course_location || undefined,
      course_start_date: form.course_start_date || undefined,
      course_end_date: form.course_end_date || undefined,
      course_duration_days: durationDays || undefined,
      estimated_tuition_usd: tuition || undefined,
      estimated_travel_usd: travel || undefined,
      estimated_travel_route: form.estimated_travel_route || undefined,
      estimated_accommodation_usd: accommodation || undefined,
      estimated_accommodation_nights: nights || undefined,
      estimated_accommodation_nightly_rate: nightlyRate || undefined,
      estimated_food_per_diem_usd: foodPerDiem || undefined,
      estimated_total_usd: total || undefined,
      is_custom_course: false,
      leave_days_accrued: parseInt(form.leave_days_accrued) || 0,
      neutral_days_accrued: parseInt(form.neutral_days_accrued) || 0,
    });
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    const result = await createApp.mutateAsync({
      course_id: course?.id,
      course_name: course?.name || 'Custom Course',
      category: course?.category || 'professional',
      course_description: form.course_description || undefined,
      course_provider: form.course_provider || undefined,
      course_url: form.course_url || undefined,
      course_location: form.course_location || undefined,
      course_start_date: form.course_start_date || undefined,
      course_end_date: form.course_end_date || undefined,
      course_duration_days: durationDays || undefined,
      estimated_tuition_usd: tuition || undefined,
      estimated_travel_usd: travel || undefined,
      estimated_travel_route: form.estimated_travel_route || undefined,
      estimated_accommodation_usd: accommodation || undefined,
      estimated_accommodation_nights: nights || undefined,
      estimated_accommodation_nightly_rate: nightlyRate || undefined,
      estimated_food_per_diem_usd: foodPerDiem || undefined,
      estimated_total_usd: total || undefined,
      is_custom_course: !course,
      leave_days_accrued: parseInt(form.leave_days_accrued) || 0,
      neutral_days_accrued: parseInt(form.neutral_days_accrued) || 0,
    });
    if (result?.id) {
      await submitApp.mutateAsync(result.id);
    }
    onOpenChange(false);
  };

  const catConfig = course ? CATEGORY_CONFIG[course.category] : null;
  const isPending = createApp.isPending || submitApp.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Development Application</DialogTitle>
        </DialogHeader>

        {/* Course Info */}
        {course && (
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{course.name}</h3>
              {catConfig && (
                <Badge variant="outline" className={`${catConfig.bgClass} ${catConfig.textClass} border-0 text-xs`}>
                  {catConfig.label}
                </Badge>
              )}
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Tuition Fee</Label>
            <Input type="number" value={form.estimated_tuition_usd} onChange={(e) => update('estimated_tuition_usd', e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-2">
            <Label>Travel Cost</Label>
            <Input type="number" value={form.estimated_travel_usd} onChange={(e) => update('estimated_travel_usd', e.target.value)} placeholder="0" />
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
            <Label>Nightly Rate (max ${ACCOMMODATION_CAP_PER_NIGHT})</Label>
            <Input type="number" value={form.estimated_accommodation_nightly_rate} onChange={(e) => update('estimated_accommodation_nightly_rate', e.target.value)} max={ACCOMMODATION_CAP_PER_NIGHT} />
          </div>
          <div className="space-y-2">
            <Label>Food Per Diem</Label>
            <Input type="number" value={form.estimated_food_per_diem_usd} onChange={(e) => update('estimated_food_per_diem_usd', e.target.value)} />
          </div>
        </div>

        <Separator />

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
              <span>Over $4,000 — 50/50 split payment applies (50% upfront, 50% on completion)</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button variant="secondary" onClick={handleSaveDraft} disabled={isPending}>Save Draft</Button>
          <Button onClick={handleSubmit} disabled={isPending || total === 0}>Submit for Approval</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

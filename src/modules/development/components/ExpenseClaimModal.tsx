import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DollarSign, AlertTriangle, Upload } from 'lucide-react';
import { useSubmitExpense } from '@/modules/development/hooks/useDevelopmentMutations';
import { ACCOMMODATION_CAP_PER_NIGHT, PROFESSIONAL_THRESHOLD, CATEGORY_CONFIG, type DevCategory } from '@/modules/development/constants';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: any;
}

export default function ExpenseClaimModal({ open, onOpenChange, application }: Props) {
  const submitExpense = useSubmitExpense();

  const [form, setForm] = useState({
    actual_tuition_usd: String(application?.estimated_tuition_usd || ''),
    actual_travel_usd: String(application?.estimated_travel_usd || ''),
    actual_accommodation_nights: String(application?.estimated_accommodation_nights || ''),
    actual_accommodation_nightly_rate: String(application?.estimated_accommodation_nightly_rate || ACCOMMODATION_CAP_PER_NIGHT),
    actual_food_per_diem_usd: String(application?.estimated_food_per_diem_usd || ''),
  });

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const tuition = parseFloat(form.actual_tuition_usd) || 0;
  const travel = parseFloat(form.actual_travel_usd) || 0;
  const nights = parseInt(form.actual_accommodation_nights) || 0;
  const nightlyRate = Math.min(parseFloat(form.actual_accommodation_nightly_rate) || 0, ACCOMMODATION_CAP_PER_NIGHT);
  const accommodation = nights * nightlyRate;
  const durationDays = application?.course_duration_days || 0;
  const food = durationDays * (parseFloat(form.actual_food_per_diem_usd) || 0);
  const total = tuition + travel + accommodation + food;
  const isSplitPayment = total > PROFESSIONAL_THRESHOLD && application?.category === 'professional';

  const handleSubmit = async () => {
    if (!application) return;
    await submitExpense.mutateAsync({
      application_id: application.id,
      actual_tuition_usd: tuition || undefined,
      actual_travel_usd: travel || undefined,
      actual_accommodation_usd: accommodation || undefined,
      actual_accommodation_nights: nights || undefined,
      actual_accommodation_nightly_rate: nightlyRate || undefined,
      actual_food_per_diem_usd: parseFloat(form.actual_food_per_diem_usd) || undefined,
      actual_total_usd: total || undefined,
      is_split_payment: isSplitPayment,
    });
    onOpenChange(false);
  };

  if (!application) return null;

  const catConfig = CATEGORY_CONFIG[application.category as DevCategory];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Expense Claim</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border p-3">
          <h3 className="font-medium text-sm">{application.course_name}</h3>
          <div className="flex items-center gap-2 mt-1">
            {catConfig && (
              <Badge variant="outline" className={`${catConfig.bgClass} ${catConfig.textClass} border-0 text-xs`}>
                {catConfig.label}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{application.application_number}</span>
          </div>
        </div>

        <Separator />

        <h3 className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Actual Costs (USD)
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Tuition Fee</Label>
            <Input type="number" value={form.actual_tuition_usd} onChange={(e) => update('actual_tuition_usd', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Travel Cost</Label>
            <Input type="number" value={form.actual_travel_usd} onChange={(e) => update('actual_travel_usd', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Accommodation Nights</Label>
            <Input type="number" value={form.actual_accommodation_nights} onChange={(e) => update('actual_accommodation_nights', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Nightly Rate (max ${ACCOMMODATION_CAP_PER_NIGHT})</Label>
            <Input type="number" value={form.actual_accommodation_nightly_rate} onChange={(e) => update('actual_accommodation_nightly_rate', e.target.value)} max={ACCOMMODATION_CAP_PER_NIGHT} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Food Per Diem</Label>
            <Input type="number" value={form.actual_food_per_diem_usd} onChange={(e) => update('actual_food_per_diem_usd', e.target.value)} />
          </div>
        </div>

        {/* Upload reminder */}
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          <Upload className="h-6 w-6 mx-auto mb-2" />
          <p>Attach receipts after submitting via the application detail view</p>
        </div>

        {/* Summary */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          <div className="flex justify-between text-sm"><span>Tuition</span><span>${tuition.toLocaleString()}</span></div>
          <div className="flex justify-between text-sm"><span>Travel</span><span>${travel.toLocaleString()}</span></div>
          <div className="flex justify-between text-sm"><span>Accommodation ({nights} nights)</span><span>${accommodation.toLocaleString()}</span></div>
          <div className="flex justify-between text-sm"><span>Food ({durationDays} days)</span><span>${food.toLocaleString()}</span></div>
          <Separator />
          <div className="flex justify-between font-semibold"><span>Total Claim</span><span>${total.toLocaleString()}</span></div>
          {isSplitPayment && (
            <div className="flex items-center gap-2 text-amber text-sm">
              <AlertTriangle className="h-4 w-4" />
              50/50 split payment: ${(total / 2).toLocaleString()} on completion
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitExpense.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitExpense.isPending || total === 0}>Submit Claim</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

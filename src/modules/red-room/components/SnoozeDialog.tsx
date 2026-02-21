import React, { useState } from 'react';
import { Timer, Loader2, AlertCircle } from 'lucide-react';
import { useRedRoomStore } from '@/modules/red-room/store/redRoomStore';
import { SNOOZE_OPTIONS } from '@/modules/red-room/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { RedRoomItem } from '@/modules/red-room/types';

interface SnoozeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: RedRoomItem | null;
  onSuccess: (remainingSnoozes?: number) => void;
}

export function SnoozeDialog({ open, onOpenChange, item, onSuccess }: SnoozeDialogProps) {
  const { snoozeItem } = useRedRoomStore();
  
  const [selectedHours, setSelectedHours] = useState<number>(4);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remainingSnoozes = item ? 3 - item.snooze_count : 0;

  async function handleSubmit() {
    if (!item) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await snoozeItem(item.id, selectedHours, reason || undefined);
      
      if (result.success) {
        onSuccess(result.remainingSnoozes);
        setSelectedHours(4);
        setReason('');
      } else {
        setError(result.error || 'Failed to snooze');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setError(null);
      setReason('');
      setSelectedHours(4);
    }
    onOpenChange(newOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-amber-500" />
            Snooze Alert
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {item?.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Remaining snoozes warning */}
          {remainingSnoozes <= 1 && (
            <Alert variant={remainingSnoozes === 0 ? 'destructive' : 'default'} className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {remainingSnoozes === 0 
                  ? 'No snoozes remaining. Please address this alert.'
                  : `Only ${remainingSnoozes} snooze remaining. Please address this alert soon.`
                }
              </AlertDescription>
            </Alert>
          )}

          {/* Snooze Duration */}
          <div className="space-y-2">
            <Label>Snooze for</Label>
            <RadioGroup
              value={String(selectedHours)}
              onValueChange={(v) => setSelectedHours(Number(v))}
              className="grid grid-cols-2 gap-2"
            >
              {SNOOZE_OPTIONS.map((option) => (
                <div key={option.hours} className="flex items-center">
                  <RadioGroupItem
                    value={String(option.hours)}
                    id={`snooze-${option.hours}`}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`snooze-${option.hours}`}
                    className="flex-1 cursor-pointer rounded-lg border-2 border-muted bg-popover p-3 text-center hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 [&:has([data-state=checked])]:border-primary"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="snooze-reason">Reason (optional)</Label>
            <Textarea
              id="snooze-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you snoozing this alert?"
              rows={2}
            />
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || remainingSnoozes === 0}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Snooze for {selectedHours} hour{selectedHours > 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SnoozeDialog;

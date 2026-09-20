import React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { painLabel, painTone } from '@/modules/health/hooks/usePhysio';
import { badgeToneClass } from '@/modules/health/lib/format';

interface PainScoreFieldProps {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  description?: string;
}

/**
 * The 0 to 10 numeric rating scale. Null is a real answer here, so the field
 * keeps a way back to "not recorded" rather than defaulting a score of zero
 * onto someone who was never asked.
 */
export const PainScoreField: React.FC<PainScoreFieldProps> = ({
  id,
  label,
  value,
  onChange,
  disabled,
  description,
}) => (
  <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-medium',
            value === null ? badgeToneClass.default : badgeToneClass[painTone(value)],
          )}
        >
          {value === null ? 'Not recorded' : `${value}/10 · ${painLabel(value)}`}
        </span>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onChange(value === null ? 0 : null)}
          >
            {value === null ? 'Add a score' : 'Clear'}
          </Button>
        )}
      </div>
    </div>
    <Slider
      id={id}
      min={0}
      max={10}
      step={1}
      disabled={disabled || value === null}
      value={[value ?? 0]}
      onValueChange={(next) => onChange(next[0] ?? 0)}
      aria-label={label}
    />
    <div className="flex justify-between text-[11px] text-muted-foreground">
      <span>0 no pain</span>
      <span>10 worst imaginable</span>
    </div>
    {description && <p className="text-xs text-muted-foreground">{description}</p>}
  </div>
);

export default PainScoreField;

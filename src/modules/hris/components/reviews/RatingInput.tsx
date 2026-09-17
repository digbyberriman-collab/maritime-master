import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RATING_SCALE, ratingLabel } from '@/modules/hris/lib/reviews';

interface RatingInputProps {
  value: number | null;
  onChange?: (value: number | null) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

/** Five-point rating as a row of stars; clicking the current value clears it. Read-only when no onChange. */
export const RatingInput: React.FC<RatingInputProps> = ({ value, onChange, disabled, size = 'md', className, 'aria-label': ariaLabel }) => {
  const readOnly = !onChange || disabled;
  const dim = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <TooltipProvider delayDuration={200}>
      <div role="radiogroup" aria-label={ariaLabel ?? 'Rating'} className={cn('flex items-center gap-0.5', className)}>
        {RATING_SCALE.map((step) => {
          const active = value !== null && step.value <= value;
          return (
            <Tooltip key={step.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={value === step.value}
                  aria-label={`${step.value} – ${step.label}`}
                  disabled={readOnly}
                  onClick={() => onChange?.(value === step.value ? null : step.value)}
                  className={cn(
                    'rounded-sm p-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    readOnly ? 'cursor-default' : 'hover:text-yellow-500',
                    active ? 'text-yellow-500' : 'text-muted-foreground/40',
                  )}
                >
                  <Star className={cn(dim, active && 'fill-current')} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{step.value} · {step.label}</TooltipContent>
            </Tooltip>
          );
        })}
        <span className={cn('ml-2 text-xs text-muted-foreground', size === 'sm' && 'hidden sm:inline')}>{value === null ? '—' : `${value} · ${ratingLabel(value)}`}</span>
      </div>
    </TooltipProvider>
  );
};

export default RatingInput;

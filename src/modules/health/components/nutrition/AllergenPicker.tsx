import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { COMMON_ALLERGENS } from '@/modules/health/hooks/useNutrition';

interface AllergenPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
  description?: string;
  /** Suggestions to offer as one-tap chips. */
  options?: readonly string[];
  id?: string;
}

/** Chips for the declarable allergens, plus a box for anything else. */
export const AllergenPicker: React.FC<AllergenPickerProps> = ({
  value,
  onChange,
  label = 'Allergens',
  description = 'Tick everything the dish contains. The galley and the spa read this.',
  options = COMMON_ALLERGENS,
  id = 'allergen-picker',
}) => {
  const [custom, setCustom] = useState('');

  const toggle = (allergen: string) => {
    onChange(
      value.includes(allergen) ? value.filter((a) => a !== allergen) : [...value, allergen],
    );
  };

  const addCustom = () => {
    const trimmed = custom.trim();
    if (!trimmed || value.includes(trimmed)) {
      setCustom('');
      return;
    }
    onChange([...value, trimmed]);
    setCustom('');
  };

  const extras = value.filter((a) => !options.includes(a));

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((allergen) => {
          const on = value.includes(allergen);
          return (
            <button
              key={allergen}
              type="button"
              onClick={() => toggle(allergen)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                on
                  ? 'border-warning/30 bg-warning/10 text-warning'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent',
              )}
              aria-pressed={on}
            >
              {allergen}
            </button>
          );
        })}
      </div>

      {extras.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {extras.map((allergen) => (
            <Badge key={allergen} variant="outline" className="gap-1 text-[10px]">
              {allergen}
              <button type="button" onClick={() => toggle(allergen)} aria-label={`Remove ${allergen}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Input
          id={id}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Something else"
        />
        <Button type="button" variant="outline" size="icon" onClick={addCustom} aria-label="Add allergen">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default AllergenPicker;

/**
 * Searchable country picker (X1-01; gap/04 C71, improvement 14): ISO 3166-1
 * countries with flag, as a country, a nationality (demonym) or a dial code
 * (+44). Value: the alpha-2 code. Search matches the name, the demonym, both
 * codes and the dial code. Used by the profile, contact and document forms
 * of later slices.
 *
 * D-01: while ref_countries is not set up it is a plain text field (the
 * legacy free-text nationality keeps working); a load error shows a Retry.
 */
import * as React from 'react';
import { Check, ChevronsUpDown, Globe, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useCountries } from '../hooks/useReferenceData';
import type { Country } from '../types/domain';

export type CountrySelectMode = 'country' | 'nationality' | 'dialCode';

export interface CountrySelectProps {
  value: string | null;
  onChange: (iso2: string | null, country: Country | null) => void;
  /** Accessible name ("Nationality", "Country of residence", "Mobile dial code"). */
  label: string;
  mode?: CountrySelectMode;
  placeholder?: string;
  disabled?: boolean;
  /** Free-text fallback while the list is not set up (D-01). */
  freeText?: string;
  onFreeTextChange?: (text: string) => void;
  className?: string;
  id?: string;
}

/** What the trigger and the option show in each mode. */
function countryText(country: Country, mode: CountrySelectMode): string {
  if (mode === 'nationality') return country.demonym ?? country.name;
  if (mode === 'dialCode') return country.dialCode ? `+${country.dialCode} ${country.name}` : country.name;
  return country.name;
}

const PLACEHOLDER: Record<CountrySelectMode, string> = {
  country: 'Choose a country',
  nationality: 'Choose a nationality',
  dialCode: 'Dial code',
};

export function CountrySelect({
  value,
  onChange,
  label,
  mode = 'country',
  placeholder,
  disabled,
  freeText = '',
  onFreeTextChange,
  className,
  id,
}: CountrySelectProps) {
  const [open, setOpen] = React.useState(false);
  const countries = useCountries();
  const options = React.useMemo(
    () => (mode === 'dialCode' ? countries.items.filter((c) => c.dialCode) : countries.items),
    [countries.items, mode],
  );
  const selected = React.useMemo(() => countries.items.find((c) => c.iso2 === value) ?? null, [countries.items, value]);

  if (countries.status === 'missing') {
    return (
      <Input
        id={id}
        aria-label={label}
        value={freeText}
        onChange={(event) => onFreeTextChange?.(event.target.value)}
        placeholder={mode === 'nationality' ? 'Type the nationality' : 'Type the country'}
        disabled={disabled}
        maxLength={80}
        className={className}
      />
    );
  }

  if (countries.status === 'error') {
    return (
      <Button type="button" variant="outline" onClick={countries.retry} className={cn('w-full justify-start', className)} aria-label={`${label}: the list could not load. Try again`}>
        <RotateCw aria-hidden="true" className="mr-2 h-4 w-4" />
        Countries could not load. Try again
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          aria-busy={countries.status === 'loading' || undefined}
          disabled={disabled || countries.status === 'loading'}
          className={cn('w-full min-w-0 justify-between font-normal', className)}
        >
          <span className={cn('flex min-w-0 items-center gap-2', !selected && 'text-muted-foreground')}>
            {selected?.flagEmoji ? <span aria-hidden="true">{selected.flagEmoji}</span> : <Globe aria-hidden="true" className="h-4 w-4 shrink-0" />}
            <span className="truncate">
              {countries.status === 'loading' ? 'Loading countries…' : selected ? countryText(selected, mode) : placeholder ?? PLACEHOLDER[mode]}
            </span>
          </span>
          <ChevronsUpDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[min(20rem,calc(100vw-2rem))] p-0" align="start">
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder={mode === 'dialCode' ? 'Search country or code' : 'Search countries'} />
          <CommandList>
            <CommandEmpty>No country matches.</CommandEmpty>
            <CommandGroup>
              {options.map((c) => (
                <CommandItem
                  key={c.iso2}
                  value={`${c.name} ${c.sortName} ${c.demonym ?? ''} ${c.iso2} ${c.iso3} ${c.dialCode ? `+${c.dialCode}` : ''}`}
                  onSelect={() => {
                    const next = c.iso2 === value ? null : c;
                    onChange(next?.iso2 ?? null, next);
                    setOpen(false);
                  }}
                >
                  <Check aria-hidden="true" className={cn('mr-2 h-4 w-4 shrink-0', value === c.iso2 ? 'opacity-100' : 'opacity-0')} />
                  {c.flagEmoji ? <span aria-hidden="true" className="mr-2">{c.flagEmoji}</span> : null}
                  <span className="min-w-0 flex-1 truncate">{countryText(c, mode)}</span>
                  {mode === 'nationality' && c.demonym ? <span className="ml-2 shrink-0 text-xs text-muted-foreground">{c.name}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default CountrySelect;

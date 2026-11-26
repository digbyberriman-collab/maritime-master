/**
 * Searchable language picker (X1-01; gap/04 C71): ISO 639 languages,
 * English first. Value: the language code. The proficiency scale (Basic,
 * Conversational, Advanced, Fluent) belongs to the profile's languages
 * card (X1-03), which pairs this picker with it.
 *
 * D-01: while ref_languages is not set up it is a plain text field; a load
 * error shows a Retry.
 */
import * as React from 'react';
import { Check, ChevronsUpDown, Languages, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useLanguages } from '../hooks/useReferenceData';
import type { Language } from '../types/domain';

export interface LanguageSelectProps {
  value: string | null;
  onChange: (code: string | null, language: Language | null) => void;
  /** Accessible name ("First language", "Second language"). */
  label: string;
  placeholder?: string;
  disabled?: boolean;
  /** Codes already chosen elsewhere on the form, left out of the list. */
  exclude?: readonly string[];
  freeText?: string;
  onFreeTextChange?: (text: string) => void;
  className?: string;
  id?: string;
}

export function LanguageSelect({
  value,
  onChange,
  label,
  placeholder = 'Choose a language',
  disabled,
  exclude = [],
  freeText = '',
  onFreeTextChange,
  className,
  id,
}: LanguageSelectProps) {
  const [open, setOpen] = React.useState(false);
  const languages = useLanguages();
  const options = React.useMemo(
    () => languages.items.filter((l) => l.code === value || !exclude.includes(l.code)),
    [languages.items, exclude, value],
  );
  const selected = React.useMemo(() => languages.items.find((l) => l.code === value) ?? null, [languages.items, value]);

  if (languages.status === 'missing') {
    return (
      <Input
        id={id}
        aria-label={label}
        value={freeText}
        onChange={(event) => onFreeTextChange?.(event.target.value)}
        placeholder="Type the language"
        disabled={disabled}
        maxLength={60}
        className={className}
      />
    );
  }

  if (languages.status === 'error') {
    return (
      <Button type="button" variant="outline" onClick={languages.retry} className={cn('w-full justify-start', className)} aria-label={`${label}: the list could not load. Try again`}>
        <RotateCw aria-hidden="true" className="mr-2 h-4 w-4" />
        Languages could not load. Try again
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
          aria-busy={languages.status === 'loading' || undefined}
          disabled={disabled || languages.status === 'loading'}
          className={cn('w-full min-w-0 justify-between font-normal', className)}
        >
          <span className={cn('flex min-w-0 items-center gap-2', !selected && 'text-muted-foreground')}>
            <Languages aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="truncate">{languages.status === 'loading' ? 'Loading languages…' : selected ? selected.name : placeholder}</span>
          </span>
          <ChevronsUpDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[min(16rem,calc(100vw-2rem))] p-0" align="start">
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search languages" />
          <CommandList>
            <CommandEmpty>No language matches.</CommandEmpty>
            <CommandGroup>
              {options.map((l) => (
                <CommandItem
                  key={l.code}
                  value={`${l.name} ${l.code}`}
                  onSelect={() => {
                    const next = l.code === value ? null : l;
                    onChange(next?.code ?? null, next);
                    setOpen(false);
                  }}
                >
                  <Check aria-hidden="true" className={cn('mr-2 h-4 w-4 shrink-0', value === l.code ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default LanguageSelect;

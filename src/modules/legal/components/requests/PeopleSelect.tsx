import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { personInitials, type PersonLite } from '@/modules/legal/lib/people';

export interface PeopleSelectOption extends PersonLite {
  /** Value returned by onChange (auth user id or profile id, caller's choice). */
  key: string;
  displayName: string;
  subtitle?: string | null;
  badge?: string | null;
}

interface PeopleSelectProps {
  value: string | null;
  options: PeopleSelectOption[];
  onChange: (key: string | null, option: PeopleSelectOption | null) => void;
  placeholder?: string;
  emptyText?: string;
  isLoading?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
}

/** Searchable person picker (assignment, crew reference, "filed for"). */
export const PeopleSelect: React.FC<PeopleSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Select a person',
  emptyText = 'No one found.',
  isLoading,
  disabled,
  clearable = true,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((o) => o.key === value) ?? null, [options, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className={cn('w-full justify-between font-normal', className)}>
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={selected.avatar_url ?? undefined} alt="" />
                <AvatarFallback className="text-[10px]">{personInitials(selected)}</AvatarFallback>
              </Avatar>
              <span className="truncate">{selected.displayName}</span>
              {selected.subtitle && <span className="truncate text-xs text-muted-foreground">· {selected.subtitle}</span>}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <UserRound className="h-4 w-4" />
              {isLoading ? 'Loading…' : placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[300px] p-0" align="start">
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search by name, rank or email…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {clearable && value && (
                <CommandItem
                  value="__clear"
                  onSelect={() => {
                    onChange(null, null);
                    setOpen(false);
                  }}
                >
                  <X className="mr-2 h-4 w-4" /> Clear selection
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.key}
                  value={`${o.displayName} ${o.rank ?? ''} ${o.position ?? ''} ${o.email ?? ''}`}
                  onSelect={() => {
                    onChange(o.key, o);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === o.key ? 'opacity-100' : 'opacity-0')} />
                  <Avatar className="mr-2 h-6 w-6">
                    <AvatarImage src={o.avatar_url ?? undefined} alt="" />
                    <AvatarFallback className="text-[10px]">{personInitials(o)}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{o.displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">{o.subtitle ?? o.email ?? ''}</span>
                  </span>
                  {o.badge && <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">{o.badge}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default PeopleSelect;
